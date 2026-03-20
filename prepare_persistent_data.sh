#!/usr/bin/env bash
set -euo pipefail

PERSISTENT_DATA_ROOT="${PERSISTENT_DATA_ROOT:-/mnt/data/projects/data/eventmaker2}"
PREPARE_NEXTCLOUD_VOLUME="${PREPARE_NEXTCLOUD_VOLUME:-0}"

echo "Förbereder persistent data under: ${PERSISTENT_DATA_ROOT}"

install -d -m 0775 "${PERSISTENT_DATA_ROOT}"
install -d -m 0770 "${PERSISTENT_DATA_ROOT}/mariadb"

if [ "${PREPARE_NEXTCLOUD_VOLUME}" = "1" ]; then
	install -d -m 0775 "${PERSISTENT_DATA_ROOT}/nextcloud"
fi

if command -v chown >/dev/null 2>&1; then
	chown -R 999:999 "${PERSISTENT_DATA_ROOT}/mariadb" || true
	if [ "${PREPARE_NEXTCLOUD_VOLUME}" = "1" ]; then
		chown -R 33:33 "${PERSISTENT_DATA_ROOT}/nextcloud" || true
	fi
fi

cat <<EOF
Klart.

Mappar:
- ${PERSISTENT_DATA_ROOT}/mariadb

$(if [ "${PREPARE_NEXTCLOUD_VOLUME}" = "1" ]; then echo "- ${PERSISTENT_DATA_ROOT}/nextcloud"; fi)

Använd sedan:
PERSISTENT_DATA_ROOT="${PERSISTENT_DATA_ROOT}" docker compose up -d --build
EOF
