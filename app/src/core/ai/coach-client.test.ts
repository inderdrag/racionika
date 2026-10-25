import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../platform', () => ({ getPlatform: vi.fn() }));
import { getPlatform } from '../platform';
import { askCoachProgressively } from './client';
const id = 'd161132b-7c03-4375-a1d6-bfe37fa541f7';
const request = vi.fn(),
  input = {
    message: 'Разбор',
    summary: '{}',
    history: [],
    goal: 'maintain' as const,
    mode: 'weekly_review' as const,
  };
const state = (status: string, text = '', streamed = true) => ({
  status,
  text,
  id,
  streamed,
  demo: false,
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', { getItem: () => 'v2' });
  vi.mocked(getPlatform).mockResolvedValue({
    secureStorage: { get: async () => 'test-token-123' },
    http: { request },
  } as unknown as Awaited<ReturnType<typeof getPlatform>>);
  request.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('Прогрессивный клиент наставника', () => {
  it('получает реальную частичную строку до готового ответа', async () => {
    request
      .mockResolvedValueOnce({ status: 200, data: { id } })
      .mockResolvedValueOnce({ status: 200, data: state('running', 'Первая часть') })
      .mockResolvedValueOnce({ status: 200, data: state('done', 'Первая часть и конец') });
    const onText = vi.fn(),
      answer = askCoachProgressively(input, new AbortController().signal, onText);
    await vi.advanceTimersByTimeAsync(0);
    expect(onText).toHaveBeenCalledWith('Первая часть', true);
    await vi.advanceTimersByTimeAsync(1800);
    expect(await answer).toMatchObject({ text: 'Первая часть и конец', streamed: true });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('отмена не ждёт зависший native HTTP; поздний ответ игнорируется', async () => {
    let late!: (v: unknown) => void;
    request.mockImplementation(async (url: string) =>
      url.endsWith('/cancel')
        ? { status: 200, data: state('cancelled') }
        : url.endsWith('/jobs')
          ? { status: 200, data: { id } }
          : new Promise((r) => (late = r)),
    );
    const c = new AbortController(),
      onText = vi.fn();
    const answer = askCoachProgressively(input, c.signal, onText);
    const rejected = expect(answer).rejects.toBeTruthy();
    await vi.advanceTimersByTimeAsync(0);
    c.abort();
    await vi.advanceTimersByTimeAsync(0);
    await rejected;
    expect(request.mock.calls.some(([u]) => String(u).endsWith('/cancel'))).toBe(true);
    late({ status: 200, data: state('done', 'Поздний ответ') });
    await vi.advanceTimersByTimeAsync(0);
    expect(onText).not.toHaveBeenCalled();
  });
  it('ошибка задания не превращается в готовый ответ', async () => {
    request
      .mockResolvedValueOnce({ status: 200, data: { id } })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          ...state('error', 'Часть'),
          error: { code: 'provider_timeout', message_ru: 'Время вышло' },
        },
      })
      .mockResolvedValue({ status: 200, data: state('cancelled') });
    await expect(
      askCoachProgressively(input, new AbortController().signal, () => {}),
    ).rejects.toMatchObject({ code: 'provider_timeout' });
  });
  it('без согласия не отправляет ни контекст, ни запрос', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    await expect(
      askCoachProgressively(input, new AbortController().signal, () => {}),
    ).rejects.toMatchObject({ code: 'consent_required' });
    expect(request).not.toHaveBeenCalled();
  });
});
