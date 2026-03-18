#!/usr/bin/env bash

URL="https://ambitionsverige.se/"
TMP="/tmp/events.html"
OUT="events.json"

echo "Hämtar sidan..."
curl -s "$URL" -o "$TMP"

echo "[" > "$OUT"

awk '
BEGIN{
RS="<li class=\"event-item\""
FS="\n"
first=1
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
gsub(/.*>/,"",$i)
gsub(/<.*/,"",$i)
month=$i
}

if($i ~ /event-date-day/){
gsub(/.*>/,"",$i)
gsub(/<.*/,"",$i)
day=$i
}

if($i ~ /event-date-range/){
gsub(/.*>/,"",$i)
gsub(/<.*/,"",$i)
range=$i
}

if($i ~ /event-meta/){
gsub(/.*>/,"",$i)
gsub(/<.*/,"",$i)
place=$i
}

}

if(!first){ printf(",\n") }
first=0

printf("  {\n")
printf("    \"title\": \"%s\",\n",title)
printf("    \"month\": \"%s\",\n",month)
printf("    \"day\": \"%s\",\n",day)
printf("    \"time\": \"%s\",\n",range)
printf("    \"place\": \"%s\",\n",place)
printf("    \"description\": \"%s\",\n",desc)
printf("    \"link\": \"%s\"\n",link)
printf("  }")

}

END{ print "" }

' "$TMP" >> "$OUT"

echo "]" >> "$OUT"

echo "Klart."
echo "JSON sparad i $OUT"