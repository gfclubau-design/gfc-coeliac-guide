#!/usr/bin/env python3
"""Reverse-geocode venue coordinates to suburb/locality via Nominatim (free, 1 req/s).

Writes results incrementally to suburbs.csv so partial progress survives interruption.
Re-run to resume from where it stopped.
"""
import json, csv, os, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
QUEUE = os.path.join(HERE, "geocode-queue.json")
OUT = os.path.join(HERE, "suburbs.csv")
UA = "GFCCoeliacGuideSeedBuild/1.0 (contact: yourfoodtribe@gmail.com)"

queue = json.load(open(QUEUE))
done = set()
if os.path.exists(OUT):
    with open(OUT, newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            if row and row[0].isdigit():
                done.add(int(row[0]))
todo = [r for r in queue if r[0] not in done]
print(f"total {len(queue)}, done {len(done)}, to do {len(todo)}", flush=True)

fh = open(OUT, "a", newline="", encoding="utf-8")
w = csv.writer(fh)
failures = 0
for n, (idx, name, lat, lng) in enumerate(todo):
    q = urllib.parse.urlencode({"lat": lat, "lon": lng, "zoom": "14", "format": "json", "addressdetails": "1"})
    url = f"https://nominatim.openstreetmap.org/reverse?{q}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            d = json.load(resp)
        a = d.get("address", {})
        suburb = a.get("suburb") or a.get("city_district") or a.get("town") or a.get("locality") or a.get("village") or ""
        city = a.get("city") or ""
        state = a.get("state") or ""
        pc = a.get("postcode") or ""
        w.writerow([idx, name, suburb, city, state, pc, f"{lat},{lng}"])
        failures = 0
    except Exception as e:
        w.writerow([idx, name, "ERROR", str(e)[:60], "", "", f"{lat},{lng}"])
        failures += 1
        if failures > 15:
            print("aborting - too many consecutive failures", flush=True)
            break
    fh.flush()
    if (n + 1) % 100 == 0:
        print(f"progress {n+1}/{len(todo)}", flush=True)
    time.sleep(1.05)  # Nominatim policy: 1 req/s
fh.close()
print("geocoding complete", flush=True)
