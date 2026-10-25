import { ApiFailure } from '../security/errors.js';
// SSE is parsed incrementally, including UTF-8 split across network chunks.
export async function readCoachStream(
  response: Response,
  onText: (delta: string) => void,
  signal: AbortSignal,
) {
  if (!response.body) throw new ApiFailure('provider_error', 502, 'ИИ не прислал ответ.');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  const cancelRead = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancelRead, { once: true });
  let buffer = '',
    text = '',
    bytes = 0,
    finished = false,
    input = 0,
    output = 0;
  const bad = () => new ApiFailure('bad_ai_output', 502, 'Ответ ИИ не завершён. Попробуйте снова.');
  function event(block: string) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') return;
    let value: {
      error?: unknown;
      choices?: {
        index?: number;
        delta?: { content?: unknown; tool_calls?: unknown; refusal?: unknown };
        finish_reason?: string | null;
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      value = JSON.parse(data);
    } catch {
      throw bad();
    }
    if (!value || typeof value !== 'object' || value.error) throw bad();
    if (value.usage) {
      const u = value.usage;
      if (
        typeof u.prompt_tokens === 'number' &&
        Number.isFinite(u.prompt_tokens) &&
        u.prompt_tokens >= 0
      )
        input = u.prompt_tokens;
      if (
        typeof u.completion_tokens === 'number' &&
        Number.isFinite(u.completion_tokens) &&
        u.completion_tokens >= 0
      )
        output = u.completion_tokens;
    }
    if (!Array.isArray(value.choices)) throw bad();
    for (const c of value.choices) {
      if (c.index !== undefined && c.index !== 0) continue;
      if (c.delta?.tool_calls || c.delta?.refusal) throw bad();
      const part = c.delta?.content;
      if (part !== undefined && part !== null && typeof part !== 'string') throw bad();
      if (typeof part === 'string' && part) {
        if (finished) throw bad();
        text += part;
        if (text.length > 6000)
          throw new ApiFailure(
            'bad_ai_output',
            502,
            'Ответ слишком длинный. Задайте более короткий вопрос.',
          );
        onText(part);
      }
      if (c.finish_reason) {
        if (c.finish_reason !== 'stop') throw bad();
        finished = true;
      }
    }
  }
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 262144) throw bad();
      buffer += decoder.decode(chunk.value, { stream: true });
      buffer = buffer.replaceAll('\r\n', '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        event(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (buffer.length > 65536) throw bad();
    }
    buffer += decoder.decode();
    if (buffer.trim()) event(buffer);
    signal.throwIfAborted();
    if (!finished || !text.trim()) throw bad();
    return {
      json: { text },
      usage: { input_tokens: input, output_tokens: output, estimated_cost_usd: null },
    };
  } finally {
    signal.removeEventListener('abort', cancelRead);
    await reader.cancel().catch(() => {});
  }
}
