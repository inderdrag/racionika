import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { APP_VERSION } from '@racionika/shared';
export async function buildServer(options: { logging?: boolean } = {}) {
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
    bodyLimit: 6 * 1024 * 1024,
    disableRequestLogging: true,
    trustProxy: false,
  });
  await app.register(helmet);
  await app.register(cors, {
    origin: [
      'https://localhost',
      'capacitor://localhost',
      ...(process.env.NODE_ENV === 'production'
        ? []
        : ['http://localhost:5173', 'http://127.0.0.1:5173']),
    ],
  });
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: {
        code: 'rate_limited',
        message_ru: 'Слишком много запросов. Попробуйте через минуту.',
        retry_after: 60,
      },
    }),
  });
  app.get('/health', async () => ({ status: 'ok', version: APP_VERSION }));
  app.setNotFoundHandler((_request, reply) =>
    reply
      .code(404)
      .send({ error: { code: 'invalid_input', message_ru: 'Маршрут пока недоступен.' } }),
  );
  app.setErrorHandler((error, _request, reply) => {
    const code =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const status = code === 413 ? 413 : code === 400 ? 400 : 500;
    return reply.code(status).send({
      error: {
        code: status === 500 ? 'provider_error' : 'invalid_input',
        message_ru:
          status === 500 ? 'Сервис временно недоступен.' : 'Проверьте формат и размер запроса.',
      },
    });
  });
  return app;
}
