import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const windows = process.platform === 'win32';
for (const [name, args] of [
  ['node', ['--version']],
  ['npm', ['--version']],
  ['java', ['-version']],
  ['adb', ['version']],
]) {
  const result = spawnSync(windows && name === 'npm' ? 'npm.cmd' : name, args, {
    encoding: 'utf8',
    shell: windows && name === 'npm',
  });
  console.log(
    `${result.status === 0 ? '✓' : '✗'} ${name}: ${result.status === 0 ? (result.stdout || result.stderr).split('\n')[0] : 'не найден; смотрите docs/DEV.md'}`,
  );
}
console.log(
  'Android SDK:',
  process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || 'не задан ANDROID_HOME',
);
console.log(
  'server/.env:',
  existsSync('server/.env') ? 'найден' : 'не нужен для /health; понадобится позже',
);
