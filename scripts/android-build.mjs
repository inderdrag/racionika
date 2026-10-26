import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
export function isTransientDownloadFailure(output) {
  return (
    /Could not (?:download|GET|HEAD|get resource|resolve)/i.test(output) &&
    /status code (?:408|429|50\d|52\d)\b|Gateway Time-?out|timed?\s*out|connection reset|temporary failure in name resolution|remote host terminated the handshake/i.test(
      output,
    )
  );
}
function spawnGradle(args) {
  return new Promise((resolve) => {
    const windows = process.platform === 'win32';
    const child = spawn(windows ? 'gradlew.bat' : './gradlew', args, {
      cwd: new URL('../app/android', import.meta.url),
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: windows,
    });
    let output = '';
    const remember = (chunk) => (output = (output + chunk.toString()).slice(-65536));
    child.stdout.on('data', remember);
    child.stderr.on('data', remember);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.once('error', () => {
      console.error('Проверьте Android SDK и JDK. См. docs/DEV.md');
      resolve({ status: 1, output: '' });
    });
    child.once('close', (status) => resolve({ status: status ?? 1, output }));
  });
}
export async function buildAndroid({
  release = false,
  env = process.env,
  run = spawnGradle,
  wait = delay,
  report = console.warn,
} = {}) {
  if (release) {
    for (const key of [
      'ANDROID_KEYSTORE_PATH',
      'ANDROID_KEYSTORE_PASSWORD',
      'ANDROID_KEY_ALIAS',
      'ANDROID_KEY_PASSWORD',
    ]) {
      if (!env[key]) throw new Error(`Release APK requires ${key}. See docs/RELEASE.md`);
    }
  }
  const args = [
    release ? 'assembleRelease' : 'assembleDebug',
    '--console=plain',
    '--init-script',
    fileURLToPath(new URL('./gradle-repositories.init.gradle', import.meta.url)),
  ];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await run(args);
    if (result.status === 0) return 0;
    if (attempt === 3 || !isTransientDownloadFailure(result.output)) return result.status || 1;
    const delay = attempt * 10000;
    report(`Gradle: временный сбой загрузки. Повтор ${attempt + 1}/3 через ${delay / 1000} с.`);
    await wait(delay);
  }
  return 1;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    process.exitCode = await buildAndroid({ release: process.argv.includes('--release') });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Не удалось собрать Android APK.');
    process.exitCode = 1;
  }
}
