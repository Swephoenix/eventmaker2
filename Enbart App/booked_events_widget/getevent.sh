#!/usr/bin/env bash
set -euo pipefail

URL="${EVENT_SOURCE_URL:-https://ambitionsverige.se/wp-json/amb/v1/events}"
OUT="${1:-${EVENTS_OUT:-events.json}}"
TMP_JSON="$(mktemp)"

cleanup() {
	rm -f "$TMP_JSON"
}

trap cleanup EXIT

echo "Hämtar event från API..."
if ! curl -fsSL "$URL" -o "$TMP_JSON"; then
	echo "Kunde inte hämta event-API:t. Behåller befintlig fil."
	exit 0
fi

if ! python3 - "$TMP_JSON" "$OUT" <<'PY'
import json
import os
import sys

src, dst = sys.argv[1], sys.argv[2]

with open(src, "r", encoding="utf-8") as fh:
    payload = json.load(fh)

if not isinstance(payload, list):
    raise SystemExit(1)

events = []
for index, item in enumerate(payload, start=1):
    if not isinstance(item, dict):
        continue
    title = str(item.get("title", "")).strip()
    if not title:
        continue
    date = str(item.get("date", "")).strip()
    month = str(item.get("month", "")).strip()
    day = str(item.get("day", "")).strip()
    time = str(item.get("time", "")).strip()
    place = str(item.get("place", "")).strip()
    location = str(item.get("location", "")).strip()
    events.append({
        "title": title,
        "date": date,
        "month": month,
        "day": day,
        "time": time,
        "place": place,
        "location": location,
        "description": str(item.get("description", "")).strip(),
        "link": str(item.get("link", "")).strip(),
        "sort_order": int(item.get("sort_order", index * 10)),
        "source": "api",
    })

if not events:
    raise SystemExit(2)

os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
with open(dst, "w", encoding="utf-8") as fh:
    json.dump(events, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
then
	echo "API-svaret var ogiltigt eller tomt. Behåller befintlig fil."
	exit 0
fi

echo "Klart."
echo "JSON sparad i $OUT"
