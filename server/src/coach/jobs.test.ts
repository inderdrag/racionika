import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoachJobs } from './jobs.js';
const jobs: CoachJobs[] = [];
const manager = (now?: () => number) => {
  const j = new CoachJobs(now);
  jobs.push(j);
  return j;
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
afterEach(() => jobs.splice(0).forEach((j) => j.close()));
describe('Ограниченные задания наставника', () => {
  it('показывает настоящий частичный ответ до завершения и проверяет владельца', async () => {
    const j = manager();
    let finish!: (s: string) => void;
    const release = vi.fn();
    const { id } = j.create(
      'a',
      false,
      async (_s, write) => {
        write('Начало');
        return new Promise<string>((r) => (finish = r));
      },
      release,
    );
    await tick();
    expect(j.get('a', id)).toMatchObject({ status: 'running', text: 'Начало', streamed: true });
    expect(() => j.get('b', id)).toThrow();
    expect(() => j.cancel('b', id)).toThrow();
    finish('Начало');
    await tick();
    expect(j.get('a', id).status).toBe('done');
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('отмена освобождает слот и игнорирует поздний результат', async () => {
    const j = manager();
    let finish!: (s: string) => void;
    let signal!: AbortSignal;
    const release = vi.fn();
    const { id } = j.create(
      'a',
      false,
      async (s, write) => {
        signal = s;
        write('Часть');
        return new Promise<string>((r) => (finish = r));
      },
      release,
    );
    await tick();
    j.cancel('a', id);
    await tick();
    expect(signal.aborted).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    finish('Часть');
    await tick();
    expect(j.get('a', id).status).toBe('cancelled');
  });
  it('запрос без чтения останавливается по lease и удаляется из памяти', async () => {
    let now = 1000;
    const j = manager(() => now);
    const release = vi.fn();
    const { id } = j.create('a', false, async () => new Promise(() => {}), release);
    await tick();
    now += 21000;
    expect(j.get('a', id).status).toBe('error');
    await tick();
    expect(release).toHaveBeenCalledTimes(1);
    now += 16000;
    expect(() => j.get('a', id)).toThrow();
  });
  it('не выдаёт секреты из ошибок и не маскирует буферный ответ под поток', async () => {
    const j = manager();
    const a = j.create(
      'a',
      false,
      async () => {
        throw new Error('SECRET KEY');
      },
      () => {},
    );
    await tick();
    expect(JSON.stringify(j.get('a', a.id))).not.toContain('SECRET');
    const b = j.create(
      'a',
      false,
      async () => 'Полный ответ',
      () => {},
    );
    await tick();
    expect(j.get('a', b.id)).toMatchObject({
      status: 'done',
      streamed: false,
      text: 'Полный ответ',
    });
  });
  it('закрытие сервера отменяет активную генерацию', async () => {
    const j = manager();
    let signal!: AbortSignal;
    j.create(
      'a',
      false,
      async (s) => {
        signal = s;
        return new Promise(() => {});
      },
      () => {},
    );
    await tick();
    j.close();
    expect(signal.aborted).toBe(true);
  });
});
