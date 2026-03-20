#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ID="${APP_ID:-booked_events_widget}"
CONTAINER_NAME="${CONTAINER_NAME:-nextcloud}"
APP_SOURCE_DIR="${APP_SOURCE_DIR:-$SCRIPT_DIR/export/$APP_ID}"
TARGET_APPS_DIR="${TARGET_APPS_DIR:-/var/www/html/custom_apps}"
OCC_USER="${OCC_USER:-www-data}"

if [[ ! -d "$APP_SOURCE_DIR" ]]; then
	echo "Kunde inte hitta appmappen: $APP_SOURCE_DIR" >&2
	exit 1
fi

echo "Deployar $APP_ID till container $CONTAINER_NAME..."
echo "Källa: $APP_SOURCE_DIR"
echo "Mål: $TARGET_APPS_DIR/$APP_ID"

docker exec "$CONTAINER_NAME" rm -rf "$TARGET_APPS_DIR/$APP_ID"
docker cp "$APP_SOURCE_DIR" "$CONTAINER_NAME:$TARGET_APPS_DIR/"
docker exec -u "$OCC_USER" "$CONTAINER_NAME" php occ app:enable "$APP_ID"

echo "Klart."
echo "Verifiera gärna med:"
echo "docker exec -u $OCC_USER $CONTAINER_NAME php occ app:list | grep $APP_ID"
