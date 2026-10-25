import { z } from 'zod';
import type { ProviderUsage } from '@racionika/shared';
import type { ServerConfig } from '../security/config.js';
import { ApiFailure } from '../security/errors.js';
import { coachTextPrompt, systemPrompt, type Task } from '../prompts/index.js';
import { mockReply } from './mock.js';
import { readCoachStream } from './coach-stream.js';
export interface ProviderInput {
  task: Task;
  data: unknown;
  images?: { mimeType: 'image/jpeg'; data: string }[];
  quality: 'fast' | 'accurate';
  repair: boolean;
  repairReason?: string;
  onText?: (delta: string) => void;
  signal: AbortSignal;
}
export interface ProviderResult {
  json: unknown;
  usage: ProviderUsage;
}
export type Provider = (input: ProviderInput) => Promise<ProviderResult>;
const usageSchema = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  promptTokenCount: z.number().optional(),
  candidatesTokenCount: z.number().optional(),
});
const block = z.object({ type: z.string().optional(), text: z.string().optional() });
async function boundedJson(response: Response) {
  if (!response.body) throw new ApiFailure('provider_error', 502, 'ИИ временно недоступен.');
  const reader = response.body.getReader();
  const buffers: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 262144)
        throw new ApiFailure(
          'bad_ai_output',
          502,
          'ИИ прислал слишком большой ответ. Попробуйте проще описать блюдо.',
        );
      buffers.push(item.value);
    }
    return JSON.parse(Buffer.concat(buffers).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export function parseProviderResponse(
  provider: ServerConfig['provider'],
  raw: unknown,
): { text: string; input: number; output: number } {
  if (provider === 'anymodel') {
    const value = z
      .object({
        choices: z
          .array(
            z.object({
              finish_reason: z.string(),
              message: z.object({ content: z.string().min(1) }),
            }),
          )
          .min(1),
        usage: z.object({
          prompt_tokens: z.number().finite().nonnegative(),
          completion_tokens: z.number().finite().nonnegative(),
        }),
      })
      .parse(raw);
    if (value.choices[0].finish_reason !== 'stop')
      throw new ApiFailure('bad_ai_output', 502, 'ИИ не завершил ответ. Уточните описание блюда.');
    return {
      text: value.choices[0].message.content,
      input: value.usage.prompt_tokens,
      output: value.usage.completion_tokens,
    };
  }
  if (provider === 'anthropic') {
    const value = z
      .object({
        content: z.array(block),
        usage: usageSchema,
        stop_reason: z.string().nullable().optional(),
      })
      .parse(raw);
    if (value.stop_reason === 'max_tokens')
      throw new ApiFailure(
        'bad_ai_output',
        502,
        'Ответ ИИ не завершён. Попробуйте описать меньше продуктов.',
      );
    return {
      text: value.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join(''),
      input: value.usage.input_tokens ?? 0,
      output: value.usage.output_tokens ?? 0,
    };
  }
  if (provider === 'openai') {
    const value = z
      .object({
        status: z.string().optional(),
        output: z.array(z.object({ content: z.array(block).optional() })),
        usage: usageSchema,
      })
      .parse(raw);
    if (value.status && value.status !== 'completed')
      throw new ApiFailure('bad_ai_output', 502, 'ИИ не завершил ответ.');
    return {
      text: value.output
        .flatMap((b) => b.content ?? [])
        .filter((b) => b.type === 'output_text')
        .map((b) => b.text ?? '')
        .join(''),
      input: value.usage.input_tokens ?? 0,
      output: value.usage.output_tokens ?? 0,
    };
  }
  const value = z
    .object({
      candidates: z
        .array(
          z.object({
            finishReason: z.string().optional(),
            content: z.object({
              parts: z.array(
                z.object({ text: z.string().optional(), thought: z.boolean().optional() }),
              ),
            }),
          }),
        )
        .min(1),
      usageMetadata: usageSchema,
    })
    .parse(raw);
  const candidate = value.candidates[0];
  if (candidate.finishReason && candidate.finishReason !== 'STOP')
    throw new ApiFailure('bad_ai_output', 502, 'ИИ не завершил ответ.');
  return {
    text: candidate.content.parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join(''),
    input: value.usageMetadata.promptTokenCount ?? 0,
    output: value.usageMetadata.candidatesTokenCount ?? 0,
  };
}
export function createProvider(config: ServerConfig, transport: typeof fetch = fetch): Provider {
  return async (input) => {
    if (config.mock)
      return {
        json: mockReply(input.task),
        usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
      };
    const model = input.quality === 'accurate' ? config.modelAccurate : config.modelFast;
    const text = JSON.stringify({
      data: input.data,
      repair: input.repair
        ? `Предыдущий ответ не прошёл проверку. ${input.repairReason ?? 'Исправь формат и границы чисел.'} Не меняй заданные пользователем массы и этикетку. Верни полный JSON.`
        : undefined,
    });
    const streaming = config.provider === 'anymodel' && input.task === 'coach' && !!input.onText;
    const system = streaming ? coachTextPrompt() : systemPrompt(input.task);
    const images = input.images ?? [];
    const maxTokens = input.task === 'meal' ? 4500 : input.onText ? 3200 : 1800;
    let url: string, headers: Record<string, string>, body: unknown;
    if (config.provider === 'anymodel') {
      url = 'https://anymodel.org/v1/chat/completions';
      headers = { Authorization: `Bearer ${config.key}` };
      body = {
        model,
        stream: streaming,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text },
              ...images.map((image) => ({
                type: 'image_url',
                image_url: { url: `data:${image.mimeType};base64,${image.data}` },
              })),
            ],
          },
        ],
      };
    } else if (config.provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = { 'x-api-key': config.key, 'anthropic-version': '2023-06-01' };
      body = {
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content: [
              ...images.map((image) => ({
                type: 'image',
                source: { type: 'base64', media_type: image.mimeType, data: image.data },
              })),
              { type: 'text', text },
            ],
          },
        ],
      };
    } else if (config.provider === 'openai') {
      url = 'https://api.openai.com/v1/responses';
      headers = { Authorization: `Bearer ${config.key}` };
      body = {
        model,
        store: false,
        max_output_tokens: maxTokens,
        instructions: system,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text },
              ...images.map((image) => ({
                type: 'input_image',
                image_url: `data:${image.mimeType};base64,${image.data}`,
                detail: input.quality === 'accurate' ? 'high' : 'low',
              })),
            ],
          },
        ],
      };
    } else {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      headers = { 'x-goog-api-key': config.key };
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text },
              ...images.map((image) => ({
                inlineData: { mimeType: image.mimeType, data: image.data },
              })),
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens },
      };
    }
    try {
      const response = await transport(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.any([input.signal, AbortSignal.timeout(input.onText ? 75000 : 45000)]),
      });
      if (!response.ok) {
        const retry = Number(response.headers.get('retry-after'));
        await response.body?.cancel();
        if (response.status === 429)
          throw new ApiFailure(
            'rate_limited',
            429,
            'Провайдер ИИ занят. Попробуйте позже.',
            Number.isFinite(retry) && retry > 0 ? Math.min(120, Math.ceil(retry)) : 30,
          );
        throw new ApiFailure(
          'provider_error',
          502,
          'ИИ временно недоступен. Ручной ввод доступен.',
        );
      }
      if (streaming) return await readCoachStream(response, input.onText!, input.signal);
      const parsed = parseProviderResponse(config.provider, await boundedJson(response));
      let json: unknown;
      try {
        json = JSON.parse(parsed.text);
      } catch {
        throw new ApiFailure(
          'bad_ai_output',
          502,
          'Не удалось разобрать ответ ИИ. Попробуйте снова или внесите вручную.',
        );
      }
      // Цена зависит от модели, кеширования и тарифа; не выдумываем её, если не настроена.
      const price =
        config.provider !== 'anymodel' &&
        input.quality === 'fast' &&
        config.inputPrice !== undefined &&
        config.outputPrice !== undefined
          ? (parsed.input * config.inputPrice + parsed.output * config.outputPrice) / 1000000
          : null;
      return {
        json,
        usage: {
          input_tokens: parsed.input,
          output_tokens: parsed.output,
          estimated_cost_usd: price,
        },
      };
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (
        input.signal.aborted ||
        (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
      )
        throw new ApiFailure('provider_timeout', 504, 'ИИ не ответил вовремя. Попробуйте позже.');
      throw new ApiFailure('provider_error', 502, 'ИИ временно недоступен.');
    }
  };
}
