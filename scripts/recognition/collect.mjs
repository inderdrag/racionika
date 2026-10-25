import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
// Deliberately opt-in: sends only the named reference descriptions, never personal app data.
const args = process.argv.slice(2);
const at = (key) => args[args.indexOf(key) + 1];
if (!args.includes('--run-paid') || !args.includes('--output') || !at('--output'))
  throw new Error(
    'Без запросов. Для платного прогона: --run-paid --output результат.json. Нужен RECOGNITION_BASE_URL.',
  );
const base = new URL(process.env.RECOGNITION_BASE_URL || '');
if (
  base.protocol !== 'https:' ||
  base.username ||
  base.password ||
  base.search ||
  base.hash ||
  base.pathname !== '/'
)
  throw new Error('Нужен корневой HTTPS URL сервера приложения, не URL/ключ AnyModel.');
const reference = JSON.parse(
  readFileSync(
    args.includes('--reference') ? at('--reference') : 'fixtures/recognition/reference-cases.json',
    'utf8',
  ),
);
if (
  !Array.isArray(reference.cases) ||
  !reference.cases.length ||
  reference.cases.length > 40 ||
  new Set(reference.cases.map((c) => c.id)).size !== reference.cases.length
)
  throw new Error('Нужен набор с 1–40 уникальными примерами.');
if (
  reference.cases.some(
    (c) =>
      c.kind !== 'reference_text' ||
      typeof c.text !== 'string' ||
      c.text.length < 2 ||
      c.text.length > 2000 ||
      c.images?.length,
  )
)
  throw new Error('Этот сборщик отправляет только тексты. Фотографии не загружаются.');
async function request(path, data, token) {
  const response = await globalThis.fetch(new URL(path, base), {
    method: data ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: globalThis.AbortSignal.timeout(120000),
    redirect: 'error',
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}: прогон остановлен; автоматических повторов нет.`);
  }
  return response.json();
}
const config = await request('/v1/config');
if (config.mode !== 'real' || config.maintenance)
  throw new Error('Нужен работающий реальный ИИ. Демо не является проверкой качества.');
const pkg = JSON.parse(
  readFileSync(new URL('../../packages/shared/package.json', import.meta.url), 'utf8'),
);
const auth = await request('/v1/register', {
  deviceId: randomUUID(),
  appVersion: pkg.version,
  ...(process.env.RECOGNITION_ACCESS_CODE
    ? { accessCode: process.env.RECOGNITION_ACCESS_CODE }
    : {}),
});
if (typeof auth.token !== 'string') throw new Error('Нет токена приложения.');
const result = {
  mode: 'live',
  provider: config.provider,
  collectedAt: new Date().toISOString(),
  quality: args.includes('--accurate') ? 'accurate' : 'fast',
  predictions: [],
  failures: [],
};
const persist = () => writeFileSync(at('--output'), JSON.stringify(result, null, 2) + '\n');
persist();
for (const [index, c] of reference.cases.entries()) {
  if (index) await setTimeout(7000);
  try {
    const response = await request(
      '/v1/analyze-text',
      { text: c.text, hint: '', quality: result.quality },
      auth.token,
    );
    if (response.demo || !response.analysis) throw new Error('Сервер вернул демо/неполный ответ.');
    result.predictions.push({ id: c.id, analysis: response.analysis });
    persist();
    console.log(`Записано ${result.predictions.length}/${reference.cases.length}`);
  } catch (error) {
    result.failures.push({
      id: c.id,
      message: error instanceof Error ? error.message : 'Ошибка запроса',
    });
    persist();
    throw new Error(
      'Прогон остановлен. Частичный результат сохранён; секреты в файл не записывались.',
      { cause: error },
    );
  }
}
console.log(
  'Ответы сохранены. Запустите evaluate.ts; этот текстовый прогон не измеряет точность фотографий.',
);
