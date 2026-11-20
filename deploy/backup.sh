#!/usr/bin/env bash
# The database and the photos, side by side under one timestamp (PLAN 17).
#   daily/carservice-<stamp>.dump      the database (pg_dump, custom format)
#   daily/carservice-<stamp>.uploads/  the photos as they were at that moment
# Photos never change once written (random names), so each night's copy is made of hard links to
# the night before, and only the new photos take disk space: thirty nights of a 1 GB folder cost
# about 1 GB, not 30. Daily copies stay DAILY_DAYS days; the first of each month also stays under
# monthly/ for MONTHLY_DAYS days. With BACKUP_REMOTE set, everything is copied off the server too.
# Cron, every night at 03:00 (/etc/cron.d/car-service):
#   0 3 * * * carservice /usr/bin/bash /opt/car-service/deploy/backup.sh 2>&1 | logger -t car-service-backup
# To bring one back: deploy/restore.sh
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/car-service.env}"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

BACKUP_DIR="${BACKUP_DIR:-/var/backups/car-service}"
DAILY_DAYS="${DAILY_DAYS:-30}"
MONTHLY_DAYS="${MONTHLY_DAYS:-370}"

# Clients' names and phone numbers are in here: nobody else on the server may read them.
umask 077
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/monthly"
stamp="$(date +%F_%H%M%S)"
db_file="$BACKUP_DIR/daily/carservice-$stamp.dump"
uploads_copy="$BACKUP_DIR/daily/carservice-$stamp.uploads"

# Under a temporary name until complete, so that a half-written copy can never be mistaken for a
# backup, nor push a good one out. pg_restore --list proves the file can be read back.
pg_dump --format=custom --no-owner --file="$db_file.part" "$DATABASE_URL"
pg_restore --list "$db_file.part" >/dev/null
mv "$db_file.part" "$db_file"

if [ -d "${UPLOADS_DIR:-}" ]; then
  rm -rf "$uploads_copy.part"
  previous="$(find "$BACKUP_DIR/daily" -maxdepth 1 -type d -name 'carservice-*.uploads' | sort | tail -n 1)"
  if [ -n "$previous" ]; then
    # Last night's photos as links (no space), then whatever is new since.
    cp -al "$previous" "$uploads_copy.part"
  else
    mkdir -p "$uploads_copy.part"
  fi
  # -u: a photo already there is not copied again (same file, same time: it cannot have changed).
  # Not -n, whose meaning changed between coreutils 8 and 9.
  cp -au "$UPLOADS_DIR/." "$uploads_copy.part/"
  source_count="$(find "$UPLOADS_DIR" -type f | wc -l)"
  copy_count="$(find "$uploads_copy.part" -type f | wc -l)"
  # The copy may also keep photos removed since (a master took one again): never fewer.
  if [ "$copy_count" -lt "$source_count" ]; then
    echo "photo copy incomplete: $copy_count of $source_count" >&2
    exit 1
  fi
  mv "$uploads_copy.part" "$uploads_copy"
fi

# The month's first backup is kept for a year; hard links cost no space.
month="$(date +%Y-%m)"
if ! ls "$BACKUP_DIR/monthly/carservice-$month-"*.dump >/dev/null 2>&1; then
  ln "$db_file" "$BACKUP_DIR/monthly/"
  [ -d "$uploads_copy" ] && cp -al "$uploads_copy" "$BACKUP_DIR/monthly/"
fi

# Old copies go by the date in their name, not by file times (a copied folder keeps the photos'
# own, older times). A photo still linked from a newer copy keeps its space until that one goes.
prune() {
  local dir="$1" days="$2" cutoff entry day
  cutoff="$(date -d "-$days days" +%F)"
  for entry in "$dir"/carservice-*; do
    [ -e "$entry" ] || continue
    day="$(basename "$entry" | cut -c12-21)"
    if [[ "$day" < "$cutoff" ]]; then rm -rf "$entry"; fi
  done
}
prune "$BACKUP_DIR/daily" "$DAILY_DAYS"
prune "$BACKUP_DIR/monthly" "$MONTHLY_DAYS"

# Off the server: a disk that dies takes its backups with it. -H keeps the hard links, so the
# remote copy is as small as this one. Deleted copies are not mirrored, so a mistake here can never
# wipe the remote ones (needs rsync and an SSH key for the carservice user).
if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -aH "$BACKUP_DIR/" "$BACKUP_REMOTE"
fi

echo "$(date -Is) backup written: $db_file"
