#!/usr/bin/env bash
# The database and the photos, side by side under one timestamp (PLAN 17).
# Daily copies stay 30 days; the first one of each month is also kept under monthly/ for a year.
# With BACKUP_REMOTE set, the whole directory is copied off the server too.
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
uploads_file="$BACKUP_DIR/daily/carservice-$stamp.uploads.tar.gz"

# Under a temporary name until complete, so that a half-written file can never be mistaken for a
# backup, nor push a good one out. pg_restore --list proves the file can be read back.
pg_dump --format=custom --no-owner --file="$db_file.part" "$DATABASE_URL"
pg_restore --list "$db_file.part" >/dev/null
mv "$db_file.part" "$db_file"

if [ -d "${UPLOADS_DIR:-}" ]; then
  tar -czf "$uploads_file.part" -C "$UPLOADS_DIR" .
  gzip --test "$uploads_file.part"
  mv "$uploads_file.part" "$uploads_file"
fi

# The month's first backup is kept for a year; hard links cost no space.
month="$(date +%Y-%m)"
if ! ls "$BACKUP_DIR/monthly/carservice-$month-"*.dump >/dev/null 2>&1; then
  ln "$db_file" "$BACKUP_DIR/monthly/"
  [ -f "$uploads_file" ] && ln "$uploads_file" "$BACKUP_DIR/monthly/"
fi

find "$BACKUP_DIR/daily" -name 'carservice-*' -mtime +"$DAILY_DAYS" -delete
find "$BACKUP_DIR/monthly" -name 'carservice-*' -mtime +"$MONTHLY_DAYS" -delete

# Off the server: a disk that dies takes its backups with it. Deleted files are not mirrored, so a
# mistake here can never wipe the remote copies.
if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a "$BACKUP_DIR/" "$BACKUP_REMOTE"
fi

echo "$(date -Is) backup written: $db_file"
