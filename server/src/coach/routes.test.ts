import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../app.js';
import { readConfig, type ServerConfig } from '../security/config.js';
import type { Provider } from '../providers/index.js';
const servers: Awaited<ReturnType<typeof buildServer>>[] = [];
const tick = () => new Promise<void>((r) => setImmediate(r));
async function setup(provider: Provider, overrides: Partial<ServerConfig> = {}) {
  const app = await buildServer({
    config: {
      ...readConfig({
        MOCK_AI: 'true',
        JWT_SECRET: 'a-long-test-secret-with-more-than-32-characters',
      }),
      ...overrides,
    },
    provider,
  });
  servers.push(app);
  const register = async () => ({
    authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/v1/register', payload: { deviceId: crypto.randomUUID(), appVersion: '0.3.0' } })).json().token}`,
  });
  return { app, headers: await register(), register };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
const body = {
  message: 'Разбор недели',
  summary: '{}',
  history: [],
  goal: 'maintain',
  mode: 'weekly_review',
};
describe('Авторизованные задания наставника', () => {
  it('передаёт режим, показывает частичный ответ, ограничивает параллелизм и считает квоту один раз', async () => {
    let done!: (v: {
      json: { text: string };
      usage: { input_tokens: number; output_tokens: number; estimated_cost_usd: null };
    }) => void;
    const provider = vi.fn<Provider>(async (input) => {
      input.onText?.('Начало');
      return new Promise((r) => (done = r));
    });
    const { app, headers } = await setup(provider);
    const start = await app.inject({
      method: 'POST',
      url: '/v1/coach/jobs',
      headers,
      payload: body,
    });
    expect(start.statusCode).toBe(200);
    const path = '/v1/coach/jobs/' + start.json().id;
    for (let i = 0; i < 12; i++)
      expect((await app.inject({ url: path, headers })).json()).toMatchObject({
        status: 'running',
        text: 'Начало',
        streamed: true,
      });
    expect((await app.inject({ url: '/v1/usage', headers })).json().chat).toBe(1);
    expect(
      (await app.inject({ method: 'POST', url: '/v1/coach/jobs', headers, payload: body }))
        .statusCode,
    ).toBe(429);
    expect(provider.mock.calls[0][0].data).toMatchObject({ mode: 'weekly_review' });
    done({
      json: { text: 'Начало' },
      usage: { input_tokens: 1, output_tokens: 2, estimated_cost_usd: null },
    });
    await tick();
    expect((await app.inject({ url: path, headers })).json().status).toBe('done');
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('не разрешает чужое чтение/отмену и отменяет генерацию владельца', async () => {
    let signal!: AbortSignal;
    const { app, headers, register } = await setup(async (input) => {
      signal = input.signal;
      return new Promise(() => {});
    });
    const id = (
        await app.inject({ method: 'POST', url: '/v1/coach/jobs', headers, payload: body })
      ).json().id,
      path = '/v1/coach/jobs/' + id,
      other = await register();
    expect((await app.inject(path)).statusCode).toBe(401);
    expect((await app.inject({ url: path, headers: other })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: path + '/cancel', headers: other })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: path + '/cancel', headers })).json().status,
    ).toBe('cancelled');
    expect(signal.aborted).toBe(true);
  });
  it('не возвращает необработанную ошибку провайдера и не делает платный повтор', async () => {
    const provider = vi.fn<Provider>(async () => {
      throw new Error('SECRET');
    });
    const { app, headers } = await setup(provider);
    const id = (
      await app.inject({ method: 'POST', url: '/v1/coach/jobs', headers, payload: body })
    ).json().id;
    await tick();
    const r = await app.inject({ url: '/v1/coach/jobs/' + id, headers });
    expect(r.json().status).toBe('error');
    expect(r.body).not.toContain('SECRET');
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('отключённый/обслуживаемый сервер не запускает провайдера', async () => {
    for (const config of [{ enabled: false }, { maintenance: true }]) {
      const provider = vi.fn<Provider>();
      const { app, headers } = await setup(provider, config);
      expect(
        (await app.inject({ method: 'POST', url: '/v1/coach/jobs', headers, payload: body }))
          .statusCode,
      ).toBe(503);
      expect(provider).not.toHaveBeenCalled();
    }
  });
  it('не принимает неизвестный режим', async () => {
    const provider = vi.fn<Provider>();
    const { app, headers } = await setup(provider);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/coach/jobs',
          headers,
          payload: { ...body, mode: 'system' },
        })
      ).statusCode,
    ).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });
});
