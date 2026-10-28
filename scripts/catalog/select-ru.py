#!/usr/bin/env python3
"""Build the separate ODbL Russian-market partition. Usage: select-ru.py export.jsonl revision [audit.json].
Input: the pinned OFF Parquet projection documented in FOOD_CATALOG.md. No inferred nutrients.
"""
import base64,collections,gzip,hashlib,html,json,math,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parents[2];raw=pathlib.Path(sys.argv[1]);revision=sys.argv[2]
counts=collections.Counter();candidates=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
def norm(s):return re.sub(r'[^\w%]+',' ',s.casefold().replace('ё','е')).strip()
def reject(reason):counts[reason]+=1
for line in raw.open():
 p=json.loads(line);code=p['code'];n={v['name']:v for v in p.get('nutriments') or []};names=p.get('product_name') or [];brand=re.sub(r'\s+',' ',p.get('brands') or '').strip();tags=p.get('categories_tags') or []
 texts=[x['text'] for x in names if x['lang']=='ru' and re.search('[А-Яа-яЁё]',x['text'])] or [x['text'] for x in names if x['lang']=='main' and re.search('[А-Яа-яЁё]',x['text'])]
 if not texts:reject('no_russian_name');continue
 original=re.sub(r'\s+',' ',texts[0]).strip()
 if not re.fullmatch(r'\d{8}(?:\d{4,6})?',code):reject('invalid_barcode');continue
 if p.get('nutrition_data_per')!='100g':reject('not_100g');continue
 fields={'energy-kcal':'kcal','proteins':'protein','fat':'fat','carbohydrates':'carbs'}
 if not all(n.get(k,{}).get('100g') is not None for k in fields):reject('incomplete_macros');continue
 if any(str(n[k].get('unit')).lower()!=('kcal' if k=='energy-kcal' else 'g') for k in fields):reject('wrong_nutrient_units');continue
 # OFF's 100g marker may mean 100 ml. Known volume packs and unclear liquids are not gram records.
 liquid=any(x in tags for x in ['en:beverages','en:alcoholic-beverages','en:non-alcoholic-beverages','en:milks','en:fermented-milks','en:plant-milks']) or bool(re.search(r'молоко|кефир|ряженка|напиток|сок\b|нектар|вода\b|пиво\b|вино\b|питьев|жидк',original,re.I))
 dry_or_solid=bool(re.search(r'сух(?:ой|ое|ая)|сгущ[её]н|концентрир|каша|шоколад|конфет|порошок|кисель',original,re.I))
 if p.get('product_quantity_unit') in ['ml','l','cl'] or (liquid and p.get('product_quantity_unit') not in ['g','kg'] and not dry_or_solid):reject('volume_or_unclear_mass_basis');continue
 if any('baby' in t or 'infant' in t or 'supplement' in t for t in tags) or re.search(r'детск|малыш|младен|витамин|для детей',original,re.I):reject('infant_or_supplement');continue
 values={v:float(n[k]['100g']) for k,v in fields.items()}
 if any(not math.isfinite(v) or v<0 or v>(1000 if k=='kcal' else 100) for k,v in values.items()) or sum(values[k] for k in ['protein','fat','carbs'])>100.1:reject('outside_nutrient_bounds');continue
 calc=values['protein']*4+values['fat']*9+values['carbs']*4
 if abs(calc-values['kcal'])>max(80,values['kcal']*.35):reject('large_energy_macro_inconsistency');continue
 name=html.unescape(original);name=re.sub(r'(?<=\d)\.(?=\d)',',',name);name=re.sub(r'\s*%','%',name)
 if name.isupper():name=name.lower().capitalize()
 if brand and norm(brand) not in norm(name):name+=' · '+html.unescape(brand)
 name=name[:1].upper()+name[1:]
 if not 3<=len(name)<=145 or len(original+' · '+brand)>500:reject('unusable_or_overlong_name');continue
 if re.search(r'https?://|@|<|>|\btest\b|тестов|неизвестн',name,re.I):reject('placeholder_name');continue
 category='Продукты и блюда'
 groups=[('Молочное и яйца',r'творо|сметан|йогурт|сыр\b|масса творож|сливоч|яйц'),('Крупы и макароны',r'греч|крупа|рис\b|каша|макарон|вермиш|овсян|хлопья|спагет'),('Мясо и птица',r'колбас|сосиск|ветчин|говяд|свин|куриц|курин|индей|фарш|мяс|пельмен'),('Рыба и морепродукты',r'рыб|лосос|с[её]мг|тунец|кревет|сельд|скумбр|минтай|треск|икра'),('Хлеб',r'хлеб|булоч|лаваш|батон|хлебц'),('Орехи и семена',r'орех|арахис|миндал|семеч|фисташ|кешью'),('Бобовые',r'фасол|горох|чечевиц|нут\b'),('Сладкое',r'шоколад|конфет|печень|вафл|торт|морожен|слад|мармел|пастил|зефир|пряник|десерт'),('Овощи',r'овощ|огур|томат|помид|кабач|морков|капуст|св[её]кл|баклаж|картоф'),('Фрукты',r'яблок|груш|банан|ягод|вишн|слив|персик|ананас|фрукт'),('Масла',r'^масло\b|оливков|подсолнечн'),('Готовые блюда и соусы',r'соус|кетчуп|майонез|борщ|суп\b|салат|винегрет|оливье|сырник|вареник|котлет|голубц|плов')]
 for c,pat in groups:
  if re.search(pat,original,re.I):category=c;break
 everyday=bool(re.search(r'творог|сметан|йогурт|сыр\b|греч|пельмен|борщ|сырник|овсян|хлеб|макарон|сосиск|ряжен|кефир|вареник|простоквашин|винегрет',name,re.I))
 priority=(('en:russia' not in (p.get('countries_tags') or [])),not everyday,not bool(brand),len(name)>80,code)
 candidates.append((priority,dict(code=code,name=name,category=category,per100=values,description=original+(' · '+brand if brand else ''),countries=p.get('countries_tags'),brands=brand)))
