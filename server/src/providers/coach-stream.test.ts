import { describe, expect, it, vi } from 'vitest';
import { readCoachStream } from './coach-stream.js';
import { createProvider } from './index.js';
import { readConfig } from '../security/config.js';
const event = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`;
const stop =
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
function response(data: string, chunk = 3) {
  const bytes = new TextEncoder().encode(data);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk));
        c.close();
      },
    }),
  );
}
describe('Настоящий поток AnyModel', () => {
  it('собирает UTF-8, CRLF, служебные события и usage без вывода JSON', async () => {
    const text =
      event('Привет, ') +
      event('Артём 👋') +
      'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":8}}\n\n' +
      stop;
    const seen: string[] = [];
    const r = await readCoachStream(
      response(text.replaceAll('\n', '\r\n'), 1),
      (v) => seen.push(v),
      new AbortController().signal,
    );
    expect(seen).toEqual(['Привет, ', 'Артём 👋']);
    expect(r.json.text).toBe('Привет, Артём 👋');
    expect(r.usage.input_tokens).toBe(7);
  });
  it('отклоняет незавершённый и некорректный поток', async () => {
    for (const s of [
      event('Привет'),
      'data: not-json\n\n',
      event('Привет') + 'data: {"choices":[{"finish_reason":"length"}]}\n\n',
      'data: {"error":{"secret":"key"}}\n\n',
    ])
      await expect(
        readCoachStream(response(s), () => {}, new AbortController().signal),
      ).rejects.toMatchObject({ code: 'bad_ai_output' });
  });
  it('не принимает инструменты и слишком длинный ответ', async () => {
    await expect(
      readCoachStream(
        response('data: {"choices":[{"delta":{"tool_calls":[{}]}}]}\n\n'),
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'bad_ai_output' });
    await expect(
      readCoachStream(
        response(event('a'.repeat(6001)), 9000),
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'bad_ai_output' });
  });
  it('отмена прерывает чтение, даже если новых сетевых блоков нет', async () => {
    let cancelled = false;
    const c = new AbortController();
    const response = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    );
    const result = readCoachStream(response, () => {}, c.signal);
    c.abort();
    await expect(result).rejects.toBeTruthy();
    expect(cancelled).toBe(true);
  });
  it('адаптер включает stream только для нового наставника; ключ остаётся в заголовке', async () => {
    const transport = vi.fn<typeof fetch>(async () => response(event('Ответ') + stop));
    const r = await createProvider(
      readConfig({
        AI_PROVIDER: 'anymodel',
        ANYMODEL_API_KEY: 'test-secret',
        MODEL_FAST: 'ag/test',
        MODEL_ACCURATE: 'ag/test',
      }),
      transport,
    )({
      task: 'coach',
      data: { mode: 'weekly_review' },
      quality: 'fast',
      repair: false,
      signal: new AbortController().signal,
      onText: () => {},
    });
    const [url, options] = transport.mock.calls[0];
    const body = JSON.parse(String(options?.body));
    expect(String(url)).toBe('https://anymodel.org/v1/chat/completions');
    expect(body.stream).toBe(true);
    expect(options?.body).not.toContain('test-secret');
    expect(r.json).toEqual({ text: 'Ответ' });
    expect(body.messages[0].content).toContain('без JSON');
  });
});
