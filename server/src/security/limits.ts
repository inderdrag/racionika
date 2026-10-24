import type { ServerConfig } from './config.js';
import { ApiFailure } from './errors.js';
export class Limits {
  private day = '';
  private global = 0;
  private counts = new Map<string, number>();
  private minute = new Map<string, number[]>();
  constructor(
    private config: ServerConfig,
    private now: () => number = Date.now,
  ) {}
  private rotate() {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.global = 0;
      this.counts.clear();
      this.minute.clear();
    }
  }
  rate(key: string, max: number, windowMs = 60000) {
    this.rotate();
    const current = this.now();
    let calls = this.minute.get(key);
    if (!calls) {
      if (this.minute.size >= 20000)
        throw new ApiFailure('rate_limited', 429, 'Сервис занят. Попробуйте позже.', 60);
      calls = [];
      this.minute.set(key, calls);
    }
    while (calls.length && calls[0] <= current - windowMs) calls.shift();
    if (calls.length >= max)
      throw new ApiFailure(
        'rate_limited',
        429,
        'Слишком много запросов. Попробуйте позже.',
        Math.max(1, Math.ceil((calls[0] + windowMs - current) / 1000)),
      );
    calls.push(current);
  }
  consume(id: string, ip: string, task: 'analyses' | 'lookups' | 'chat') {
    this.rotate();
    const limit =
      task === 'analyses'
        ? this.config.analysisLimit
        : task === 'lookups'
          ? this.config.lookupLimit
          : this.config.chatLimit;
    const key = `${id}:${task}`;
    const used = this.counts.get(key) ?? 0;
    const ipKey = `ip:${ip}`;
    if (used >= limit || (this.counts.get(ipKey) ?? 0) >= this.config.ipDailyCap)
      throw new ApiFailure(
        'quota_exceeded',
        429,
        'Лимит ИИ на сегодня исчерпан. Ручной ввод доступен.',
      );
    if (this.counts.size >= 60000)
      throw new ApiFailure('rate_limited', 429, 'Сервис занят. Попробуйте позже.', 60);
    this.counts.set(key, used + 1);
    this.counts.set(ipKey, (this.counts.get(ipKey) ?? 0) + 1);
  }
  providerCall() {
    this.rotate();
    if (this.global >= this.config.globalCap)
      throw new ApiFailure(
        'quota_exceeded',
        429,
        'Общий лимит ИИ на сегодня исчерпан. Ручной ввод доступен.',
      );
    this.global++;
  }
  usage(id: string) {
    this.rotate();
    const next = new Date(this.now());
    next.setUTCHours(24, 0, 0, 0);
    return {
      analyses: this.counts.get(`${id}:analyses`) ?? 0,
      analysis_limit: this.config.analysisLimit,
      lookups: this.counts.get(`${id}:lookups`) ?? 0,
      lookup_limit: this.config.lookupLimit,
      chat: this.counts.get(`${id}:chat`) ?? 0,
      chat_limit: this.config.chatLimit,
      resets_at: next.toISOString(),
    };
  }
}
export function olderVersion(version: string, min: string) {
  const a = version.split('.').map(Number),
    b = min.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}
