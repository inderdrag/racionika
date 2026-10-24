import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = new URL('../app/android/gradle/wrapper/gradle-wrapper.jar.base64', import.meta.url);
const destination = new URL('../app/android/gradle/wrapper/gradle-wrapper.jar', import.meta.url);
const buffer = Buffer.from(readFileSync(source, 'utf8').trim(), 'base64');
if (
  createHash('sha256').update(buffer).digest('hex') !==
  '7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172'
)
  throw new Error('Gradle wrapper SHA-256 mismatch');
writeFileSync(destination, buffer);

if (process.platform !== 'win32')
  chmodSync(new URL('../app/android/gradlew', import.meta.url), 0o755);
