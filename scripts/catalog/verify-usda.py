#!/usr/bin/env python3
"""Rebuild/audit the shipped subset against official USDA CSVs, no invented nutrients.
Usage: python scripts/catalog/verify-usda.py <extracted-CSV-directory> [--write]
Download the manifest's datasetUrl separately and verify its SHA-256 before extraction.
"""
import csv
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[2]
source = pathlib.Path(sys.argv[1])
manifest = json.loads((root / 'scripts/catalog/manifest.json').read_text())
for name, expected in manifest['files'].items():
    assert hashlib.sha256((source / name).read_bytes()).hexdigest() == expected, name
foods = {row['fdc_id']: row for row in csv.DictReader((source / 'food.csv').open())}
selection = json.loads((root / 'scripts/catalog/selection.json').read_text())
selected_ids = {row['fdcId'] for row in selection}
nutrients = {id: {} for id in selected_ids}
for row in csv.DictReader((source / 'food_nutrient.csv').open()):
    if row['fdc_id'] in nutrients and row['nutrient_id'] in manifest['nutrientIds']:
        key = manifest['nutrientIds'][row['nutrient_id']]
        nutrients[row['fdc_id']][key] = float(row['amount'])
units = {row['id']: row['unit_name'] for row in csv.DictReader((source / 'nutrient.csv').open())}
for id in manifest['nutrientIds']:
    assert units[id] == ('KCAL' if id == '1008' else 'G'), id
rebuilt = []
for item in selection:
    id = item['fdcId']
    assert len(nutrients[id]) == 4, id
    rebuilt.append({k: v for k, v in item.items() if k != 'fdcId'} | {
        'per100': nutrients[id],
        'source': {'provider': 'usda', 'id': id, 'description': foods[id]['description'], 'release': 'SR Legacy 2018-04'},
    })
assert len(rebuilt) == manifest['count'] == len({item['id'] for item in rebuilt})
output = root / 'app/src/core/catalog/usda.json'
if '--write' in sys.argv:
    output.write_text(json.dumps(rebuilt, ensure_ascii=False, indent=2) + '\n')
else:
    assert json.loads(output.read_text()) == rebuilt, 'Shipped data differs from USDA'
print(f"Verified {len(rebuilt)} records × 4 nutrients, descriptions, IDs and CSV checksums.")
