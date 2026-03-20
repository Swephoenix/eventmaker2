#!/usr/bin/env bash
set -euo pipefail

PERSISTENT_DATA_ROOT="${PERSISTENT_DATA_ROOT:-/mnt/data/projects/data}"

export PERSISTENT_DATA_ROOT

"$(dirname "$0")/prepare_persistent_data.sh"

docker compose up -d --build

cat <<EOF
Nextcloud startad.

URL: http://localhost:8080
Admin: admin / admin123
Demo: demo / DemoUser123!
Persistent data: ${PERSISTENT_DATA_ROOT}

Första inloggningen kan ta någon minut medan Nextcloud installeras och demoanvändaren skapas.
EOF
