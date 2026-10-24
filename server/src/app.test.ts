import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from './app.js';
import type { FastifyInstance } from 'fastify';
const instances: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(instances.splice(0).map((app) => app.close()));
});
async function server() {
  const app = await buildServer();
  instances.push(app);
  return app;
}
describe('Каркас сервера', () => {
  it('health отвечает без провайдера и секретов', async () => {
    const response = await (await server()).inject('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: '0.1.0' });
  });
  it('пока не открывает платные ИИ-маршруты', async () => {
    const response = await (
      await server()
    ).inject({ method: 'POST', url: '/v1/analyze-text', payload: { text: 'яйцо' } });
    expect(response.statusCode).toBe(404);
  });
  it('устанавливает security headers', async () => {
    const response = await (await server()).inject('/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
  it('не разрешает произвольный CORS origin', async () => {
    const response = await (
      await server()
    ).inject({ url: '/health', headers: { origin: 'https://evil.example' } });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('не возвращает стек ошибки', async () => {
    const response = await (
      await server()
    ).inject({
      method: 'POST',
      url: '/unknown',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('SyntaxError');
  });
});
