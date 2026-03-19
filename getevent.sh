#!/usr/bin/env bash
set -euo pipefail

URL="${EVENT_SOURCE_URL:-https://ambitionsverige.se/}"
OUT="${1:-${EVENTS_OUT:-events.json}}"
TMP_HTML="$(mktemp)"
TMP_JSON="$(mktemp)"

cleanup() {
	rm -f "$TMP_HTML" "$TMP_JSON"
}

trap cleanup EXIT

echo "Hämtar sidan..."
if ! curl -fsSL "$URL" -o "$TMP_HTML"; then
	echo "Kunde inte hämta eventsidan. Behåller befintlig fil."
	exit 0
fi

echo "[" > "$TMP_JSON"

awk '
BEGIN{
	RS="<li class=\"event-item\""
	FS="\n"
	first=1
	count=0
}

NR>1{
	title=""
	desc=""
	link=""
	month=""
	day=""
	range=""
	place=""

	for(i=1;i<=NF;i++){
		if($i ~ /data-title=/){
			match($i,/data-title="[^"]+"/)
			title=substr($i,RSTART+12,RLENGTH-13)
		}

		if($i ~ /data-desc=/){
			match($i,/data-desc="[^"]+"/)
			desc=substr($i,RSTART+11,RLENGTH-12)
		}

		if($i ~ /data-link=/){
			match($i,/data-link="[^"]+"/)
			link=substr($i,RSTART+11,RLENGTH-12)
		}

		if($i ~ /event-date-month/){
			sub(/^[^>]*>/,"",$i)
			sub(/<[^<]*$/,"",$i)
			month=$i
		}

		if($i ~ /event-date-day/){
			sub(/^[^>]*>/,"",$i)
			sub(/<[^<]*$/,"",$i)
			day=$i
		}

		if($i ~ /event-date-range/){
			sub(/^[^>]*>/,"",$i)
			sub(/<[^<]*$/,"",$i)
			range=$i
		}

		if($i ~ /event-meta/){
			sub(/^[^>]*>/,"",$i)
			sub(/<[^<]*$/,"",$i)
			place=$i
		}
	}

	if(title == ""){
		next
	}

	if(!first){ printf(",\n") }
	first=0
	count++

	printf("  {\n")
	printf("    \"title\": \"%s\",\n",title)
	printf("    \"month\": \"%s\",\n",month)
	printf("    \"day\": \"%s\",\n",day)
	printf("    \"time\": \"%s\",\n",range)
	printf("    \"place\": \"%s\",\n",place)
	printf("    \"description\": \"%s\",\n",desc)
	printf("    \"link\": \"%s\",\n",link)
	printf("    \"sort_order\": %d\n",count * 10)
	printf("  }")
}

END{ print "" }
' "$TMP_HTML" >> "$TMP_JSON"

echo "]" >> "$TMP_JSON"

if ! grep -q '"title"' "$TMP_JSON"; then
	echo "Inga event hittades. Behåller befintlig fil."
	exit 0
fi

mkdir -p "$(dirname "$OUT")"
mv "$TMP_JSON" "$OUT"

echo "Klart."
echo "JSON sparad i $OUT"
