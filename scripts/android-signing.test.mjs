import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { signingInputs, releaseVersionCode, certificateHash } from './android-signing.mjs';
const env = {
  ANDROID_KEYSTORE_BASE64: Buffer.alloc(512, 7).toString('base64'),
  ANDROID_KEYSTORE_PASSWORD: 'not-a-real-key-password',
  ANDROID_KEY_ALIAS: 'racionika',
  ANDROID_KEY_PASSWORD: 'not-a-real-key-password',
  ANDROID_SIGNING_CERT_SHA256: 'ab'.repeat(32),
};
test('all signing inputs are mandatory, no random debug fallback', () => {
  for (const key of Object.keys(env))
    assert.throws(() => signingInputs({ ...env, [key]: '' }), /Missing/);
});
test('rejects malformed or oversized key without echoing the value', () => {
  for (const value of ['secret: invalid key', 'AAAA', 'A'.repeat(48004)]) {
    assert.throws(
      () => signingInputs({ ...env, ANDROID_KEYSTORE_BASE64: value }),
      /Invalid signing/,
    );
  }
});
test('normalizes the public certificate fingerprint and rejects invalid pins', () => {
  assert.equal(
    signingInputs({ ...env, ANDROID_SIGNING_CERT_SHA256: 'AB:'.repeat(31) + 'AB' }).fingerprint,
    'ab'.repeat(32),
  );
  assert.throws(() => signingInputs({ ...env, ANDROID_SIGNING_CERT_SHA256: 'wrong' }), /SHA-256/);
});
test('certificate hash is deterministic and changes with the certificate', () => {
  assert.equal(
    certificateHash(Buffer.from('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.notEqual(certificateHash(Buffer.from('abc')), certificateHash(Buffer.from('abcd')));
});
test('versionCode grows per run and is unchanged by a retry of the same run', () => {
  assert.equal(releaseVersionCode('12'), 1012);
  assert.equal(releaseVersionCode('13'), 1013);
  assert.equal(releaseVersionCode('12', '2000'), 2012);
});
test('rejects invalid, unsafe or overflow build counters', () => {
  for (const run of [undefined, '0', '-1', '1.5', 'NaN', '2100000000'])
    assert.throws(() => releaseVersionCode(run));
  assert.throws(() => releaseVersionCode('1', '0'));
});

test('Gradle versionCode uses assignment before numeric conversion', () => {
  const gradle = readFileSync(new URL('../app/android/app/build.gradle', import.meta.url), 'utf8');
  assert.match(
    gradle,
    /^\s*versionCode\s*=\s*\(System\.getenv\('ANDROID_VERSION_CODE'\)\s*\?:\s*'5'\)\.toInteger\(\)\s*$/m,
  );
  assert.doesNotMatch(gradle, /^\s*versionCode\s+\(/m);
});
