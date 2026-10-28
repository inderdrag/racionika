#!/usr/bin/env python3
"""Audit every shipped food's original description, energy, macros and units.
Usage: python scripts/catalog/verify-extended.py <SR-CSV-directory> <FNDDS-zip>
Official archives, their checksums and exclusions: extended-manifest.json.
Names are translations, not a claim of human nutrition/translation review.
"""
import base64,csv,gzip,hashlib,json,pathlib,sys,zipfile
root=pathlib.Path(__file__).resolve().parents[2];sr=pathlib.Path(sys.argv[1]);survey_zip=pathlib.Path(sys.argv[2]);manifest=json.loads((root/'scripts/catalog/extended-manifest.json').read_text());field={'1008':'kcal','1003':'protein','1004':'fat','1005':'carbs'}
sha=lambda b:hashlib.sha256(b).hexdigest()
for source in manifest['sources']:
 if source['type']=='sr':
  for file,expected in source['files'].items():assert sha((sr/file).read_bytes())==expected,file
 else:assert sha(survey_zip.read_bytes())==source['archiveSha256']
foods={row['fdc_id']:row for row in csv.DictReader((sr/'food.csv').open())};nutrients={id:{} for id in foods};units={r['id']:r['unit_name'] for r in csv.DictReader((sr/'nutrient.csv').open())}
for id in field:assert units[id]==('KCAL' if id=='1008' else 'G')
for row in csv.DictReader((sr/'food_nutrient.csv').open()):
 if row['nutrient_id'] in field:nutrients[row['fdc_id']][field[row['nutrient_id']]]=float(row['amount'])
with zipfile.ZipFile(survey_zip) as z:survey=json.loads(z.read('surveyDownload.json'))['SurveyFoods']
for food in survey:
 id=str(food['fdcId']);foods[id]={'description':food['description']};nutrients[id]={}
 for n in food['foodNutrients']:
  nid=str(n['nutrient']['id'])
  if nid in field:
   assert n['nutrient']['unitName'].upper()==('KCAL' if nid=='1008' else 'G')
   nutrients[id][field[nid]]=n['amount']
parts=[]
for p in manifest['parts']:
 b=(root/'scripts/catalog'/p['path']).read_bytes();assert sha(b)==p['sha256'];parts.append(b.strip())
packed=base64.b64decode(b''.join(parts));assert sha(packed)==manifest['packedSha256'];plain=gzip.decompress(packed);assert sha(plain)==manifest['unpackedSha256'];data=json.loads(plain)
records=json.loads((root/'app/src/core/catalog/usda.json').read_text())
for id,name,category,form,kcal,protein,fat,carbs,description,release in data['rows']:records.append({'source':{'id':id,'description':description},'per100':dict(kcal=kcal,protein=protein,fat=fat,carbs=carbs)})
assert len(records)==manifest['count']==len({r['source']['id'] for r in records})
for row in records:
 id=row['source']['id'];assert row['source']['description']==foods[id]['description'],id
 assert row['per100']==nutrients[id],id
print(f"Verified {len(records)} unique USDA IDs, original descriptions and {len(records)*4} nutrient values with official source checksums and units.")
