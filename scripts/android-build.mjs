import { spawnSync } from 'node:child_process';
const release = process.argv.includes('--release');
if (release) {
  for (const key of [
    'ANDROID_KEYSTORE_PATH',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    if (!process.env[key]) {
      console.error(`Release APK requires ${key}. See docs/RELEASE.md`);
      process.exit(1);
    }
  }
}
const windows = process.platform === 'win32';
const result = spawnSync(
  windows ? 'gradlew.bat' : './gradlew',
  [release ? 'assembleRelease' : 'assembleDebug'],
  {
    cwd: new URL('../app/android', import.meta.url),
    stdio: 'inherit',
    shell: windows,
  },
);
if (result.error) console.error('Проверьте Android SDK и JDK. См. docs/DEV.md');
process.exit(result.status ?? 1);
