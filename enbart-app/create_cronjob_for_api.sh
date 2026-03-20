#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR/booked_events_widget}"
GETEVENT_SCRIPT="${GETEVENT_SCRIPT:-$APP_DIR/getevent.sh}"
OUT_FILE="${OUT_FILE:-$APP_DIR/data/api_events.json}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/booked_events_widget_api_cron.log}"
EVENT_SOURCE_URL="${EVENT_SOURCE_URL:-https://ambitionsverige.se/wp-json/amb/v1/events}"
CRON_MARKER="booked_events_widget_api_sync"
USE_DOCKER="${USE_DOCKER:-1}"
CONTAINER_NAME="${CONTAINER_NAME:-nextcloud}"
OCC_USER="${OCC_USER:-www-data}"
TARGET_APP_DIR="${TARGET_APP_DIR:-/var/www/html/custom_apps/booked_events_widget}"
TARGET_EVENTS_FILE="${TARGET_EVENTS_FILE:-$TARGET_APP_DIR/data/api_events.json}"

if ! command -v crontab >/dev/null 2>&1; then
	echo "Kunde inte hitta kommandot 'crontab'." >&2
	exit 1
fi

if [[ "$USE_DOCKER" != "1" && ! -f "$GETEVENT_SCRIPT" ]]; then
	echo "Kunde inte hitta skript: $GETEVENT_SCRIPT" >&2
	exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")" "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

if [[ "$USE_DOCKER" == "1" ]]; then
	if ! command -v docker >/dev/null 2>&1; then
		echo "Kunde inte hitta kommandot 'docker'." >&2
		exit 1
	fi
	printf -v CRON_LINE '*/5 * * * * docker exec -u %q %q /bin/bash -lc %q >> %q 2>&1 # %s' \
		"$OCC_USER" \
		"$CONTAINER_NAME" \
		"cd '$TARGET_APP_DIR' && EVENT_SOURCE_URL='$EVENT_SOURCE_URL' /bin/bash getevent.sh '$TARGET_EVENTS_FILE'" \
		"$LOG_FILE" \
		"$CRON_MARKER"
else
	printf -v BASH_COMMAND '%q' "cd $APP_DIR && EVENT_SOURCE_URL='$EVENT_SOURCE_URL' /bin/bash $(basename "$GETEVENT_SCRIPT") $OUT_FILE >> $LOG_FILE 2>&1"
	printf -v CRON_LINE '*/5 * * * * /bin/bash -lc %s # %s' "$BASH_COMMAND" "$CRON_MARKER"
fi

CURRENT_CRONTAB="$(mktemp)"
UPDATED_CRONTAB="$(mktemp)"

cleanup() {
	rm -f "$CURRENT_CRONTAB" "$UPDATED_CRONTAB"
}

trap cleanup EXIT

crontab -l >"$CURRENT_CRONTAB" 2>/dev/null || true
grep -v "$CRON_MARKER" "$CURRENT_CRONTAB" >"$UPDATED_CRONTAB" || true
printf '%s\n' "$CRON_LINE" >>"$UPDATED_CRONTAB"
crontab "$UPDATED_CRONTAB"

echo "Cronjob installerat/uppdaterat."
echo "Kör var 5:e minut."
echo "API-URL: $EVENT_SOURCE_URL"
if [[ "$USE_DOCKER" == "1" ]]; then
	echo "Docker-container: $CONTAINER_NAME"
	echo "Output i container: $TARGET_EVENTS_FILE"
else
	echo "Output: $OUT_FILE"
fi
echo "Logg: $LOG_FILE"
