/** ODbL Open Food Facts partition. Data decoded at build time, never a runtime download. */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const hash = (b) => createHash('sha256').update(b).digest('hex');
export function decodeRussianCatalog(manifest, readPart) {
  if (
    manifest.format !== 'racionika-off-ru-v1' ||
    !Array.isArray(manifest.parts) ||
    !manifest.parts.length
  )
    throw new Error('Invalid Russian catalog manifest');
  const seen = new Set();
  const encoded = manifest.parts
    .map((p) => {
      if (!/^ru-packed\/part-\d{3}\.b64$/.test(p.path))
        throw new Error('Invalid Russian catalog path');
      const bytes = readPart(p.path);
      if (hash(bytes) !== p.sha256) throw new Error('Russian catalog part checksum mismatch');
      const text = bytes.toString('utf8').trim();
      if (!/^[A-Za-z\d+/=]+$/.test(text)) throw new Error('Invalid Russian catalog encoding');
      return text;
    })
    .join('');
  const packed = Buffer.from(encoded, 'base64');
  if (hash(packed) !== manifest.packedSha256)
    throw new Error('Russian catalog packed checksum mismatch');
  const plain = gunzipSync(packed, { maxOutputLength: 12 * 1024 * 1024 });
  if (hash(plain) !== manifest.unpackedSha256)
    throw new Error('Russian catalog plain checksum mismatch');
  const rows = JSON.parse(plain.toString('utf8'));
  if (
    !Array.isArray(rows) ||
    rows.length !== manifest.count ||
    manifest.baseUsdaCount + rows.length !== manifest.totalCount
  )
    throw new Error('Invalid Russian catalog count');
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 8) throw new Error('Invalid Russian catalog tuple');
    const [id, name, category, kcal, protein, fat, carbs, description] = row;
    if (
      typeof id !== 'string' ||
      !/^\d{8}(?:\d{4,6})?$/.test(id) ||
      seen.has(id) ||
      typeof name !== 'string' ||
      !/[А-Яа-яЁё]/u.test(name) ||
      name.length > 160 ||
      typeof category !== 'string' ||
      !category ||
      category.length > 80 ||
      typeof description !== 'string' ||
      !description ||
      description.length > 500
    )
      throw new Error('Invalid Russian catalog identity');
    if (
      ![kcal, protein, fat, carbs].every((n) => Number.isFinite(n) && n >= 0) ||
      kcal > 1000 ||
      Math.max(protein, fat, carbs) > 100 ||
      protein + fat + carbs > 100.1
    )
      throw new Error('Invalid Russian catalog nutrients');
    seen.add(id);
  }
  return rows;
}
export function materializeRussianCatalog(root = new URL('../../', import.meta.url)) {
  const directory = new URL('scripts/catalog/', root);
  const manifest = JSON.parse(readFileSync(new URL('ru-manifest.json', directory), 'utf8'));
  const rows = decodeRussianCatalog(manifest, (p) => readFileSync(new URL(p, directory)));
  const output = new URL('app/src/core/catalog/generated-ru.json', root),
    text = JSON.stringify(rows) + '\n';
  let previous;
  try {
    previous = readFileSync(output, 'utf8');
  } catch {
    /* First installation. */
  }
  if (previous !== text) {
    const temporary = fileURLToPath(output) + '.tmp';
    writeFileSync(temporary, text);
    renameSync(temporary, output);
  }
  return rows.length;
}
