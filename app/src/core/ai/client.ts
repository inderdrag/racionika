import {
  APP_VERSION,
  HealthSchema,
  ConfigSchema,
  ApiErrorSchema,
  RegisterResponseSchema,
  AnalysisResponseSchema,
  LookupResponseSchema,
  CoachResponseSchema,
  UsageSchema,
  type Quality,
} from '@racionika/shared';
import { getPlatform } from '../platform';
import { Capacitor } from '@capacitor/core';
const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const serverLabel = base
  ? new URL(base).host
  : import.meta.env.DEV
    ? 'локальный сервер'
    : window.location.host;
let accessCode: string | undefined;
let registration: Promise<string> | undefined;
export function setAccessCode(code: string) {
  accessCode = code;
  registration = undefined;
}
export class AiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
function endpoint(path: string) {
  if (base) return new URL(path, base).href;
  if (!import.meta.env.DEV && Capacitor.isNativePlatform())
    throw new AiError(
      'unconfigured',
      'Адрес сервера не задан. Владелец должен указать VITE_API_BASE_URL при сборке.',
    );
  return path;
}
async function raw(path: string, body?: unknown, token?: string, signal?: AbortSignal) {
  try {
    const response = await (
      await getPlatform()
    ).http.request(endpoint(path), {
      method: body === undefined ? 'GET' : 'POST',
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    });
    if (response.status < 200 || response.status >= 300) {
      const parsed = ApiErrorSchema.safeParse(response.data);
      if (parsed.success)
        throw new AiError(
          parsed.data.error.code,
          parsed.data.error.message_ru,
          parsed.data.error.retry_after,
        );
      throw new AiError('provider_error', 'Сервер временно недоступен.');
    }
    return response.data;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (signal?.aborted) throw new AiError('cancelled', 'Запрос отменён.');
    throw new AiError(
      'network',
      navigator.onLine
        ? 'Не удалось связаться с сервером. Он может просыпаться: попробуйте позже.'
        : 'Нет интернета. Ручной ввод доступен.',
    );
  }
}
export async function getConfig(signal?: AbortSignal) {
  return ConfigSchema.parse(await raw('/v1/config', undefined, undefined, signal));
}
async function register() {
  const platform = await getPlatform();
  let deviceId = await platform.secureStorage.get('racionika.deviceId');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await platform.secureStorage.set('racionika.deviceId', deviceId);
  }
  const config = await getConfig();
  if (config.access_code_required && !accessCode)
    throw new AiError('access_code', 'Введите код доступа к серверу.');
  const result = RegisterResponseSchema.parse(
    await raw('/v1/register', {
      deviceId,
      appVersion: APP_VERSION,
      ...(accessCode ? { accessCode } : {}),
    }),
  );
  await platform.secureStorage.set(`racionika.token.${APP_VERSION}`, result.token);
  return result.token;
}
async function token() {
  const existing = await (await getPlatform()).secureStorage.get(`racionika.token.${APP_VERSION}`);
  if (existing) return existing;
  registration ??= register().finally(() => {
    registration = undefined;
  });
  return registration;
}
async function authorized(path: string, body?: unknown, signal?: AbortSignal) {
  const initial = await token();
  signal?.throwIfAborted();
  try {
    return await raw(path, body, initial, signal);
  } catch (error) {
    if (error instanceof AiError && error.code === 'invalid_token') {
      await (await getPlatform()).secureStorage.remove(`racionika.token.${APP_VERSION}`);
      return raw(path, body, await token(), signal);
    }
    throw error;
  }
}
export async function checkServer() {
  try {
    HealthSchema.parse(await raw('/health'));
    return true;
  } catch {
    return false;
  }
}
export async function analyzeText(
  text: string,
  hint: string,
  quality: Quality,
  signal: AbortSignal,
) {
  return AnalysisResponseSchema.parse(
    await authorized('/v1/analyze-text', { text, hint, quality }, signal),
  );
}
export async function analyzePhotos(
  images: { mimeType: 'image/jpeg'; data: string }[],
  hint: string,
  quality: Quality,
  signal: AbortSignal,
) {
  return AnalysisResponseSchema.parse(
    await authorized('/v1/analyze-meal', { images, hint, quality }, signal),
  );
}
export async function lookupFood(name: string, signal: AbortSignal) {
  return LookupResponseSchema.parse(await authorized('/v1/lookup-food', { name }, signal));
}
export async function askCoach(
  message: string,
  summary: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  signal: AbortSignal,
) {
  return CoachResponseSchema.parse(
    await authorized('/v1/coach', { message, summary, history, goal: 'maintain' }, signal),
  );
}
export async function getUsage() {
  return UsageSchema.parse(await authorized('/v1/usage'));
}
export async function resetAiSession() {
  const storage = (await getPlatform()).secureStorage;
  await storage.remove(`racionika.token.${APP_VERSION}`);
  await storage.remove('racionika.deviceId');
  accessCode = undefined;
}
