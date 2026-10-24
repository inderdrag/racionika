import { buildServer } from './app.js';
const rawPort = process.env.PORT ?? '8787';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT должен быть числом от 1 до 65535');
const app = await buildServer({ logging: true });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
try {
  await app.listen({ host: '0.0.0.0', port });
} catch {
  console.error('Не удалось запустить сервер. Проверьте PORT.');
  process.exit(1);
}
