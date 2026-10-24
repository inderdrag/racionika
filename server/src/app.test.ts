import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from './app.js';
import { readConfig, type ServerConfig } from './security/config.js';
import { DEMO_MEAL } from './providers/mock.js';
import type { Provider } from './providers/index.js';
const instances: Awaited<ReturnType<typeof buildServer>>[] = [];
afterEach(async () => {
  await Promise.all(instances.splice(0).map((app) => app.close()));
});
async function server(overrides: Partial<ServerConfig> = {}, provider?: Provider) {
  const app = await buildServer({
    config: {
      ...readConfig({ MOCK_AI: 'true', JWT_SECRET: 'test-secret-with-more-than-32-characters' }),
      ...overrides,
    },
    provider,
  });
  instances.push(app);
  return app;
}
async function auth(app: Awaited<ReturnType<typeof server>>, extra = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/register',
    payload: { deviceId: crypto.randomUUID(), appVersion: '0.2.0', ...extra },
  });
  expect(response.statusCode).toBe(200);
  return { authorization: `Bearer ${response.json().token}` };
}
describe('Сервер ИИ', () => {
  it('загрузка сайта не расходует минутный лимит API, защита API сохранена', async () => {
    const app = await server();
    for (let i = 0; i < 70; i++) {
      expect((await app.inject('/')).statusCode).not.toBe(429);
    }
    for (let i = 0; i < 60; i++) {
      expect((await app.inject('/v1/config')).statusCode).toBe(200);
    }
    expect((await app.inject('/v1/config')).statusCode).toBe(429);
  });
  it('health и честный деморежим', async () => {
    const app = await server();
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok', version: '0.2.1' });
    expect((await app.inject('/v1/config')).json().mode).toBe('demo');
  });
  it('закрыт без JWT', async () => {
    expect(
      (
        await (
          await server()
        ).inject({ method: 'POST', url: '/v1/analyze-text', payload: { text: 'яйцо' } })
      ).statusCode,
    ).toBe(401);
  });
  it('не принимает поддельный JWT', async () => {
    expect(
      (
        await (
          await server()
        ).inject({ url: '/v1/usage', headers: { authorization: 'Bearer fake' } })
      ).statusCode,
    ).toBe(401);
  });
  it('авторазбор и счётчик', async () => {
    const app = await server();
    const headers = await auth(app);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/analyze-text',
      headers,
      payload: { text: 'курица с рисом' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      demo: true,
      analysis: { is_food: true },
      daily: { analyses: 1 },
    });
    expect((await app.inject({ url: '/v1/usage', headers })).json().analyses).toBe(1);
  });
  it('валидация до платного вызова', async () => {
    const provider = vi.fn();
    const app = await server({}, provider);
    const headers = await auth(app);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyze-text',
          headers,
          payload: { text: 'x', url: 'https://evil' },
        })
      ).statusCode,
    ).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });
  it('отвергает псевдофото', async () => {
    const app = await server();
    const headers = await auth(app);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyze-meal',
          headers,
          payload: {
            images: [
              { mimeType: 'image/jpeg', data: Buffer.from('not a jpeg').toString('base64') },
            ],
          },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('принимает JPEG-контейнер и возвращает демо', async () => {
    const app = await server();
    const headers = await auth(app);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/analyze-meal',
      headers,
      payload: {
        images: [
          {
            mimeType: 'image/jpeg',
            data: Buffer.from([255, 216, 255, 0, 255, 217]).toString('base64'),
          },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().demo).toBe(true);
  });
  it('код доступа обязателен', async () => {
    const app = await server({ accessCode: 'private' });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/register',
      payload: { deviceId: crypto.randomUUID(), appVersion: '0.2.0', accessCode: 'wrong' },
    });
    expect(response.statusCode).toBe(403);
    await auth(app, { accessCode: 'private' });
  });
  it('старая версия отклоняется', async () => {
    const app = await server();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/register',
          payload: { deviceId: crypto.randomUUID(), appVersion: '0.1.0' },
        })
      ).statusCode,
    ).toBe(426);
  });
  it('дневная квота блокирует второй запрос', async () => {
    const app = await server({ analysisLimit: 1 });
    const headers = await auth(app);
    const request = {
      method: 'POST' as const,
      url: '/v1/analyze-text',
      headers,
      payload: { text: 'яйцо' },
    };
    expect((await app.inject(request)).statusCode).toBe(200);
    expect((await app.inject(request)).json().error.code).toBe('quota_exceeded');
  });
  it('только одна повторная попытка при неверном JSON', async () => {
    const provider = vi.fn<Provider>(async () => ({
      json: { invalid: true },
      usage: { input_tokens: 1, output_tokens: 2, estimated_cost_usd: null },
    }));
    const app = await server({}, provider);
    const headers = await auth(app);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyze-text',
          headers,
          payload: { text: 'яйцо' },
        })
      ).statusCode,
    ).toBe(502);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls[1][0]).toMatchObject({ repair: true });
  });
  it('повторная попытка входит в глобальный бюджет', async () => {
    const provider = vi.fn<Provider>(async () => ({
      json: { invalid: true },
      usage: { input_tokens: 1, output_tokens: 2, estimated_cost_usd: null },
    }));
    const app = await server({ globalCap: 1 }, provider);
    const headers = await auth(app);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyze-text',
          headers,
          payload: { text: 'яйцо' },
        })
      ).json().error.code,
    ).toBe('quota_exceeded');
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('не повторяет сетевые ошибки и не раскрывает их', async () => {
    const provider = vi.fn(async () => {
      throw new Error('SECRET-KEY');
    });
    const app = await server({}, provider);
    const headers = await auth(app);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/analyze-text',
      headers,
      payload: { text: 'яйцо' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('SECRET');
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('lookup и наставник доступны с теми же защитами', async () => {
    const app = await server();
    const headers = await auth(app);
    for (const [url, payload] of [
      ['/v1/lookup-food', { name: 'яблоко' }],
      ['/v1/coach', { message: 'Как сделать обед сытнее?', summary: '', history: [] }],
    ] as const) {
      const response = await app.inject({ method: 'POST', url, headers, payload });
      expect(response.statusCode).toBe(200);
      expect(response.json().demo).toBe(true);
    }
  });
  it('недоступность и обслуживание не притворяются анализом', async () => {
    for (const config of [{ enabled: false }, { maintenance: true }]) {
      const app = await server(config);
      const headers = await auth(app);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/analyze-text',
            headers,
            payload: { text: 'яйцо' },
          })
        ).statusCode,
      ).toBe(503);
    }
  });
  it('security headers и CORS', async () => {
    const response = await (
      await server()
    ).inject({ url: '/health', headers: { origin: 'https://evil.example' } });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('схема ответа проверяется перед отдачей', async () => {
    const provider = vi.fn(async () => ({
      json: DEMO_MEAL,
      usage: { input_tokens: 10, output_tokens: 20, estimated_cost_usd: null },
    }));
    const app = await server({ mock: false }, provider);
    const headers = await auth(app);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/analyze-text',
          headers,
          payload: { text: 'яйцо' },
        })
      ).json(),
    ).toMatchObject({ demo: false, usage: { input_tokens: 10 } });
  });
  it('production требует секреты и запрещает mock', () => {
    expect(() => readConfig({ NODE_ENV: 'production', MOCK_AI: 'true' })).toThrow();
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow();
    expect(() => readConfig({ AI_PROVIDER: 'unknown' })).toThrow();
  });
});
it('общий IP rate limit возвращает429', async () => {
  const app = await server();
  let status = 200;
  for (let i = 0; i < 61; i++) status = (await app.inject('/v1/config')).statusCode;
  expect(status).toBe(429);
});
