"""Audit shipped portion measures against official USDA SR Legacy food_portion.csv.
Usage: python3 scripts/catalog/verify-portions.py /path/to/food_portion.csv
"""
import csv
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[2]
rows = {row['id']: row for row in csv.DictReader(open(sys.argv[1], encoding='utf-8'))}
portions = json.loads((root / 'app/src/core/catalog/portions.json').read_text())
products = {item['source']['id']: item for item in json.loads((root / 'app/src/core/catalog/usda.json').read_text())}
assert len(portions) == 285
for food, label, weight, row_id, modifier in portions:
    row = rows[row_id]
    assert food in products
    assert row['fdc_id'] == food
    assert row['modifier'] == modifier
    assert row['amount'] == '1'
    assert float(row['gram_weight']) == weight
    assert modifier in ('cup', 'tbsp', 'tsp') or (modifier == 'large' and products[food]['name'].startswith('Яйцо'))
    assert label and weight > 0
print(f'Checked {len(portions)} source-backed portion measures.')
