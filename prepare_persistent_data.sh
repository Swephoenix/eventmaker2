#!/usr/bin/env bash
set -euo pipefail

"$(dirname "$0")/app-nextcloud/prepare_persistent_data.sh" "$@"
