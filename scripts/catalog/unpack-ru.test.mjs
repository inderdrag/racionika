import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeRussianCatalog, materializeRussianCatalog } from './unpack-ru.mjs';
const directory = new URL('./', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('ru-manifest.json', directory), 'utf8'));
const read = (path) => readFileSync(new URL(path, directory));
test('Russian partition materializes offline and brings total to 20000', () => {
  const rows = decodeRussianCatalog(manifest, read);
  assert.equal(rows.length, 7368);
  assert.equal(rows.length + manifest.baseUsdaCount, 20000);
  assert.equal(materializeRussianCatalog(), rows.length);
  assert.equal(new Set(rows.map((r) => r[0])).size, rows.length);
});
test('Russian partition rejects corruption and unsafe paths', () => {
  assert.throws(() => decodeRussianCatalog(manifest, () => Buffer.from('AAAA')), /checksum/);
  assert.throws(
    () => decodeRussianCatalog({ ...manifest, packedSha256: '0'.repeat(64) }, read),
    /checksum/,
  );
  assert.throws(
    () => decodeRussianCatalog({ ...manifest, unpackedSha256: '0'.repeat(64) }, read),
    /checksum/,
  );
  assert.throws(
    () => decodeRussianCatalog({ ...manifest, parts: [{ path: '../escape' }] }, read),
    /path/,
  );
});
