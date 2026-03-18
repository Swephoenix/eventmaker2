#!/usr/bin/env bash
set -euo pipefail

docker compose up -d --build

cat <<'EOF'
Nextcloud startad.

URL: http://localhost:8080
Admin: admin / admin123
Demo: demo / DemoUser123!

Första inloggningen kan ta någon minut medan Nextcloud installeras och demoanvändaren skapas.
EOF
