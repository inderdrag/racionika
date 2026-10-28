#!/usr/bin/env python3
"""Optional ingestion tool, not an app/build dependency. Requires pip install duckdb.
Usage: python scripts/catalog/fetch-ru.py /path/to/export.jsonl
Reads only needed columns from the immutable public OFF Parquet snapshot.
"""
import duckdb,json,pathlib,sys
root=pathlib.Path(__file__).resolve().parents[2]
manifest=json.loads((root/'scripts/catalog/ru-manifest.json').read_text())
output=str(pathlib.Path(sys.argv[1]).resolve())
connection=duckdb.connect();connection.execute('SET threads=4');connection.execute("SET memory_limit='2GB'")
connection.execute('INSTALL httpfs');connection.execute('LOAD httpfs')
# Keep source projection and serialization stable, then canonicalize row order.
connection.execute("COPY (SELECT code, product_name, brands, nutriments, nutrition_data_per, product_quantity_unit, countries_tags, categories_tags, lang FROM read_parquet(?) WHERE list_contains(countries_tags,'en:russia') OR lang = 'ru') TO '"+output.replace("'","''")+"' (FORMAT JSON)",[manifest['source']['url']])
lines=pathlib.Path(output).read_text().splitlines();lines.sort(key=lambda line:json.loads(line)['code'])
pathlib.Path(output).write_text('\n'.join(lines)+'\n')
print('Saved source projection:',len(lines),'rows')
