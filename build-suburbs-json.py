#!/usr/bin/env python3
"""suburbs.csv -> suburbs.json (idx -> suburb, excluding errors)."""
import csv, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
out = {}
ok = bad = 0
with open(os.path.join(HERE, "suburbs.csv"), newline="", encoding="utf-8") as f:
    for row in csv.reader(f):
        if not row or not row[0].isdigit():
            continue
        idx, name, suburb, city, state, pc = row[0], row[1], row[2], row[3], row[4], row[5]
        if suburb == "ERROR":
            bad += 1
            continue
        label = (suburb or city).strip()
        if label:
            if pc:
                label = label + ' ' + pc
            out[int(idx)] = label
            ok += 1
json.dump(out, open(os.path.join(HERE, "suburbs.json"), "w"), ensure_ascii=False)
print(f"suburbs.json written: {ok} venues with suburb, {bad} errors, {len(out)} entries")
