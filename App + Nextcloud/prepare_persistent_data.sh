#!/usr/bin/env bash
set -euo pipefail

PERSISTENT_DATA_ROOT="${PERSISTENT_DATA_ROOT:-/mnt/data/projects/data/eventmaker2}"

echo "Förbereder persistent data under: ${PERSISTENT_DATA_ROOT}"

install -d -m 0775 "${PERSISTENT_DATA_ROOT}"
install -d -m 0770 "${PERSISTENT_DATA_ROOT}/mariadb"

if command -v chown >/dev/null 2>&1; then
	chown -R 999:999 "${PERSISTENT_DATA_ROOT}/mariadb" || true
fi

cat <<EOF
Klart.

Mappar:
- ${PERSISTENT_DATA_ROOT}/mariadb

Använd sedan:
PERSISTENT_DATA_ROOT="${PERSISTENT_DATA_ROOT}" docker compose up -d --build
EOF
