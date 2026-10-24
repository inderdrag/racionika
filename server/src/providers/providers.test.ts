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
describe('AnyModel Chat Completions', () => {
  const config = () =>
    readConfig({
      AI_PROVIDER: 'anymodel',
      ANYMODEL_API_KEY: 'test-anymodel-key',
      MODEL_FAST: 'am/vision-fast',
      MODEL_ACCURATE: 'am/vision-accurate',
      MODEL_INPUT_USD_PER_MILLION: '1',
      MODEL_OUTPUT_USD_PER_MILLION: '1',
    });
  const response = {
    choices: [{ finish_reason: 'stop', message: { content: '{"text":"ok"}' } }],
    usage: { prompt_tokens: 23, completion_tokens: 7 },
  };
  it('отправляет фото в image_url на фиксированный endpoint и читает usage', async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(response)));
    const result = await createProvider(
      config(),
      transport,
    )({
      task: 'meal',
      data: { hint: 'рис' },
      images: [{ mimeType: 'image/jpeg', data: '/9j/AA==' }],
      quality: 'accurate',
      repair: false,
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      json: { text: 'ok' },
      usage: { input_tokens: 23, output_tokens: 7, estimated_cost_usd: null },
    });
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://anymodel.org/v1/chat/completions');
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer test-anymodel-key' });
    const body = JSON.parse(String(options?.body));
    expect(body.model).toBe('am/vision-accurate');
    expect(body.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,/9j/AA==' },
    });
    expect(body.stream).toBe(false);
    expect(options?.body).not.toContain('test-anymodel-key');
    expect(body).not.toHaveProperty('tools');
  });
  it('отбрасывает length и tool_calls вместо завершённого JSON', () => {
    for (const finish_reason of ['length', 'tool_calls', 'content_filter'])
      expect(() =>
        parseProviderResponse('anymodel', {
          ...response,
          choices: [{ ...response.choices[0], finish_reason }],
        }),
      ).toThrow();
  });
  it('ключ AnyModel не берётся из OPENAI_API_KEY', () => {
    const missing = readConfig({ AI_PROVIDER: 'anymodel', OPENAI_API_KEY: 'wrong-key' });
    expect(missing.enabled).toBe(false);
    expect(config().key).toBe('test-anymodel-key');
  });
  it('не угадывает ID модели', () => {
    expect(() => readConfig({ AI_PROVIDER: 'anymodel', ANYMODEL_API_KEY: 'key' })).toThrow(
      'MODEL_FAST',
    );
  });
});
