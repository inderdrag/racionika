import { HealthSchema } from '@racionika/shared';
import { getPlatform } from '../platform';
export async function checkServer(): Promise<boolean> {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base && !import.meta.env.DEV) return false;
  const url = base ? new URL('/health', base).href : '/health';
  try {
    HealthSchema.parse(await (await getPlatform()).http.get(url));
    return true;
  } catch {
    return false;
  }
}
// Вызовы ИИ намеренно отсутствуют до реализации токенов, лимитов и валидации.
