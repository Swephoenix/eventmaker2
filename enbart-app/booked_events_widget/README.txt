Detta är källmappen för appen under utveckling.

Om du använder projektets Docker/Nextcloud-miljö i `app-nextcloud` är det denna mapp som byggs in i containern.

Gör därför appändringar här, inte i `app-nextcloud`.

För Docker/Nextcloud-setup är rekommenderad väg nu:

./setup_nextcloud_integration.sh

Det skriptet kan deploya appen och installera cronjob för API-import åt dig.

Kopiera hela mappen "booked_events_widget" till din andra Nextcloud-instans under:

custom_apps/booked_events_widget

Aktivera sedan appen med:

php occ app:enable booked_events_widget

Om du vill uppdatera data manuellt från WordPress-API:t kan du köra:

./getevent.sh data/api_events.json

Se INSTALL-OTHER-NEXTCLOUD.md i projektroten for full guide.
