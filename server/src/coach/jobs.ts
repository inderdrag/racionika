import { randomUUID } from 'node:crypto';
import type { CoachJobSnapshot } from '@racionika/shared';
import { ApiFailure } from '../security/errors.js';
interface Job {
  owner: string;
  snapshot: CoachJobSnapshot;
  controller: AbortController;
  created: number;
  touched: number;
  finished: number | null;
}
export class CoachJobs {
  private jobs = new Map<string, Job>();
  private timer: ReturnType<typeof setInterval>;
  constructor(private now: () => number = Date.now) {
    this.timer = setInterval(() => this.sweep(), 5000);
    this.timer.unref();
  }
  private sweep() {
    const now = this.now();
    for (const [id, j] of this.jobs) {
      if (j.snapshot.status === 'running' && (now - j.touched > 20000 || now - j.created > 90000)) {
        j.controller.abort();
        j.snapshot.status = 'error';
        j.snapshot.error = {
          code: 'provider_timeout',
          message_ru: 'Связь прервана. Запрос наставнику остановлен.',
        };
        j.finished = now;
      }
      if (j.finished !== null && now - j.finished > 15000) this.jobs.delete(id);
    }
  }
  create(
    owner: string,
    demo: boolean,
    work: (signal: AbortSignal, onText: (delta: string) => void) => Promise<string>,
    release: () => void,
  ) {
    this.sweep();
    if (this.jobs.size >= 64)
      throw new ApiFailure('rate_limited', 429, 'Сервис занят. Попробуйте позже.', 15);
    const id = randomUUID(),
      now = this.now();
    const j: Job = {
      owner,
      controller: new AbortController(),
      created: now,
      touched: now,
      finished: null,
      snapshot: { id, status: 'running', text: '', streamed: false, demo },
    };
    this.jobs.set(id, j);
    void Promise.resolve().then(async () => {
      try {
        j.controller.signal.throwIfAborted();
        const workPromise = work(j.controller.signal, (delta) => {
          if (j.controller.signal.aborted || j.snapshot.status !== 'running') return;
          if (j.snapshot.text.length + delta.length > 6000)
            throw new ApiFailure('bad_ai_output', 502, 'Ответ ИИ слишком длинный.');
          j.snapshot.text += delta;
          j.snapshot.streamed = true;
        });
        const text = await new Promise<string>((resolve, reject) => {
          const cancelled = () => reject(new DOMException('Отменено', 'AbortError'));
          j.controller.signal.addEventListener('abort', cancelled, { once: true });
          workPromise.then(
            (value) => {
              j.controller.signal.removeEventListener('abort', cancelled);
              resolve(value);
            },
            (error) => {
              j.controller.signal.removeEventListener('abort', cancelled);
              reject(error);
            },
          );
          if (j.controller.signal.aborted) cancelled();
        });
        if (j.controller.signal.aborted || j.snapshot.status !== 'running') return;
        if (!text.trim() || text.length > 6000 || (j.snapshot.streamed && j.snapshot.text !== text))
          throw new ApiFailure('bad_ai_output', 502, 'Не удалось получить полный ответ ИИ.');
        j.snapshot.text = text;
        j.snapshot.status = 'done';
      } catch (error) {
        if (j.snapshot.status === 'running') {
          j.snapshot.status = 'error';
          j.snapshot.error =
            error instanceof ApiFailure
              ? {
                  code: error.code,
                  message_ru: error.messageRu,
                  ...(error.retryAfter ? { retry_after: error.retryAfter } : {}),
                }
              : { code: 'provider_error', message_ru: 'Наставник временно недоступен.' };
        }
      } finally {
        j.finished = this.now();
        release();
      }
    });
    return { id };
  }
  get(owner: string, id: string) {
    this.sweep();
    const j = this.owned(owner, id);
    j.touched = this.now();
    return structuredClone(j.snapshot);
  }
  cancel(owner: string, id: string) {
    const j = this.owned(owner, id);
    if (j.snapshot.status === 'running') {
      j.controller.abort();
      j.snapshot.status = 'cancelled';
      j.finished = this.now();
    }
    return structuredClone(j.snapshot);
  }
  private owned(owner: string, id: string) {
    const j = this.jobs.get(id);
    if (!j || j.owner !== owner)
      throw new ApiFailure('invalid_input', 404, 'Запрос не найден или уже завершён.');
    return j;
  }
  close() {
    clearInterval(this.timer);
    for (const j of this.jobs.values()) j.controller.abort();
    this.jobs.clear();
  }
}
