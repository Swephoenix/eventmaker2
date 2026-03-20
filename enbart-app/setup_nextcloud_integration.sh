#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RUN_PREPARE=0
RUN_DEPLOY=1
RUN_CRON=1

print_help() {
	cat <<'EOF'
Användning:
  ./setup_nextcloud_integration.sh [flaggor]

Standard:
  - deployar appen till Nextcloud-containern
  - installerar/uppdaterar cronjob för API-import var 5:e minut

Flaggor:
  --with-prepare   Kör även prepare_persistent_data.sh
  --skip-deploy    Hoppa över deploy-steget
  --skip-cron      Hoppa över cronjob-steget
  --only-deploy    Kör bara deploy
  --only-cron      Kör bara cronjob
  --help           Visa denna hjälptext

Miljövariabler som stöds:
  CONTAINER_NAME
  OCC_USER
  EVENT_SOURCE_URL
  TARGET_APPS_DIR
  TARGET_APP_DIR
  TARGET_EVENTS_FILE
  LOG_FILE
  PERSISTENT_DATA_ROOT
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--with-prepare)
			RUN_PREPARE=1
			;;
		--skip-deploy)
			RUN_DEPLOY=0
			;;
		--skip-cron)
			RUN_CRON=0
			;;
		--only-deploy)
			RUN_DEPLOY=1
			RUN_CRON=0
			;;
		--only-cron)
			RUN_DEPLOY=0
			RUN_CRON=1
			;;
		--help|-h)
			print_help
			exit 0
			;;
		*)
			echo "Okänd flagga: $1" >&2
			print_help >&2
			exit 1
			;;
	esac
	shift
done

echo "Setup för Nextcloud-integration"
echo "Katalog: $SCRIPT_DIR"

if [[ "$RUN_PREPARE" == "1" ]]; then
	echo
	echo "1. Förbereder persistent data..."
	"$SCRIPT_DIR/prepare_persistent_data.sh"
fi

if [[ "$RUN_DEPLOY" == "1" ]]; then
	echo
	echo "2. Deployar appen till Nextcloud..."
	"$SCRIPT_DIR/deploy_to_nextcloud.sh"
fi

if [[ "$RUN_CRON" == "1" ]]; then
	echo
	echo "3. Installerar/uppdaterar cronjob för API-import..."
	USE_DOCKER="${USE_DOCKER:-1}" "$SCRIPT_DIR/create_cronjob_for_api.sh"
fi

echo
echo "Klart."
echo "Verifiera gärna med:"
echo "  docker exec -it ${CONTAINER_NAME:-nextcloud} cat ${TARGET_EVENTS_FILE:-/var/www/html/custom_apps/booked_events_widget/data/api_events.json}"
