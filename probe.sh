#!/usr/bin/env bash
# Probe data hosts and save raw responses for offline inspection (pushed to branch probe-out).
set -u
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
mkdir -p out
JAR=$(mktemp)
get() { # name url [extra curl args]
  local name="$1" url="$2"; shift 2
  local code
  code=$(curl -sS -L -A "$UA" -b "$JAR" -c "$JAR" -m 180 "$@" -o "out/$name" -w "%{http_code} %{size_download} %{content_type} %{url_effective}" "$url" 2>>out/_errors.txt) || code="ERR $code"
  echo "$name | $code | $url" | tee -a out/_index.txt
}
BOE=https://www.bankofengland.co.uk/boeapps/database
get "boe-home.html" "$BOE/"
for mid in FR5Y60 FR5Y85 FR5Y90 FR2Y85 FR2Y95 FR3Y75 FR10Y75; do
  get "boe-cat-$mid.html" "$BOE/FromShowColumns.asp?Travel=NIxAZxI1x&FromCategoryList=Yes&NewMeaningId=$mid&CategId=6&HighlightCatValueDisplay=x"
done
for q in "60%25+LTV" "85%25+LTV" "90%25+LTV" "5+year+fixed+rate+mortgage"; do
  get "boe-search-$q.html" "$BOE/FromShowColumns.asp?Travel=NIxAZx&SearchText=$q&SearchExclude=&SearchTextFields=TC"
done
get "boe-legal.html" "https://www.bankofengland.co.uk/legal"
cat out/boe-*.html | grep -oE '\bIUM[A-Z0-9]{3,5}\b' | sort -u | tr '\n' ' ' | tee -a out/_index.txt
echo
for c in $(cat out/boe-*.html | grep -oE '\bIUM[A-Z0-9]{3,5}\b' | sort -u); do
  curl -sS -A "$UA" -m 60 "$BOE/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Aug/2026&Dateto=now&SeriesCodes=$c&CSVF=TT&UsingCodes=Y&VPD=Y&VFD=N" | sed -n 2p | tee -a out/_series.txt
  sleep 0.3
done
# ONS PIPR edition JSON (to find the xlsx without scraping HTML)
get "pipr-edition.json" "https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics/16september2026/data"
# Rental area best matches from ONS "Housing prices in your area" pages, for every Scottish and NI council
python3 - <<'PY'
import json, re, urllib.request, time
codes = ['N0900000%d' % i for i in range(1, 10)] + ['N09000010', 'N09000011']
codes += ['S120000%02d' % i for i in (5, 6, 8, 10, 11, 13, 14, 17, 18, 19, 20, 21, 23, 26, 27, 28, 29, 30, 33, 34, 35, 36, 38, 39, 40, 41, 42, 45, 47, 48, 49, 50)]
ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
out = []
for c in codes:
    try:
        req = urllib.request.Request('https://www.ons.gov.uk/visualisations/housingpriceslocal/%s/' % c, headers={'User-Agent': ua})
        s = urllib.request.urlopen(req, timeout=60).read().decode('utf-8')
        s2 = s.replace('\\"', '"')
        place = re.search(r'"place":\{"areacd":"%s","areanm":"([^"]*)".*?"brma_name":(\[[^\]]*\]|"[^"]*"),"brmacd":(\[[^\]]*\]|"[^"]*")' % c, s2)
        best = re.search(r'best match for your selected local authority is ([^.<]*)', s)
        out.append({'code': c, 'name': place and place.group(1), 'brma_name': place and json.loads(place.group(2)), 'brmacd': place and json.loads(place.group(3)), 'bestMatch': best and best.group(1).strip()})
    except Exception as e:
        out.append({'code': c, 'error': str(e)})
    time.sleep(0.5)
json.dump(out, open('out/brma-matches.json', 'w'), indent=1)
print(json.dumps(out, indent=1))
PY
for f in out/*.html; do gzip -9 "$f"; done
ls -la out | head -50
