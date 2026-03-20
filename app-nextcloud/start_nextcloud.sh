#!/usr/bin/env bash
set -euo pipefail

PERSISTENT_DATA_ROOT="${PERSISTENT_DATA_ROOT:-/mnt/data/projects/data/eventmaker2}"

export PERSISTENT_DATA_ROOT

"$(dirname "$0")/../enbart-app/prepare_persistent_data.sh"

install -d -m 0775 "${PERSISTENT_DATA_ROOT}/nextcloud"
if command -v chown >/dev/null 2>&1; then
	chown -R 33:33 "${PERSISTENT_DATA_ROOT}/nextcloud" || true
fi

docker compose up -d --build

cat <<EOF
Nextcloud startad.

URL: http://localhost:8080
Admin: admin / admin123
Demo: demo / DemoUser123!
Persistent data: ${PERSISTENT_DATA_ROOT}

Första inloggningen kan ta någon minut medan Nextcloud installeras och demoanvändaren skapas.
EOF
