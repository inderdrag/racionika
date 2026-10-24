import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

export function validateAndroidApi(value) {
  if (!value?.trim()) throw new Error('Задайте VITE_API_BASE_URL: HTTPS-адрес сервера Render.');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('VITE_API_BASE_URL должен быть полным HTTPS-адресом.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !url.hostname.includes('.') ||
    url.hostname.endsWith('.localhost') ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0
  )
    throw new Error(
      'Укажите корневой публичный HTTPS-адрес сервера, без пароля, пути и параметров.',
    );
  return url.origin;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const envPath = new URL('../app/.env', import.meta.url);
  const local = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
  validateAndroidApi(process.env.VITE_API_BASE_URL ?? local.VITE_API_BASE_URL);
  console.log('HTTPS-адрес API для APK задан. Доступность сервера проверяется отдельно.');
}
