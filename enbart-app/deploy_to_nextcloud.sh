#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ID="${APP_ID:-booked_events_widget}"
CONTAINER_NAME="${CONTAINER_NAME:-nextcloud}"
APP_SOURCE_DIR="${APP_SOURCE_DIR:-$SCRIPT_DIR/$APP_ID}"
TARGET_APPS_DIR="${TARGET_APPS_DIR:-/var/www/html/custom_apps}"
OCC_USER="${OCC_USER:-www-data}"
APP_TARGET_DIR="$TARGET_APPS_DIR/$APP_ID"
TARGET_EVENTS_FILE="$APP_TARGET_DIR/data/events.json"
REFRESH_API_AFTER_DEPLOY="${REFRESH_API_AFTER_DEPLOY:-1}"

if [[ ! -d "$APP_SOURCE_DIR" ]]; then
	echo "Kunde inte hitta appmappen: $APP_SOURCE_DIR" >&2
	exit 1
fi

echo "Deployar $APP_ID till container $CONTAINER_NAME..."
echo "Källa: $APP_SOURCE_DIR"
echo "Mål: $APP_TARGET_DIR"

TMP_EVENTS_FILE="/tmp/${APP_ID}_events.json"

if docker exec "$CONTAINER_NAME" test -f "$TARGET_EVENTS_FILE"; then
	echo "Bevarar befintlig events.json från containern..."
	docker exec "$CONTAINER_NAME" cp "$TARGET_EVENTS_FILE" "$TMP_EVENTS_FILE"
fi

docker exec "$CONTAINER_NAME" rm -rf "$APP_TARGET_DIR"
docker cp "$APP_SOURCE_DIR" "$CONTAINER_NAME:$TARGET_APPS_DIR/"

if docker exec "$CONTAINER_NAME" test -f "$TMP_EVENTS_FILE"; then
	echo "Återställer tidigare events.json efter deploy..."
	docker exec "$CONTAINER_NAME" mkdir -p "$APP_TARGET_DIR/data"
	docker exec "$CONTAINER_NAME" mv "$TMP_EVENTS_FILE" "$TARGET_EVENTS_FILE"
fi

docker exec "$CONTAINER_NAME" chown -R "$OCC_USER:$OCC_USER" "$APP_TARGET_DIR"
docker exec -u "$OCC_USER" "$CONTAINER_NAME" php occ app:enable "$APP_ID"

if [[ "$REFRESH_API_AFTER_DEPLOY" == "1" ]]; then
	echo "Kör API-import efter deploy..."
	docker exec -u "$OCC_USER" "$CONTAINER_NAME" /bin/bash -lc "cd '$APP_TARGET_DIR' && /bin/bash getevent.sh '$TARGET_EVENTS_FILE'"
fi

echo "Klart."
echo "Verifiera gärna med:"
echo "docker exec -u $OCC_USER $CONTAINER_NAME php occ app:list | grep $APP_ID"
