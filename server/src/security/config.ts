import { randomBytes } from 'node:crypto';
export interface ServerConfig {
  provider: 'anthropic' | 'openai' | 'gemini' | 'anymodel';
  serveWeb: boolean;
  mock: boolean;
  enabled: boolean;
  production: boolean;
  key: string;
  jwtSecret: string;
  accessCode: string;
  modelFast: string;
  modelAccurate: string;
  maintenance: boolean;
  minVersion: string;
  analysisLimit: number;
  lookupLimit: number;
  chatLimit: number;
  globalCap: number;
  ipDailyCap: number;
  inputPrice: number | undefined;
  outputPrice: number | undefined;
  trustProxyHops: number;
}
function integer(value: string | undefined, fallback: number, min = 1, max = 1000000) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error('Некорректный числовой параметр сервера');
  return n;
}
function price(value: string | undefined) {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('Некорректная цена токенов');
  return n;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const mock = env.MOCK_AI === 'true';
  const raw = env.AI_PROVIDER ?? 'anthropic';
  if (!['anthropic', 'openai', 'gemini', 'anymodel'].includes(raw))
    throw new Error('AI_PROVIDER: допустимы anthropic, openai, gemini, anymodel');
  const provider = raw as ServerConfig['provider'];
  const key =
    env[
      provider === 'anymodel'
        ? 'ANYMODEL_API_KEY'
        : provider === 'anthropic'
          ? 'ANTHROPIC_API_KEY'
          : provider === 'openai'
            ? 'OPENAI_API_KEY'
            : 'GEMINI_API_KEY'
    ] ?? '';
  const enabled = mock || Boolean(key);
  const jwtSecret = env.JWT_SECRET ?? (production ? '' : randomBytes(48).toString('base64url'));
  if (production && mock) throw new Error('MOCK_AI запрещён в production');
  if ((enabled || production) && jwtSecret.length < 32)
    throw new Error('JWT_SECRET должен содержать минимум 32 символа');
  if (production && !key)
    throw new Error('Задайте ключ выбранного ИИ-провайдера в окружении сервера');
  const modelFast = env.MODEL_FAST ?? (provider === 'anthropic' ? 'claude-haiku-5-5' : '');
  const modelAccurate = env.MODEL_ACCURATE ?? (provider === 'anthropic' ? 'claude-sonnet-5-5' : '');
  if (enabled && !mock && (!modelFast || !modelAccurate))
    throw new Error('Задайте MODEL_FAST и MODEL_ACCURATE');
  if (production && env.SERVE_WEB === 'true' && !env.APP_ACCESS_CODE)
    throw new Error('Для публичного сайта задайте APP_ACCESS_CODE');
  const minVersion = env.MIN_APP_VERSION ?? '0.2.0';
  if (!/^\d+\.\d+\.\d+$/.test(minVersion)) throw new Error('MIN_APP_VERSION: формат x.y.z');
  return {
    provider,
    serveWeb: env.SERVE_WEB === 'true',
    mock,
    enabled,
    production,
    key,
    jwtSecret,
    accessCode: env.APP_ACCESS_CODE ?? '',
    modelFast,
    modelAccurate,
    maintenance: env.MAINTENANCE_MODE === 'true',
    minVersion,
    analysisLimit: integer(env.DAILY_ANALYSIS_LIMIT, 40),
    lookupLimit: integer(env.DAILY_LOOKUP_LIMIT, 30),
    chatLimit: integer(env.DAILY_CHAT_LIMIT, 150),
    globalCap: integer(env.GLOBAL_DAILY_REQUEST_CAP, 300),
    ipDailyCap: integer(env.IP_DAILY_REQUEST_CAP, 150),
    inputPrice: price(env.MODEL_INPUT_USD_PER_MILLION),
    outputPrice: price(env.MODEL_OUTPUT_USD_PER_MILLION),
    trustProxyHops: integer(env.TRUST_PROXY_HOPS, 0, 0, 5),
  };
}
