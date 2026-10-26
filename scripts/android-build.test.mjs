import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAndroid, isTransientDownloadFailure } from './android-build.mjs';
const network =
  'Could not download kotlin-compiler-embeddable-2.0.21.jar. Could not GET resource. Received status code 504 from server: Gateway Time-out';
const signing = {
  ANDROID_KEYSTORE_PATH: '/unused.p12',
  ANDROID_KEYSTORE_PASSWORD: 'test-only',
  ANDROID_KEY_ALIAS: 'test',
  ANDROID_KEY_PASSWORD: 'test-only',
};
test('recognizes transient Maven download failures, not code or signing errors', () => {
  assert.equal(isTransientDownloadFailure(network), true);
  assert.equal(isTransientDownloadFailure('Could not GET resource: Read timed out'), true);
  assert.equal(isTransientDownloadFailure('Could not GET resource: status code 503'), true);
  for (const text of [
    'Compilation failed',
    'Keystore password was incorrect',
    'Could not GET resource: status code 404',
    'Could not GET resource: status code 401',
    'Task failed with status code 504',
  ])
    assert.equal(isTransientDownloadFailure(text), false);
});
test('release retries a network failure, preserves release task and mirror init on each attempt', async () => {
  const calls = [],
    waits = [];
  const status = await buildAndroid({
    release: true,
    env: signing,
    report: () => {},
    wait: async (ms) => {
      waits.push(ms);
    },
    run: async (args) => {
      calls.push([...args]);
      return calls.length === 1 ? { status: 1, output: network } : { status: 0, output: '' };
    },
  });
  assert.equal(status, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [10000]);
  for (const args of calls) {
    assert.equal(args[0], 'assembleRelease');
    assert.equal(args.includes('assembleDebug'), false);
    assert.equal(args[2], '--init-script');
    assert.match(args[3], /gradle-repositories\.init\.gradle$/);
  }
});
test('stops after three network attempts and returns failure', async () => {
  let count = 0;
  const waits = [];
  const status = await buildAndroid({
    report: () => {},
    wait: async (ms) => {
      waits.push(ms);
    },
    run: async () => {
      count++;
      return { status: 1, output: network };
    },
  });
  assert.equal(status, 1);
  assert.equal(count, 3);
  assert.deepEqual(waits, [10000, 20000]);
});
test('never retries compilation or signing failures', async () => {
  for (const output of ['Compilation failed', 'Keystore password was incorrect']) {
    let count = 0;
    assert.equal(
      await buildAndroid({
        run: async () => {
          count++;
          return { status: 1, output };
        },
        wait: async () => assert.fail('Must not wait'),
      }),
      1,
    );
    assert.equal(count, 1);
  }
});
test('release still requires every signing input before invoking Gradle', async () => {
  for (const key of Object.keys(signing))
    await assert.rejects(
      buildAndroid({
        release: true,
        env: { ...signing, [key]: '' },
        run: async () => assert.fail('Must not run unsigned'),
      }),
      /Release APK requires/,
    );
});
test('mirror is official HTTPS and limited to Kotlin; no arbitrary GitHub JAR downloads', () => {
  const init = readFileSync(new URL('./gradle-repositories.init.gradle', import.meta.url), 'utf8');
  assert.match(init, /https:\/\/maven-central\.storage-download\.googleapis\.com\/maven2/);
  assert.match(init, /includeGroupByRegex/);
  assert.match(init, /addFirst/);
  assert.doesNotMatch(init, /allowInsecureProtocol|github\.com/);
});
