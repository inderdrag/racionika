/** Human-facing release metadata; no git-log scraping or secrets in descriptions. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export function createReleaseMetadata({
  version,
  notes,
  sha = '',
  repository = '',
  runId = '',
  runNumber = '',
  runAttempt = '',
  serverUrl = 'https://github.com',
}) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\dA-Za-z.-]+)?$/.test(version))
    throw new Error('Invalid app version for release');
  const text = notes
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const [first, ...rest] = text.split('\n');
  const match = /^# ([^\r\n]+)$/u.exec(first);
  if (
    !match ||
    !match[1].trim() ||
    match[1].trim().length > 120 ||
    [...match[1]].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error('Release notes must start with a short # headline');
  const changes = rest.join('\n').trim();
  if (!changes || changes.length > 20000)
    throw new Error('Release notes must describe the changes');
  const title = `Рационика ${version} — ${match[1].trim()}`;
  const assetName = `racionika-${version}.apk`;
  const technical = [];
  if (runNumber && /^\d+$/.test(runNumber))
    technical.push(
      `Сборка: ${runNumber}${/^\d+$/.test(runAttempt) ? `, попытка ${runAttempt}` : ''}.`,
    );
  if (/^[a-f\d]{40}$/i.test(sha)) technical.push(`Коммит: \`${sha}\`.`);
  if (
    /^[\w.-]+\/[\w.-]+$/.test(repository) &&
    /^\d+$/.test(runId) &&
    /^https:\/\/[\w.-]+$/.test(serverUrl)
  )
    technical.push(
      `[Проверить сборку в Actions](${serverUrl}/${repository}/actions/runs/${runId}).`,
    );
  const body = `${changes}\n\n## Установка и обновление\n\n- Скачайте **${assetName}** из файлов релиза ниже и откройте на Android. Распаковывать APK не нужно.\n- Новую версию устанавливайте поверх предыдущей с той же подписью. Перед обновлением рекомендуем сохранить JSON-копию дневника.\n- Поиск продуктов и дневник работают без интернета. Для распознавания фото и ИИ-наставника нужен интернет.\n${technical.length ? `\n<details>\n<summary>Сведения о сборке</summary>\n\n${technical.join('\n\n')}\n\n</details>\n` : ''}`;
  return { title, assetName, body };
}
export function prepareRelease(root = new URL('../', import.meta.url), env = process.env) {
  const app = JSON.parse(readFileSync(new URL('app/package.json', root), 'utf8'));
  const metadata = createReleaseMetadata({
    version: app.version,
    notes: readFileSync(new URL('docs/RELEASE_NOTES.md', root), 'utf8'),
    sha: env.GITHUB_SHA,
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runNumber: env.GITHUB_RUN_NUMBER,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    serverUrl: env.GITHUB_SERVER_URL,
  });
  const directory = new URL('release/', root);
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL('metadata.json', directory), JSON.stringify(metadata, null, 2) + '\n');
  writeFileSync(new URL('release-notes.md', directory), metadata.body);
  return metadata;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const metadata = prepareRelease();
  console.log(`Release title: ${metadata.title}`);
  console.log(`APK filename: ${metadata.assetName}`);
}
