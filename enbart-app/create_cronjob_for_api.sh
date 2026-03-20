#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR/booked_events_widget}"
GETEVENT_SCRIPT="${GETEVENT_SCRIPT:-$APP_DIR/getevent.sh}"
OUT_FILE="${OUT_FILE:-$APP_DIR/data/events.json}"
LOG_FILE="${LOG_FILE:-$SCRIPT_DIR/booked_events_widget_api_cron.log}"
EVENT_SOURCE_URL="${EVENT_SOURCE_URL:-https://ambitionsverige.se/wp-json/amb/v1/events}"
CRON_MARKER="booked_events_widget_api_sync"

if ! command -v crontab >/dev/null 2>&1; then
	echo "Kunde inte hitta kommandot 'crontab'." >&2
	exit 1
fi

if [[ ! -f "$GETEVENT_SCRIPT" ]]; then
	echo "Kunde inte hitta skript: $GETEVENT_SCRIPT" >&2
	exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"
touch "$LOG_FILE"

printf -v BASH_COMMAND '%q' "cd $APP_DIR && /bin/bash $(basename "$GETEVENT_SCRIPT") $OUT_FILE >> $LOG_FILE 2>&1"
printf -v CRON_LINE '*/5 * * * * EVENT_SOURCE_URL=%q /bin/bash -lc %s # %s' "$EVENT_SOURCE_URL" "$BASH_COMMAND" "$CRON_MARKER"

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
echo "Output: $OUT_FILE"
echo "Logg: $LOG_FILE"
