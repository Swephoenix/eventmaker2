# Minimal Nextcloud-demo med event-widget

Det här projektet startar en minimal men färdigkonfigurerad Nextcloud i Docker och lägger till en egen dashboard-widget som visar bokade event på första sidan.

## Ingår

- Nextcloud 31 via Docker Compose
- Automatisk installation med SQLite
- Admin-användare: `admin` / `admin123`
- Demo-användare: `demo` / `DemoUser123!`
- Egen app: `booked_events_widget`
- Egen datatabell for event med seedad demodata vid app-install
- Dashboard som standardstartsida

## Starta

```bash
./start_nextcloud.sh
```

Öppna sedan `http://localhost:8080`.

## Widgeten

Widgeten visas på dashboarden och innehåller förkonfigurerade demoevent:

- Sommarfest på Tjolöholm
- Produktlansering Nord
- Styrelsemiddag Q2
- Julmingel Göteborg

Data lases fran appens datatabell via [EventService.php](/home/weddingfixer/Downloads/nc_eventplaner/apps/booked_events_widget/lib/Service/EventService.php). Grunddata seedas vid installation i [InstallSeedEvents.php](/home/weddingfixer/Downloads/nc_eventplaner/apps/booked_events_widget/lib/Migration/InstallSeedEvents.php), och tabellen skapas av [Version1100Date20260318181500.php](/home/weddingfixer/Downloads/nc_eventplaner/apps/booked_events_widget/lib/Migration/Version1100Date20260318181500.php).
