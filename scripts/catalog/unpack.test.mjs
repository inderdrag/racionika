import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCatalog, materializeCatalog } from './unpack.mjs';
const directory = new URL('./', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('extended-manifest.json', directory), 'utf8'));
const read = (path) => readFileSync(new URL(path, directory));
test('materializes more than 10000 records offline with pinned checksums', () => {
  const data = decodeCatalog(manifest, read);
  assert.equal(data.rows.length, manifest.expandedCount);
  assert.ok(data.rows.length + manifest.curatedCount >= 10000);
  assert.equal(materializeCatalog().count, manifest.count);
});
test('rejects corrupted source chunks, wrong manifest and decompressed checksum', () => {
  assert.throws(() => decodeCatalog(manifest, () => Buffer.from('AAAA')), /checksum/);
  assert.throws(() => decodeCatalog({ ...manifest, format: 'unknown' }, read), /manifest/);
  assert.throws(
    () => decodeCatalog({ ...manifest, unpackedSha256: '0'.repeat(64) }, read),
    /checksum/,
  );
  assert.throws(
    () => decodeCatalog({ ...manifest, parts: [{ path: '../escape.b64', sha256: '' }] }, read),
    /path/,
  );
});
