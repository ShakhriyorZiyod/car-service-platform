#!/usr/bin/env bash
# Updates the running installation, as the service's own user (docs/DEPLOY.md, "Yangilash"):
#   sudo -u carservice bash /opt/car-service/deploy/deploy.sh
# Order: a backup, the new code, the build, the migrations, a restart, and a health check.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/car-service}"
ENV_FILE="${ENV_FILE:-/etc/car-service.env}"
# Empty means nothing to restart (a dry run on a copy).
SERVICE="${SERVICE-car-service}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-60}"
# Node.js 24 in its own directory, the same one the systemd unit runs.
export PATH="${NODE_DIR:-/opt/node-24/bin}:$PATH"

# In one function, so that bash has read all of it before `git pull` replaces this very file.
main() {
  cd "$APP_DIR"

  # Taken before anything changes: this is the way back if the new version turns out wrong.
  bash deploy/backup.sh

  git pull --ff-only
  # Before the environment is loaded: with NODE_ENV=production npm would skip the build tools,
  # and the migrations run with tsx. At a low priority: the server may serve other sites too.
  nice -n 10 npm ci
  # Anything that fails up to here leaves the running service as it was.
  nice -n 10 npm run build
  npm run check:bundle

  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  # Migrations only add (PLAN 7.1); the old code keeps working until the restart.
  npm run db:migrate

  if [ -n "$SERVICE" ]; then
    sudo systemctl restart "$SERVICE"
  fi
  wait_until_healthy

  echo "$(date -Is) deployed $(git rev-parse --short HEAD)"
  echo "Logs: journalctl -u ${SERVICE:-car-service} -f"
}

# The bot connects to Telegram before the HTTP server starts (src/main.ts), so give it time.
wait_until_healthy() {
  local url="http://127.0.0.1:${HTTP_PORT:-3000}/health"
  for _ in $(seq 1 "$HEALTH_WAIT_SECONDS"); do
    if curl --silent --fail --max-time 2 "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "The service did not come back: journalctl -u ${SERVICE:-car-service} -n 50" >&2
  return 1
}

main "$@"
