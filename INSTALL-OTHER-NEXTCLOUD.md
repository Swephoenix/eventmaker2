# Installera Appen I En Annan Nextcloud-Instans

Den här guiden beskriver hur du flyttar appen `booked_events_widget` till en annan Nextcloud-instans.

## Vad appen gör

Appen lägger till:

- en dashboard-widget som visar bokade event
- en enkel hanteringssida för att skapa, redigera och ta bort event
- en egen databastabell för event

Appens kod ligger i:

`apps/booked_events_widget`

## Viktigt innan du börjar

Den nuvarande versionen är byggd som en demoapp.

Det betyder att:

- CRUD-sidan är avsiktligt förenklad
- CSRF-kontroll är avstängd för create/update/delete i kontrollern för att få demo-flödet att fungera enkelt

Om appen ska användas i en riktig produktionsmiljö bör detta härdas innan drift.

## Krav

- Nextcloud 30 eller 31
- shell-access till servern eller containern
- rätt att köra `occ`
- rätt att kopiera filer till `custom_apps`

## 1. Kopiera appen

Kopiera hela katalogen:

```bash
apps/booked_events_widget
```

till målserverns:

```bash
custom_apps/booked_events_widget
```

Exempel:

```bash
cp -a apps/booked_events_widget /var/www/html/custom_apps/
```

Om du använder Docker med Nextcloud-container:

```bash
docker cp apps/booked_events_widget <container_namn>:/var/www/html/custom_apps/
```

## 2. Sätt rätt ägare

Appkatalogen måste ägas av webbserveranvändaren, vanligtvis `www-data`.

Exempel:

```bash
chown -R www-data:www-data /var/www/html/custom_apps/booked_events_widget
```

I Docker:

```bash
docker exec -u root <container_namn> chown -R www-data:www-data /var/www/html/custom_apps/booked_events_widget
```

## 3. Aktivera appen

Kör:

```bash
sudo -u www-data php /var/www/html/occ app:enable booked_events_widget
```

I Docker:

```bash
docker exec -u www-data <container_namn> php /var/www/html/occ app:enable booked_events_widget
```

När appen aktiveras:

- routning registreras
- databasmigreringen körs
- tabellen `oc_bew_events` skapas

## 4. Verifiera att appen är aktiv

Kör:

```bash
sudo -u www-data php /var/www/html/occ app:list | grep booked_events_widget
```

eller i Docker:

```bash
docker exec -u www-data <container_namn> php /var/www/html/occ app:list | grep booked_events_widget
```

Du ska se att appen är enabled.

## 5. Öppna appen

Dashboard-widgeten visas på dashboarden.

Hanteringssidan nås på:

```text
https://din-nextcloud/apps/booked_events_widget/
```

Om dashboard-widgeten visas men menylänken inte gör det kan du öppna sidan direkt via URL:en ovan.

## 6. Uppdatera appen efter ändringar

Om du ändrar filer i appen och vill uppdatera en befintlig instans:

1. kopiera in den nya appkoden igen
2. sätt rätt rättigheter
3. disable/enable appen

Exempel:

```bash
sudo -u www-data php /var/www/html/occ app:disable booked_events_widget
sudo -u www-data php /var/www/html/occ app:enable booked_events_widget
```

I Docker:

```bash
docker exec -u www-data <container_namn> php /var/www/html/occ app:disable booked_events_widget
docker exec -u www-data <container_namn> php /var/www/html/occ app:enable booked_events_widget
```

## 7. Om något går fel

Kontrollera:

- att appen ligger i `custom_apps/booked_events_widget`
- att filägaren är korrekt
- att Nextcloud-versionen är 30 eller 31
- att appen verkligen är enabled

Kolla också Nextcloud-loggen:

```bash
tail -f /var/www/html/data/nextcloud.log
```

eller i Docker:

```bash
docker exec -it <container_namn> tail -f /var/www/html/data/nextcloud.log
```

## Relevanta filer

- `apps/booked_events_widget/appinfo/info.xml`
- `apps/booked_events_widget/appinfo/routes.php`
- `apps/booked_events_widget/lib/Controller/PageController.php`
- `apps/booked_events_widget/lib/Service/EventService.php`
- `apps/booked_events_widget/lib/Migration/Version1100Date20260318181500.php`

## Rekommenderat nästa steg för produktion

Innan appen används skarpt bör du åtminstone:

- återinföra riktig CSRF-hantering
- validera formulärdata striktare
- lägga till tydliga fel- och successmeddelanden
- begränsa vem som får administrera event
