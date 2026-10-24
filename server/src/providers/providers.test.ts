import { describe, expect, it, vi } from 'vitest';
import { createProvider, parseProviderResponse } from './index.js';
import { readConfig } from '../security/config.js';
const fixtures = {
  anthropic: {
    content: [{ type: 'text', text: '{"text":"ok"}' }],
    usage: { input_tokens: 10, output_tokens: 5 },
    stop_reason: 'end_turn',
  },
  openai: {
    status: 'completed',
    output: [{ content: [{ type: 'output_text', text: '{"text":"ok"}' }] }],
    usage: { input_tokens: 10, output_tokens: 5 },
  },
  gemini: {
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"text":"ok"}' }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  },
};
describe('Адаптеры провайдеров без платных вызовов', () => {
  for (const provider of ['anthropic', 'openai', 'gemini'] as const) {
    it(`${provider}: формат, ключ только в заголовках, фото и JSON`, async () => {
      const config = readConfig({
        AI_PROVIDER: provider,
        ANTHROPIC_API_KEY: 'test-secret',
        OPENAI_API_KEY: 'test-secret',
        GEMINI_API_KEY: 'test-secret',
        MODEL_FAST: 'test-model',
        MODEL_ACCURATE: 'accurate-model',
      });
      const transport = vi.fn<typeof fetch>(
        async () => new Response(JSON.stringify(fixtures[provider]), { status: 200 }),
      );
      const result = await createProvider(
        config,
        transport,
      )({
        task: 'meal',
        data: { text: 'яйцо' },
        images: [{ mimeType: 'image/jpeg', data: '/9j/AA==' }],
        quality: 'accurate',
        repair: false,
        signal: new AbortController().signal,
      });
      expect(result.json).toEqual({ text: 'ok' });
      expect(result.usage.input_tokens).toBe(10);
      expect(result.usage.estimated_cost_usd).toBeNull();
      const [url, options] = transport.mock.calls[0];
      expect(String(url)).not.toContain('test-secret');
      expect(options?.body).not.toContain('test-secret');
      expect(provider === 'gemini' ? String(url) : options?.body).toContain('accurate-model');
      expect(options?.body).toContain('/9j/AA==');
      expect(options?.body).toContain('JSON');
    });
  }
  it('отбрасывает незавершённые ответы', () => {
    expect(() =>
      parseProviderResponse('anthropic', { ...fixtures.anthropic, stop_reason: 'max_tokens' }),
    ).toThrow();
    expect(() =>
      parseProviderResponse('openai', { ...fixtures.openai, status: 'incomplete' }),
    ).toThrow();
    expect(() =>
      parseProviderResponse('gemini', {
        ...fixtures.gemini,
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }],
      }),
    ).toThrow();
  });
  it('не раскрывает ошибку провайдера и не повторяет 429', async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response('secret-body', { status: 429 }));
    const provider = createProvider(readConfig({ ANTHROPIC_API_KEY: 'secret' }), transport);
    await expect(
      provider({
        task: 'coach',
        data: {},
        quality: 'fast',
        repair: false,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('отвергает текст вместо JSON', async () => {
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({ ...fixtures.anthropic, content: [{ type: 'text', text: 'not JSON' }] }),
        ),
    );
    await expect(
      createProvider(
        readConfig({ ANTHROPIC_API_KEY: 'secret' }),
        transport,
      )({
        task: 'coach',
        data: {},
        quality: 'fast',
        repair: false,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'bad_ai_output' });
  });
});
