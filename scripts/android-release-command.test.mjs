import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const app = JSON.parse(readFileSync(new URL('../app/package.json', import.meta.url), 'utf8'));
test('root release command delegates to the signed app workspace command', () => {
  assert.equal(root.scripts['apk:release'], 'npm run apk:release -w @racionika/app');
  assert.equal(
    app.scripts['apk:release'],
    'node ../scripts/android-config.mjs && npm run build && cap sync android && node ../scripts/android-build.mjs --release',
  );
});
test('signing safety tests remain part of the default test command', () => {
  assert.match(root.scripts.test, /scripts\/android-signing\.test\.mjs/);
  assert.match(root.scripts.test, /scripts\/android-release-command\.test\.mjs/);
});
test('the actual npm root command resolves its workspace script', () => {
  const dir = mkdtempSync(join(tmpdir(), 'racionika-release-command-'));
  try {
    mkdirSync(join(dir, 'app'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'release-command-test',
        private: true,
        workspaces: ['app'],
        scripts: { 'apk:release': root.scripts['apk:release'] },
      }),
    );
    // Exercise npm delegation without building Android or handling any real signing key.
    writeFileSync(
      join(dir, 'app', 'package.json'),
      JSON.stringify({
        name: '@racionika/app',
        private: true,
        scripts: { 'apk:release': 'node -e "console.log(\'release-delegation-ok\')"' },
      }),
    );
    const result = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'apk:release'],
      {
        cwd: dir,
        encoding: 'utf8',
        timeout: 30000,
        shell: process.platform === 'win32',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /release-delegation-ok/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
