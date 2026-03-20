#!/usr/bin/env bash
set -euo pipefail

bash "$(dirname "$0")/app-nextcloud/prepare_persistent_data.sh" "$@"
