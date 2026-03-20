#!/usr/bin/env bash
set -euo pipefail

# Repair persisted volume ownership before Nextcloud runs its installation checks.
mkdir -p /var/www/html/custom_apps
chown -R www-data:www-data /var/www/html/apps /var/www/html/custom_apps 2>/dev/null || true

exec /entrypoint.sh "$@"
