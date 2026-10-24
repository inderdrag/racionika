import { describe, expect, it } from 'vitest';
import { Limits, olderVersion } from './limits.js';
import { readConfig } from './config.js';
describe('Квоты и версии', () => {
  it('обновляет квоты в полночь UTC', () => {
    let now = Date.parse('2026-10-24T23:59:59Z');
    const limits = new Limits({ ...readConfig({}), analysisLimit: 1 }, () => now);
    limits.consume('a', 'ip', 'analyses');
    expect(() => limits.consume('a', 'ip', 'analyses')).toThrow();
    now += 2000;
    limits.consume('a', 'ip', 'analyses');
    expect(limits.usage('a').analyses).toBe(1);
  });
  it('IP-квота действует на разные устройства', () => {
    const limits = new Limits({ ...readConfig({}), ipDailyCap: 1 });
    limits.consume('a', 'same', 'analyses');
    expect(() => limits.consume('b', 'same', 'chat')).toThrow();
  });
  it('скользящий лимит истекает', () => {
    let now = Date.now();
    const limits = new Limits(readConfig({}), () => now);
    limits.rate('a', 1);
    expect(() => limits.rate('a', 1)).toThrow();
    now += 60001;
    limits.rate('a', 1);
  });
  it('сравнивает версии численно', () => {
    expect(olderVersion('0.10.0', '0.2.0')).toBe(false);
    expect(olderVersion('0.1.9', '0.2.0')).toBe(true);
  });
});
describe('Конфигурация публичного сайта', () => {
  const env = {
    NODE_ENV: 'production',
    AI_PROVIDER: 'anymodel',
    ANYMODEL_API_KEY: 'test-key',
    JWT_SECRET: 'a'.repeat(48),
    SERVE_WEB: 'true',
    MODEL_FAST: 'am/test-vision',
    MODEL_ACCURATE: 'am/test-vision',
  };
  it('требует отдельный код доступа', () => {
    expect(() => readConfig(env)).toThrow('APP_ACCESS_CODE');
  });
  it('принимает закрытую конфигурацию сайта', () => {
    expect(readConfig({ ...env, APP_ACCESS_CODE: 'private-code' })).toMatchObject({
      serveWeb: true,
      provider: 'anymodel',
      production: true,
      mock: false,
    });
  });
});
