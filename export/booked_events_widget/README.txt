Kopiera hela mappen "booked_events_widget" till din andra Nextcloud-instans under:

custom_apps/booked_events_widget

Aktivera sedan appen med:

php occ app:enable booked_events_widget

Om du vill uppdatera data manuellt från WordPress-API:t kan du köra:

./getevent.sh data/events.json

Se INSTALL-OTHER-NEXTCLOUD.md i projektroten for full guide.