seen_names=set();seen_codes=set();selected=[]
for _,p in sorted(candidates,key=lambda x:x[0]):
 key=norm(p['name'])
 if key in seen_names or p['code'] in seen_codes:reject('duplicate_name_brand_or_barcode');continue
 seen_names.add(key);seen_codes.add(p['code']);selected.append(p)
assert len(selected)>=7368, len(selected)
chosen=selected[:7368]
if len(sys.argv)>3:pathlib.Path(sys.argv[3]).write_text(json.dumps(chosen,ensure_ascii=False))
rows=[[p['code'],p['name'],p['category'],p['per100']['kcal'],p['per100']['protein'],p['per100']['fat'],p['per100']['carbs'],p['description']] for p in chosen]
plain=json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode();packed=gzip.compress(plain,compresslevel=9,mtime=0);encoded=base64.b64encode(packed).decode();parts=[]
for old in (root/'scripts/catalog/ru-packed').glob('part-*.b64'):old.unlink()
for i,start in enumerate(range(0,len(encoded),48000)):
 p=root/f'scripts/catalog/ru-packed/part-{i:03}.b64';b=(encoded[start:start+48000]+'\n').encode();p.write_bytes(b);parts.append({'path':'ru-packed/'+p.name,'sha256':sha(b)})
manifest=dict(format='racionika-off-ru-v1',count=len(chosen),totalCount=20000,baseUsdaCount=12632,packedSha256=sha(packed),unpackedSha256=sha(plain),parts=parts,source=dict(name='Open Food Facts',dataset='https://huggingface.co/datasets/openfoodfacts/product-database',revision=revision,url=f'https://huggingface.co/datasets/openfoodfacts/product-database/resolve/{revision}/food.parquet',exportSha256=sha(raw.read_bytes()),filter="list_contains(countries_tags, 'en:russia') OR lang = 'ru'"),license=dict(database='ODbL 1.0',contents='DbCL 1.0',url='https://opendatacommons.org/licenses/odbl/1-0/'),selection=dict(eligibleUnique=len(selected),selected=len(chosen),excluded=dict(counts),basis='100g only; known volume packs and ambiguous liquid labels excluded',russianMarket=sum('en:russia' in p['countries'] for p in chosen),cyrillicNames=len(chosen),brands=sum(bool(p['brands']) for p in chosen)))
(root/'scripts/catalog/ru-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print('Selected',len(chosen),'of',len(selected),'eligible; parts',len(parts),'packed',len(packed),'Russian market',manifest['selection']['russianMarket'])
