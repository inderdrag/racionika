import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReleaseMetadata, prepareRelease } from './release-notes.mjs';
const notes = '# Удобный дневник\n\n## Что нового\n\n- Поиск без интернета.\n';
test('release uses the app version and a human headline, not a workflow attempt title', () => {
  const result = createReleaseMetadata({
    version: '0.3.0',
    notes,
    runNumber: '42',
    runAttempt: '2',
    sha: 'a'.repeat(40),
    repository: 'inderdrag/racionika',
    runId: '1234',
  });
  assert.equal(result.title, 'Рационика 0.3.0 — Удобный дневник');
  assert.equal(result.assetName, 'racionika-0.3.0.apk');
  assert.match(result.body, /## Что нового/);
  assert.match(result.body, /\*\*racionika-0\.3\.0\.apk\*\*/);
  assert.match(result.body, /Сборка: 42, попытка 2/);
  assert.match(result.body, /https:\/\/github.com\/inderdrag\/racionika\/actions\/runs\/1234/);
  assert.doesNotMatch(result.title, /попытка|Android APK|#42/);
});
test('handles CRLF and prerelease versions, preserves Markdown and shell punctuation as data', () => {
  const result = createReleaseMetadata({
    version: '1.2.3-beta.1',
    notes: '\uFEFF# Удобный дневник\r\n\r\n- **Работает** с $(), "кавычками" и `кодом`.\r\n',
  });
  assert.equal(result.assetName, 'racionika-1.2.3-beta.1.apk');
  assert.match(result.body, /\$\(\)/);
  assert.match(result.body, /\*\*Работает\*\*/);
  assert.doesNotMatch(result.body, /undefined/);
});
test('rejects empty descriptions, unsafe version/file names and multiline headlines', () => {
  assert.throws(() => createReleaseMetadata({ version: '../app', notes }), /version/);
  assert.throws(
    () => createReleaseMetadata({ version: '0.3.0', notes: '# Заголовок\n\n' }),
    /changes/,
  );
  assert.throws(
    () => createReleaseMetadata({ version: '0.3.0', notes: 'Описание без заголовка' }),
    /headline/,
  );
  assert.throws(
    () => createReleaseMetadata({ version: '0.3.0', notes: '# Title\u0000\n\n- Changes' }),
    /headline/,
  );
});
test('prepares both files from the checked-out app version and release notes without npm dependencies', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'racionika-release-notes-'));
  try {
    mkdirSync(join(temporary, 'app'));
    mkdirSync(join(temporary, 'docs'));
    writeFileSync(join(temporary, 'app/package.json'), JSON.stringify({ version: '2.1.0' }));
    writeFileSync(join(temporary, 'docs/RELEASE_NOTES.md'), notes);
    const result = prepareRelease(pathToFileURL(temporary + '/'), {});
    assert.equal(
      JSON.parse(readFileSync(join(temporary, 'release/metadata.json'), 'utf8')).title,
      result.title,
    );
    assert.equal(readFileSync(join(temporary, 'release/release-notes.md'), 'utf8'), result.body);
    assert.equal(result.assetName, 'racionika-2.1.0.apk');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
test('workflow pins description checkout to the built commit and keeps signed draft publication', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/android-apk.yml', import.meta.url),
    'utf8',
  );
  const job = workflow.slice(workflow.indexOf('  draft-release:'));
  assert.match(job, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(job, /node scripts\/release-notes\.mjs/);
  assert.match(job, /--draft/);
  assert.match(job, /--target "\$GITHUB_SHA"/);
  assert.match(job, /--title "\$TITLE"/);
  assert.match(job, /--notes-file release\/release-notes\.md/);
  assert.match(job, /cp release\/app-release\.apk "release\/\$ASSET"/);
});

test('actual release shell attaches the renamed unchanged APK with title, notes and draft flag', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'racionika-release-shell-'));
  try {
    mkdirSync(join(temporary, 'app'));
    mkdirSync(join(temporary, 'docs'));
    mkdirSync(join(temporary, 'bin'));
    writeFileSync(join(temporary, 'app/package.json'), JSON.stringify({ version: '0.3.0' }));
    writeFileSync(join(temporary, 'docs/RELEASE_NOTES.md'), notes);
    const metadata = prepareRelease(pathToFileURL(temporary + '/'), {});
    const apk = Buffer.from('fake signed APK bytes: no real signing keys');
    writeFileSync(join(temporary, 'release/app-release.apk'), apk);
    writeFileSync(join(temporary, 'bin/gh'), `#!/bin/sh\nprintf '%s\\n' "$@" > "$GH_CAPTURE"\n`, {
      mode: 0o755,
    });
    const workflow = readFileSync(
      new URL('../.github/workflows/android-apk.yml', import.meta.url),
      'utf8',
    );
    const job = workflow.slice(workflow.indexOf('  draft-release:'));
    const shell = job
      .split('        run: |\n')[1]
      .split('\n')
      .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
      .join('\n');
    const capture = join(temporary, 'gh-arguments.txt');
    const result = spawnSync('bash', ['-c', shell], {
      cwd: temporary,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: join(temporary, 'bin') + ':' + process.env.PATH,
        GH_CAPTURE: capture,
        GITHUB_RUN_ID: '123',
        GITHUB_RUN_ATTEMPT: '2',
        GITHUB_SHA: 'b'.repeat(40),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(join(temporary, 'release', metadata.assetName)), apk);
    const args = readFileSync(capture, 'utf8').trim().split('\n');
    assert.equal(args[0], 'release');
    assert.equal(args[1], 'create');
    assert.equal(args[2], 'android-release-123-2');
    assert.equal(args[args.indexOf('--title') + 1], metadata.title);
    assert.equal(args[args.indexOf('--notes-file') + 1], 'release/release-notes.md');
    assert.ok(args.includes('--draft'));
    assert.ok(args.includes('release/racionika-0.3.0.apk#Рационика — установочный APK'));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
