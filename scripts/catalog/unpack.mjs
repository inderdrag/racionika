/** Offline, deterministic catalog materialization. No network/API or runtime decompression. */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { materializeRussianCatalog } from './unpack-ru.mjs';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function decodeCatalog(manifest, readPart) {
  if (
    manifest.format !== 'racionika-catalog-tuples-v1' ||
    !Array.isArray(manifest.parts) ||
    !manifest.parts.length
  )
    throw new Error('Unsupported catalog manifest');
  const parts = manifest.parts.map((part) => {
    if (!/^packed\/part-\d{3}\.b64$/.test(part.path)) throw new Error('Invalid catalog part path');
    const bytes = readPart(part.path);
    if (sha256(bytes) !== part.sha256) throw new Error(`Catalog checksum mismatch: ${part.path}`);
    const text = bytes.toString('utf8').trim();
    if (!/^[A-Za-z\d+/=]+$/.test(text)) throw new Error('Invalid catalog encoding');
    return text;
  });
  const compressed = Buffer.from(parts.join(''), 'base64');
  if (sha256(compressed) !== manifest.packedSha256)
    throw new Error('Packed catalog checksum mismatch');
  const plain = gunzipSync(compressed, { maxOutputLength: 24 * 1024 * 1024 });
  if (sha256(plain) !== manifest.unpackedSha256)
    throw new Error('Unpacked catalog checksum mismatch');
  const data = JSON.parse(plain.toString('utf8'));
  const ids = new Set(),
    descriptions = new Set(),
    names = new Set();
  if (
    !Array.isArray(data.rows) ||
    data.rows.length !== manifest.expandedCount ||
    !Array.isArray(data.categories) ||
    !Array.isArray(data.releases)
  )
    throw new Error('Invalid catalog shape');
  for (const row of data.rows) {
    if (!Array.isArray(row) || row.length !== 10) throw new Error('Invalid catalog row');
    const [id, name, category, form, kcal, protein, fat, carbs, description, release] = row;
    if (
      typeof id !== 'string' ||
      !/^\d{5,14}$/.test(id) ||
      ids.has(id) ||
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 160 ||
      names.has(name) ||
      typeof description !== 'string' ||
      !description.trim() ||
      description.length > 500 ||
      descriptions.has(description.toLowerCase())
    )
      throw new Error('Invalid or duplicate catalog identity');
    if (
      !Number.isInteger(category) ||
      !data.categories[category] ||
      !Number.isInteger(form) ||
      form < 0 ||
      form > 5 ||
      !Number.isInteger(release) ||
      !data.releases[release]
    )
      throw new Error('Invalid catalog classification');
    if (
      ![kcal, protein, fat, carbs].every((v) => Number.isFinite(v) && v >= 0) ||
      kcal > 1000 ||
      Math.max(protein, fat, carbs) > 100 ||
      protein + fat + carbs > 100.1
    )
      throw new Error('Invalid catalog nutrients');
    ids.add(id);
    names.add(name);
    descriptions.add(description.toLowerCase());
  }
  return data;
}
export function materializeCatalog(root = new URL('../../', import.meta.url)) {
  const dir = new URL('scripts/catalog/', root);
  const manifest = JSON.parse(readFileSync(new URL('extended-manifest.json', dir), 'utf8'));
  const data = decodeCatalog(manifest, (part) => readFileSync(new URL(part, dir)));
  const curated = JSON.parse(readFileSync(new URL('app/src/core/catalog/usda.json', root), 'utf8'));
  const ids = new Set(curated.map((p) => p.source.id));
  const names = new Set(curated.map((p) => p.name));
  if (
    curated.length !== manifest.curatedCount ||
    curated.length + data.rows.length !== manifest.count ||
    data.rows.some((row) => ids.has(row[0]) || names.has(row[1]))
  )
    throw new Error('Catalog overlaps curated records');
  const output = new URL('app/src/core/catalog/generated.json', root);
  const text = JSON.stringify(data) + '\n';
  let previous;
  try {
    previous = readFileSync(output, 'utf8');
  } catch {
    /* First install. */
  }
  if (previous !== text) {
    const temporary = fileURLToPath(output) + '.tmp';
    writeFileSync(temporary, text);
    renameSync(temporary, output);
  }
  return { count: manifest.count, expanded: data.rows.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = materializeCatalog();
  const russianCount = materializeRussianCatalog();
  console.log(
    `Offline catalog ready: ${result.count + russianCount} records (${result.count} USDA + ${russianCount} Open Food Facts).`,
  );
}
