#!/usr/bin/env bash
# Brings a backup back (PLAN 17). Two ways:
#
#   deploy/restore.sh /var/backups/car-service/daily/carservice-2026-11-20_030001.dump
#     replaces the working database and photos; the service is stopped meanwhile.
#
#   CHECK_DATABASE_URL=postgres://.../carservice_restore_check deploy/restore.sh <file.dump>
#     the quarterly test: restores into that separate, empty database and counts the rows of the
#     main tables. The service, its database and its photos are not touched.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/car-service.env}"
# Empty means nothing to stop or start.
SERVICE="${SERVICE-car-service}"

db_file="${1:-}"
if [ ! -f "$db_file" ]; then
  echo "Usage: $0 <carservice-....dump>" >&2
  exit 1
fi
uploads_file="${db_file%.dump}.uploads.tar.gz"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

# A damaged file must be found out before anything has been touched.
pg_restore --list "$db_file" >/dev/null
[ -f "$uploads_file" ] && gzip --test "$uploads_file"

if [ -n "${CHECK_DATABASE_URL:-}" ]; then
  if [ "$CHECK_DATABASE_URL" = "$DATABASE_URL" ]; then
    echo "CHECK_DATABASE_URL must be another database, not the working one." >&2
    exit 1
  fi
  pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error \
    --dbname="$CHECK_DATABASE_URL" "$db_file"
  psql "$CHECK_DATABASE_URL" --no-psqlrc --tuples-only --command "
    select 'orders ' || count(*) from orders
    union all select 'payments ' || count(*) from payments
    union all select 'users ' || count(*) from users
    union all select 'media ' || count(*) from media
    union all select 'migrations ' || count(*) from drizzle.__drizzle_migrations"
  if [ -f "$uploads_file" ]; then
    echo "photos in the archive: $(tar -tzf "$uploads_file" | grep -c -v '/$')"
  fi
  echo "$(date -Is) restore check passed: $db_file"
  exit 0
fi

echo "This replaces the working database with: $db_file"
[ -f "$uploads_file" ] && echo "and the photos with: $uploads_file"
if [ "${ASSUME_YES:-}" != "1" ]; then
  read -r -p "Type yes to go on: " answer
  [ "$answer" = "yes" ] || { echo "Nothing was changed."; exit 1; }
fi

if [ -n "$SERVICE" ]; then
  sudo systemctl stop "$SERVICE"
  # Whatever happens from here on, do not leave the service down without saying so.
  trap 'echo "The service is still stopped: sudo systemctl start $SERVICE" >&2' ERR
fi

# One transaction: if anything fails, the database stays exactly as it was.
pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error \
  --dbname="$DATABASE_URL" "$db_file"

if [ -f "$uploads_file" ] && [ -n "${UPLOADS_DIR:-}" ]; then
  # Unpacked beside the old photos first, and swapped in only once that has worked.
  fresh="$UPLOADS_DIR.restoring"
  rm -rf "$fresh"
  mkdir -p "$fresh"
  tar -xzf "$uploads_file" -C "$fresh"
  rm -rf "$UPLOADS_DIR"
  mv "$fresh" "$UPLOADS_DIR"
fi

if [ -n "$SERVICE" ]; then
  trap - ERR
  sudo systemctl start "$SERVICE"
fi
echo "$(date -Is) restored: $db_file"
