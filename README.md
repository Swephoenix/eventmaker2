# Minimal Nextcloud-demo med event-widget

Det här projektet startar en minimal men färdigkonfigurerad Nextcloud i Docker och lägger till en egen dashboard-widget som visar bokade event på första sidan.

## Ingår

- Nextcloud via Docker Compose
- Automatisk installation med MariaDB
- Persistent data via `PERSISTENT_DATA_ROOT`
- Admin-användare: `admin` / `admin123`
- Demo-användare: `demo` / `DemoUser123!`
- Egen app: `booked_events_widget`
- Persistent Nextcloud-data och databas
- Dashboard som standardstartsida

## Starta

```bash
./start_nextcloud.sh
```

Öppna sedan `http://localhost:8080`.

## Persistent Data

Standardplatsen för persistent data är:

```bash
/mnt/data/projects/data
```

Du kan ändra detta med miljövariabeln:

```bash
PERSISTENT_DATA_ROOT=/annan/sökväg
```

Exempel:

```bash
PERSISTENT_DATA_ROOT=/mnt/data/projects/data ./start_nextcloud.sh
```

Följande kataloger används:

- `${PERSISTENT_DATA_ROOT}/nextcloud`
- `${PERSISTENT_DATA_ROOT}/mariadb`

För att skapa dem manuellt:

```bash
./prepare_persistent_data.sh
```

## Widgeten

Widgeten visas på dashboarden och läser event från appens JSON-datafil samt API-importen via `getevent.sh`.
