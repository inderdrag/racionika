#!/usr/bin/env python3
"""Independently audit shipped OFF source IDs, descriptions, units and all 4 nutrients.
Usage: python scripts/catalog/verify-ru.py /path/to/off-ru-raw.jsonl
This verifies data provenance, not physical food packages or community accuracy.
"""
import base64,gzip,hashlib,json,pathlib,sys,re
root=pathlib.Path(__file__).resolve().parents[2]
manifest=json.loads((root/'scripts/catalog/ru-manifest.json').read_text())
raw=pathlib.Path(sys.argv[1]);sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(raw.read_bytes())==manifest['source']['exportSha256'],'Source export checksum mismatch'
parts=[]
for p in manifest['parts']:
 b=(root/'scripts/catalog'/p['path']).read_bytes();assert sha(b)==p['sha256'];parts.append(b.strip())
packed=base64.b64decode(b''.join(parts));assert sha(packed)==manifest['packedSha256']
plain=gzip.decompress(packed);assert sha(plain)==manifest['unpackedSha256'];rows=json.loads(plain)
assert len(rows)==manifest['count']==len({r[0] for r in rows})
needed={r[0] for r in rows};sources={}
for line in raw.open():
 p=json.loads(line)
 if p['code'] in needed:sources[p['code']]=p
for id,name,category,kcal,protein,fat,carbs,description in rows:
 p=sources[id];n={x['name']:x for x in p['nutriments']};assert p['nutrition_data_per']=='100g'
 assert p.get('product_quantity_unit') not in ['ml','l','cl'];assert 'en:russia' in p['countries_tags']
 for field,value,unit in [('energy-kcal',kcal,'kcal'),('proteins',protein,'g'),('fat',fat,'g'),('carbohydrates',carbs,'g')]:assert n[field]['100g']==value and n[field]['unit'].lower()==unit,(id,field)
 names=p.get('product_name') or [];texts=[x['text'] for x in names if x['lang']=='ru' and re.search('[А-Яа-яЁё]',x['text'])] or [x['text'] for x in names if x['lang']=='main' and re.search('[А-Яа-яЁё]',x['text'])]
 original=re.sub(r'\s+',' ',texts[0]).strip();brand=re.sub(r'\s+',' ',p.get('brands') or '').strip()
 assert description==original+(' · '+brand if brand else ''),id
print(f'Verified {len(rows)} Russian-market OFF IDs, descriptions, mass basis and {len(rows)*4} source nutrient values. Not a physical-label certification.')
