import Fastify, { type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import {
  APP_VERSION,
  MealAnalysisSchema,
  reviewMealComposition,
  clearGuessedAdditions,
  RegisterInputSchema,
  AnalyzeTextSchema,
  AnalyzeMealSchema,
  LookupInputSchema,
  CoachInputSchema,
} from '@racionika/shared';
import { readConfig, type ServerConfig } from './security/config.js';
import { ApiFailure } from './security/errors.js';
import { Limits, olderVersion } from './security/limits.js';
import { schemas, type Task } from './prompts/index.js';
import { createProvider, type Provider, type ProviderInput } from './providers/index.js';
import { CoachJobs } from './coach/jobs.js';
import { CoachResultSchema } from '@racionika/shared';
export async function buildServer(
  options: {
    logging?: boolean;
    config?: ServerConfig;
    provider?: Provider;
    now?: () => number;
  } = {},
) {
  const config = options.config ?? readConfig();
  const limits = new Limits(config, options.now);
  const provider = options.provider ?? createProvider(config);
  const key = new TextEncoder().encode(config.jwtSecret);
  const active = new Map<string, number>();
  let inFlight = 0;
  const coachJobs = new CoachJobs(options.now);

  const app = Fastify({
    logger: options.logging
      ? {
          level: 'info',
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body',
              'res.body',
              'token',
              'deviceId',
              'apiKey',
              'accessCode',
            ],
            censor: '[REDACTED]',
          },
        }
      : false,
    disableRequestLogging: true,
    bodyLimit: 6 * 1024 * 1024,
    trustProxy: config.trustProxyHops ? (_address, hop) => hop < config.trustProxyHops : false,
  });
  app.addHook('onClose', async () => coachJobs.close());
  await app.register(
    helmet,
    config.serveWeb
      ? {
          contentSecurityPolicy: {
            directives: {
              connectSrc: [
                "'self'",
                'https://search.openfoodfacts.org',
                'https://world.openfoodfacts.org',
              ],
            },
          },
        }
      : {},
  );
  await app.register(cors, {
    origin: [
      'https://localhost',
      'capacitor://localhost',
      ...(config.production ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
    ],
  });
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    allowList: (request) => !request.url.startsWith('/v1/'),
    errorResponseBuilder: () => new ApiFailure('rate_limited', 429, 'Слишком много запросов.', 60),
  });
  const identity = new WeakMap<object, string>();
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (
      !request.url.startsWith('/v1/') ||
      request.method === 'OPTIONS' ||
      ['/v1/register', '/v1/config'].includes(request.url.split('?')[0])
    )
      return;
    try {
      const header = request.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw new Error('missing');
      const { payload } = await jwtVerify(header.slice(7), key, {
        issuer: 'racionika',
        audience: 'racionika-app',
        algorithms: ['HS256'],
      });
      if (
        !payload.sub ||
        typeof payload.appVersion !== 'string' ||
        !/^\d+\.\d+\.\d+$/.test(payload.appVersion)
      )
        throw new Error('invalid');
      if (olderVersion(payload.appVersion, config.minVersion))
        throw new ApiFailure('upgrade_required', 426, 'Обновите приложение для работы с ИИ.');
      identity.set(request, payload.sub);
      const progressRead =
        request.method === 'GET' &&
        /^\/v1\/coach\/jobs\/[0-9a-f-]{36}$/.test(request.url.split('?')[0]);
      const cancelling =
        request.method === 'POST' &&
        /^\/v1\/coach\/jobs\/[0-9a-f-]{36}\/cancel$/.test(request.url.split('?')[0]);
      if (progressRead) limits.rate(`coach-poll:${payload.sub}`, 60);
      else if (cancelling) limits.rate(`coach-cancel:${payload.sub}`, 10);
      else limits.rate(`device:${payload.sub}`, 10);
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(
        'invalid_token',
        401,
        'Сессия истекла. Требуется повторная регистрация.',
      );
    }
  });
  app.get('/health', async () => ({ status: 'ok', version: APP_VERSION }));
  app.get('/v1/config', async () => ({
    mode: !config.enabled ? 'disabled' : config.mock ? 'demo' : 'real',
    access_code_required: Boolean(config.accessCode),
    min_app_version: config.minVersion,
    provider: config.provider,
    maintenance: config.maintenance,
  }));
  app.post('/v1/register', async (request) => {
    limits.rate(`register:${request.ip}`, 10, 3600000);
    const value = RegisterInputSchema.safeParse(request.body);
    if (!value.success) throw new ApiFailure('invalid_input', 400, 'Проверьте данные регистрации.');
    if (olderVersion(value.data.appVersion, config.minVersion))
      throw new ApiFailure('upgrade_required', 426, 'Обновите приложение.');
    if (config.accessCode) {
      const submitted = createHmac('sha256', key)
        .update(value.data.accessCode ?? '')
        .digest();
      const required = createHmac('sha256', key).update(config.accessCode).digest();
      if (!timingSafeEqual(submitted, required))
        throw new ApiFailure('invalid_token', 403, 'Неверный код доступа к серверу.');
    }
    const id = createHmac('sha256', key).update(value.data.deviceId).digest('hex');
    const token = await new SignJWT({ appVersion: value.data.appVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(id)
      .setIssuer('racionika')
      .setAudience('racionika-app')
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(key);
    return { token, daily: limits.usage(id) };
  });
  app.get('/v1/usage', async (request) => limits.usage(identity.get(request)!));
  async function run(
    request: FastifyRequest,
    task: Task,
    data: unknown,
    images: ProviderInput['images'],
    quality: 'fast' | 'accurate',
  ) {
    if (config.maintenance)
      throw new ApiFailure(
        'maintenance',
        503,
        'ИИ временно на обслуживании. Ручной ввод доступен.',
      );
    if (!config.enabled)
      throw new ApiFailure(
        'provider_error',
        503,
        'ИИ не настроен. Владелец сервера должен добавить ключ провайдера.',
      );
    const id = identity.get(request)!;
    if ((active.get(id) ?? 0) >= 1 || inFlight >= 8)
      throw new ApiFailure('rate_limited', 429, 'Дождитесь завершения предыдущего запроса.', 5);
    limits.consume(
      id,
      request.ip,
      task === 'meal' ? 'analyses' : task === 'lookup' ? 'lookups' : 'chat',
    );
    active.set(id, 1);
    inFlight++;
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.raw.once('aborted', abort);
    const close = () => {
      if (!request.raw.complete) controller.abort();
    };
    request.raw.once('close', close);
    request.raw.socket.once('close', abort);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(80000)]);
    let inputTokens = 0,
      outputTokens = 0,
      cost: number | null = 0;
    try {
      let repairReason = 'Исправь формат JSON и границы чисел.';
      for (let attempt = 0; attempt < 2; attempt++) {
        limits.providerCall();
        let result;
        try {
          result = await provider({
            task,
            data,
            images,
            quality,
            repair: attempt > 0,
            repairReason,
            signal,
          });
        } catch (error) {
          if (error instanceof ApiFailure && error.code === 'bad_ai_output' && attempt === 0)
            continue;
          throw error;
        }
        inputTokens += result.usage.input_tokens;
        outputTokens += result.usage.output_tokens;
        cost =
          cost === null || result.usage.estimated_cost_usd === null
            ? null
            : cost + result.usage.estimated_cost_usd;
        const parsed = schemas[task].safeParse(result.json);
        if (parsed.success) {
          if (task === 'meal') {
            const review = reviewMealComposition(MealAnalysisSchema.parse(parsed.data));
            if (review.length) {
              repairReason = review
                .map((issue) => `${issue.code}: ${issue.message}`)
                .join(' ')
                .slice(0, 700);
              continue;
            }
          }
          const meta = {
            demo: config.mock,
            usage: {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              estimated_cost_usd: cost,
            },
            daily: limits.usage(id),
          };
          return task === 'meal'
            ? { analysis: clearGuessedAdditions(MealAnalysisSchema.parse(parsed.data)), ...meta }
            : task === 'lookup'
              ? { food: parsed.data, ...meta }
              : { reply: parsed.data, ...meta };
        }
      }
      throw new ApiFailure(
        'bad_ai_output',
        502,
        'ИИ вернул непроверенные данные. Попробуйте уточнить состав или внесите вручную.',
      );
    } finally {
      active.delete(id);
      inFlight--;
      request.raw.removeListener('aborted', abort);
      request.raw.removeListener('close', close);
      request.raw.socket.removeListener('close', abort);
    }
  }
  app.post('/v1/analyze-text', async (request) => {
    const body = AnalyzeTextSchema.safeParse(request.body);
    if (!body.success)
      throw new ApiFailure('invalid_input', 400, 'Опишите еду: от 2 до 2000 символов.');
    return run(
      request,
      'meal',
      { text: body.data.text, hint: body.data.hint },
      undefined,
      body.data.quality,
    );
  });
  app.post('/v1/analyze-meal', async (request) => {
    const body = AnalyzeMealSchema.safeParse(request.body);
    if (!body.success)
      throw new ApiFailure('invalid_input', 400, 'Принимаются 1–3 сжатых JPEG-фото.');
    for (const image of body.data.images) {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data))
        throw new ApiFailure('invalid_input', 400, 'Некорректное изображение.');
      const bytes = Buffer.from(image.data, 'base64');
      if (bytes.length > 1572864)
        throw new ApiFailure('image_too_large', 413, 'Фото должно быть не больше 1,5 МБ.');
      if (
        bytes.length < 4 ||
        bytes[0] !== 255 ||
        bytes[1] !== 216 ||
        bytes[2] !== 255 ||
        bytes.at(-2) !== 255 ||
        bytes.at(-1) !== 217
      )
        throw new ApiFailure('invalid_input', 400, 'Файл не соответствует JPEG.');
    }
    return run(request, 'meal', { hint: body.data.hint }, body.data.images, body.data.quality);
  });
  app.post('/v1/lookup-food', async (request) => {
    const body = LookupInputSchema.safeParse(request.body);
    if (!body.success) throw new ApiFailure('invalid_input', 400, 'Введите название продукта.');
    return run(request, 'lookup', body.data, undefined, 'fast');
  });
  app.post('/v1/coach', async (request) => {
    const body = CoachInputSchema.safeParse(request.body);
    if (!body.success)
      throw new ApiFailure('invalid_input', 400, 'Слишком длинное сообщение или история.');
    return run(request, 'coach', body.data, undefined, 'fast');
  });
  app.post('/v1/coach/jobs', async (request) => {
    const body = CoachInputSchema.safeParse(request.body);
    if (!body.success)
      throw new ApiFailure('invalid_input', 400, 'Слишком длинное сообщение или контекст.');
    if (config.maintenance)
      throw new ApiFailure('maintenance', 503, 'Наставник временно на обслуживании.');
    if (!config.enabled) throw new ApiFailure('provider_error', 503, 'ИИ не настроен на сервере.');
    const owner = identity.get(request)!;
    if ((active.get(owner) ?? 0) >= 1 || inFlight >= 8)
      throw new ApiFailure('rate_limited', 429, 'Дождитесь завершения предыдущего запроса.', 5);
    limits.consume(owner, request.ip, 'chat');
    limits.providerCall();
    active.set(owner, 1);
    inFlight++;
    const release = () => {
      active.delete(owner);
      inFlight--;
    };
    try {
      return coachJobs.create(
        owner,
        config.mock,
        async (signal, onText) => {
          const result = await provider({
            task: 'coach',
            data: body.data,
            quality: 'fast',
            repair: false,
            signal: AbortSignal.any([signal, AbortSignal.timeout(85000)]),
            onText,
          });
          const parsed = CoachResultSchema.safeParse(result.json);
          if (!parsed.success)
            throw new ApiFailure(
              'bad_ai_output',
              502,
              'ИИ вернул некорректный ответ. Попробуйте снова.',
            );
          return parsed.data.text;
        },
        release,
      );
    } catch (error) {
      release();
      throw error;
    }
  });
  app.get<{ Params: { id: string } }>(
    '/v1/coach/jobs/:id',
    { config: { rateLimit: { max: 360, timeWindow: '1 minute' } } },
    async (request) => coachJobs.get(identity.get(request)!, request.params.id),
  );
  app.post<{ Params: { id: string } }>('/v1/coach/jobs/:id/cancel', async (request) =>
    coachJobs.cancel(identity.get(request)!, request.params.id),
  );
  if (config.serveWeb)
    await app.register(staticFiles, {
      root: fileURLToPath(new URL('../../app/dist/', import.meta.url)),
      wildcard: false,
      index: ['index.html'],
      dotfiles: 'deny',
    });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: 'invalid_input', message_ru: 'Маршрут не найден.' } }),
  );
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiFailure)
      return reply.code(error.status).send({
        error: {
          code: error.code,
          message_ru: error.messageRu,
          ...(error.retryAfter ? { retry_after: error.retryAfter } : {}),
        },
      });
    const code =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const status = code === 413 ? 413 : code === 400 ? 400 : 500;
    return reply.code(status).send({
      error: {
        code:
          status === 413 ? 'image_too_large' : status === 400 ? 'invalid_input' : 'provider_error',
        message_ru:
          status === 500 ? 'Сервис временно недоступен.' : 'Проверьте формат и размер запроса.',
      },
    });
  });
  return app;
}
