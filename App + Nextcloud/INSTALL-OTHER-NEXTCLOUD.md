# Installera Appen I En Annan Nextcloud-Instans

Den här guiden beskriver det enklaste sättet att installera `booked_events_widget` i en annan Nextcloud, till exempel på en VPS.

## Krav

- Nextcloud 30 eller 31
- shell-access till servern eller containern
- rätt att köra `occ`
- rätt att skriva till `custom_apps`

## Rekommenderad källa

Använd exportpaketet:

- `export/booked_events_widget.zip`

eller hela mappen:

- `export/booked_events_widget`

Exportpaketet innehåller nu även:

- `getevent.sh`
- `data/events.json`

och är anpassat för att läsa event från WordPress-API:t:

`https://ambitionsverige.se/wp-json/amb/v1/events`

## Installation Med Zip

1. Kopiera `booked_events_widget.zip` till servern.

2. Gå till din Nextcloud-root.

Exempel:

```bash
cd /var/www/nextcloud
```

3. Packa upp appen i `custom_apps`.

```bash
unzip booked_events_widget.zip -d custom_apps
```

4. Sätt rätt ägare.

```bash
chown -R www-data:www-data custom_apps/booked_events_widget
```

5. Aktivera appen.

```bash
sudo -u www-data php occ app:enable booked_events_widget
```

6. Kör första importen från API:t.

```bash
cd custom_apps/booked_events_widget
chmod +x getevent.sh
./getevent.sh data/events.json
chown www-data:www-data data/events.json
```

7. Ladda om dashboarden i webbläsaren.

## Installation Med Appmapp

Om du hellre kopierar mappen direkt:

```bash
cp -a booked_events_widget /var/www/nextcloud/custom_apps/
chown -R www-data:www-data /var/www/nextcloud/custom_apps/booked_events_widget
sudo -u www-data php /var/www/nextcloud/occ app:enable booked_events_widget
cd /var/www/nextcloud/custom_apps/booked_events_widget
chmod +x getevent.sh
./getevent.sh data/events.json
chown www-data:www-data data/events.json
```

## Docker-Variant

Om Nextcloud kör i container:

```bash
docker cp booked_events_widget <container_namn>:/var/www/html/custom_apps/
docker exec -u root <container_namn> chown -R www-data:www-data /var/www/html/custom_apps/booked_events_widget
docker exec -u www-data <container_namn> php /var/www/html/occ app:enable booked_events_widget
docker exec -u root <container_namn> chmod +x /var/www/html/custom_apps/booked_events_widget/getevent.sh
docker exec -u root <container_namn> /var/www/html/custom_apps/booked_events_widget/getevent.sh /var/www/html/custom_apps/booked_events_widget/data/events.json
docker exec -u root <container_namn> chown www-data:www-data /var/www/html/custom_apps/booked_events_widget/data/events.json
```

## Automatisk Uppdatering Var 30:e Minut

Lägg till en cronrad på servern:

```bash
*/30 * * * * cd /var/www/nextcloud/custom_apps/booked_events_widget && ./getevent.sh data/events.json >/dev/null 2>&1
```

Om din Nextcloud ligger någon annanstans, byt sökvägen.

## Verifiering

Kontrollera att appen är aktiv:

```bash
sudo -u www-data php occ app:list | grep booked_events_widget
```

Öppna sedan:

```text
https://din-nextcloud/apps/dashboard/
```

Hanteringssidan finns på:

```text
https://din-nextcloud/apps/booked_events_widget/
```

## Om Något Går Fel

Kontrollera:

- att appen ligger i `custom_apps/booked_events_widget`
- att filägaren är korrekt
- att `getevent.sh` är körbar
- att `data/events.json` finns och innehåller event
- att appen verkligen är enabled

Använd gärna:

```bash
sudo -u www-data php occ maintenance:repair
```

och kontrollera loggen:

```bash
tail -f /var/www/nextcloud/data/nextcloud.log
```
