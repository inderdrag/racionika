import { mkdirSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
export function signingInputs(env) {
  for (const key of [
    'ANDROID_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
    'ANDROID_SIGNING_CERT_SHA256',
  ]) {
    if (!env[key]?.trim())
      throw new Error(`Missing ${key}. Follow docs/RELEASE.md; never paste secrets in logs.`);
  }
  const base64 = env.ANDROID_KEYSTORE_BASE64.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > 48000 || base64.length % 4 !== 0)
    throw new Error('Invalid signing key encoding.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 256 || bytes.toString('base64') !== base64)
    throw new Error('Invalid signing key file.');
  const fingerprint = env.ANDROID_SIGNING_CERT_SHA256.replace(/[:\s]/g, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Invalid certificate SHA-256 pin.');
  return { bytes, fingerprint };
}
export function releaseVersionCode(runNumber, base = '1000') {
  if (!/^\d+$/.test(runNumber ?? '') || !/^\d+$/.test(base))
    throw new Error('Invalid Android build counter.');
  const value = Number(base) + Number(runNumber);
  if (
    !Number.isSafeInteger(value) ||
    Number(runNumber) < 1 ||
    Number(base) < 5 ||
    value > 2100000000
  )
    throw new Error('Android versionCode out of range. Never lower the version base.');
  return value;
}
export function certificateHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  let keyPath, certPath;
  try {
    const { bytes, fingerprint } = signingInputs(process.env);
    if (!process.env.RUNNER_TEMP || !process.env.GITHUB_ENV)
      throw new Error('This helper runs inside GitHub Actions.');
    const code = releaseVersionCode(
      process.env.GITHUB_RUN_NUMBER,
      process.env.ANDROID_VERSION_CODE_BASE || '1000',
    );
    mkdirSync(process.env.RUNNER_TEMP, { recursive: true });
    keyPath = join(process.env.RUNNER_TEMP, 'racionika-release.p12');
    certPath = join(process.env.RUNNER_TEMP, 'racionika-release-cert.der');
    writeFileSync(keyPath, bytes, { mode: 0o600 });
    const result = spawnSync(
      'keytool',
      [
        '-exportcert',
        '-keystore',
        keyPath,
        '-storetype',
        'PKCS12',
        '-storepass:env',
        'ANDROID_KEYSTORE_PASSWORD',
        '-alias',
        process.env.ANDROID_KEY_ALIAS,
        '-file',
        certPath,
      ],
      { encoding: 'utf8', env: process.env },
    );
    if (result.status !== 0)
      throw new Error(
        'Cannot open signing certificate. Check the keystore, alias and password in Secrets.',
      );
    const { readFileSync } = await import('node:fs');
    if (certificateHash(readFileSync(certPath)) !== fingerprint)
      throw new Error(
        'Signing certificate changed. Build stopped to protect update compatibility.',
      );
    appendFileSync(
      process.env.GITHUB_ENV,
      `ANDROID_KEYSTORE_PATH=${keyPath}\nANDROID_EXPECTED_CERT_SHA256=${fingerprint}\nANDROID_VERSION_CODE=${code}\n`,
    );
    console.log(`Signing certificate verified; Android versionCode ${code}.`);
  } catch (error) {
    if (keyPath) rmSync(keyPath, { force: true });
    console.error(error instanceof Error ? error.message : 'Signing preparation failed.');
    process.exitCode = 1;
  } finally {
    if (certPath) rmSync(certPath, { force: true });
  }
}
