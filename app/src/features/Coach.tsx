import {
  hasAiConsent,
  hasCoachContextConsent,
  saveCoachContextConsent,
  personalPlan,
} from '../core/profile';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { liveQuery } from 'dexie';
import type { CoachMode, PublicConfig, UserProfile } from '@racionika/shared';
import { db, localDay, type ChatMessage } from '../core/db';
import { askCoach, askCoachProgressively, getConfig } from '../core/ai/client';
import { buildCoachContext, coachWindow } from '../core/coach-context';
const actions: { mode: CoachMode; label: string; message: string }[] = [
  {
    mode: 'tomorrow_menu',
    label: 'Меню на завтра',
    message:
      'Предложи пример меню на завтра под мою текущую цель. Укажи порции и ориентировочные КБЖУ.',
  },
  {
    mode: 'evening_review',
    label: 'Вечерний разбор',
    message: 'Спокойно разбери выбранный день: питание, вода и один-два шага на завтра.',
  },
  {
    mode: 'weekly_review',
    label: 'Разбор недели',
    message:
      'Разбери последние 7 дней с учётом полноты дневника и динамики веса. Не считай пропуски нулями.',
  },
  {
    mode: 'chat',
    label: 'Поддержи меня',
    message: 'Поддержи меня и предложи один небольшой посильный шаг.',
  },
];
export function Coach({ day, profile }: { day: string; profile: UserProfile }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [config, setConfig] = useState<PublicConfig>();
  const [text, setText] = useState(''),
    [mode, setMode] = useState<CoachMode>('chat'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(hasAiConsent),
    [extended, setExtended] = useState(hasCoachContextConsent);
  const [partial, setPartial] = useState(''),
    [pending, setPending] = useState(''),
    [stopped, setStopped] = useState(false),
    [streamed, setStreamed] = useState(false);
  const abort = useRef<AbortController | null>(null),
    mounted = useRef(true);
  const historyRef = useRef<HTMLDivElement>(null);
  const followTail = useRef(true);
  const range = coachWindow(day, localDay(), extended);
  useEffect(() => {
    mounted.current = true;
    const warmup = new AbortController();
    const subscription = liveQuery(async () =>
      (await db.chatMessages.orderBy('createdAt').reverse().limit(50).toArray()).reverse(),
    ).subscribe(setMessages);
    void getConfig(warmup.signal)
      .then((value) => {
        if (mounted.current) setConfig(value);
      })
      .catch(() => {
        if (mounted.current) setError('Сервер недоступен. Попробуйте позже.');
      });
    const permissions = () => {
      setConsent(hasAiConsent());
      setExtended(hasCoachContextConsent());
      if (!hasAiConsent() || !hasCoachContextConsent()) abort.current?.abort();
    };
    const background = () => {
      if (document.visibilityState === 'hidden') abort.current?.abort();
    };
    window.addEventListener('racionika:consent', permissions);
    document.addEventListener('visibilitychange', background);
    return () => {
      mounted.current = false;
      subscription.unsubscribe();
      warmup.abort();
      abort.current?.abort();
      window.removeEventListener('racionika:consent', permissions);
      document.removeEventListener('visibilitychange', background);
    };
  }, []);
  useEffect(() => {
    abort.current?.abort();
  }, [day, profile.updatedAt]);
  useEffect(() => {
    const history = historyRef.current;
    // Follow incoming text only while the reader is at the end. Never scroll the page.
    if (history && followTail.current) history.scrollTop = history.scrollHeight;
  }, [messages, partial, pending, busy, error, stopped]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || !hasAiConsent() || busy) return;
    const question = text.trim(),
      controller = new AbortController();
    abort.current = controller;
    followTail.current = true;
    setBusy(true);
    setError('');
    setPartial('');
    setPending(question);
    setStopped(false);
    setStreamed(false);
    try {
      const scope = hasCoachContextConsent(),
        window = coachWindow(day, localDay(), scope);
      const [food, water, weights] = await Promise.all([
        db.foodEntries.where('day').between(window.from, window.end, true, true).toArray(),
        db.waterLogs.where('day').between(window.from, window.end, true, true).toArray(),
        scope
          ? db.weightLogs.where('day').between(window.weightFrom, window.end, true, true).toArray()
          : Promise.resolve([]),
      ]);
      controller.signal.throwIfAborted();
      const context = buildCoachContext({
        selectedDay: day,
        profile,
        food,
        water,
        weights,
        extended: scope,
      });
      const history = messages
        .filter((m) => !m.demo)
        .slice(-10)
        .map(({ role, text }) => ({ role, text: text.slice(0, 1500) }));
      const goal = personalPlan(profile).status === 'ready' ? profile.goal : 'maintain';
      const answer =
        config?.mode === 'demo'
          ? await askCoach(question, context.json, history, controller.signal, goal, mode).then(
              (r) => ({ text: r.reply.text, demo: r.demo, streamed: false }),
            )
          : await askCoachProgressively(
              { message: question, summary: context.json, history, goal, mode },
              controller.signal,
              (value, isStreamed) => {
                if (mounted.current && !controller.signal.aborted) {
                  setPartial(value);
                  setStreamed(isStreamed);
                }
              },
            );
      controller.signal.throwIfAborted();
      await db.transaction('rw', db.chatMessages, async () => {
        controller.signal.throwIfAborted();
        await db.chatMessages.bulkAdd([
          {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            role: 'user',
            text: question,
          },
          {
            id: crypto.randomUUID(),
            createdAt: new Date(Date.now() + 1).toISOString(),
            role: 'assistant',
            text: answer.text,
            demo: answer.demo,
          },
        ]);
        controller.signal.throwIfAborted();
      });
      if (mounted.current && abort.current === controller) {
        setText('');
        setMode('chat');
        setPartial('');
        setPending('');
      }
    } catch (err) {
      if (mounted.current && abort.current === controller) {
        if (controller.signal.aborted) setStopped(true);
        else setError(err instanceof Error ? err.message : 'Не удалось получить ответ.');
      }
    } finally {
      if (mounted.current && abort.current === controller) setBusy(false);
    }
  }
  return (
    <section className="card coach-card">
      <h2>Спросить наставника</h2>
      <p className="subtle">
        {config?.mode === 'demo'
          ? 'ДЕМО: фиксированный тестовый ответ, не совет ИИ.'
          : config?.mode === 'real'
            ? 'Опирается на дневник. Рекомендации ИИ — ориентир.'
            : 'Проверяем подключение наставника…'}
      </p>
      <p className="coach-context-caption">
        {extended
          ? `Контекст: ${range.from} — ${range.end} · вес за 30 дней`
          : 'Контекст: выбранный день'}
      </p>
      {!extended && consent && (
        <details className="coach-context-permission">
          <summary>Добавить контекст нескольких дней</summary>
          <p>
            Дневник за 7 дней и измерения веса за 30 дней будут передаваться через сервер в AnyModel
            вместе с профилем и чатом. Разрешение можно отключить в Профиле.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => saveCoachContextConsent(true)}
          >
            Разрешить контекст 7 дней
          </button>
        </details>
      )}
      <div
        className="chat-history"
        ref={historyRef}
        role="region"
        aria-label="Переписка с наставником"
        tabIndex={0}
        onScroll={(event) => {
          const el = event.currentTarget;
          followTail.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
        }}
      >
        {messages.map((m) => (
          <div key={m.id} className={`chat-message ${m.role}`}>
            <strong>{m.role === 'user' ? 'Вы' : m.demo ? 'Демо-наставник' : 'Наставник'}</strong>
            <p>{m.text}</p>
          </div>
        ))}
        {pending && (
          <div className="chat-message user coach-pending">
            <strong>Вы</strong>
            <p>{pending}</p>
          </div>
        )}
        {(busy || partial) && (
          <div
            className="chat-message assistant coach-live"
            aria-busy={busy}
            data-streamed={streamed}
          >
            <strong>
              Наставник
              {stopped ? ' · остановлено' : busy ? ' · отвечает' : error ? ' · неполный ответ' : ''}
            </strong>
            {partial ? <p>{partial}</p> : <p>Готовит ответ…</p>}
            <span className="sr-only" role="status">
              {stopped ? 'Запрос остановлен.' : busy ? 'Ответ поступает.' : 'Ответ получен.'}
            </span>
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!busy && stopped && (
          <p className="coach-stop-note" role="status">
            Запрос остановлен. Неполный ответ не сохранён в историю.
          </p>
        )}
      </div>
      <div className="coach-quick-actions" role="group" aria-label="Задача наставника">
        {actions.map((a) => (
          <button
            type="button"
            className="secondary"
            key={a.label}
            disabled={busy}
            aria-pressed={mode === a.mode && text === a.message}
            onClick={() => {
              setMode(a.mode);
              setText(a.message);
              setError('');
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <form onSubmit={(event) => void send(event)}>
        <label className="field">
          Сообщение
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={1500}
            placeholder="Как сделать обед сытнее?"
            required
            disabled={busy}
          />
        </label>
        {!consent && (
          <p className="notice">
            Включите ИИ в Профиле. Повторное согласие в каждом сообщении не требуется.
          </p>
        )}
        <button
          className="primary"
          disabled={busy || !consent || !text.trim() || !config || config.mode === 'disabled'}
        >
          {busy ? 'Ждём ответ…' : 'Отправить'}
        </button>
      </form>
      <div className="coach-chat-tools">
        {busy ? (
          <button
            type="button"
            className="text-button coach-cancel"
            onClick={() => {
              abort.current?.abort();
              setStopped(true);
            }}
          >
            Остановить ответ
          </button>
        ) : (
          <button
            type="button"
            className="text-button"
            disabled={messages.length === 0}
            onClick={() => {
              followTail.current = true;
              void db.chatMessages.clear();
            }}
          >
            Очистить историю
          </button>
        )}
      </div>
    </section>
  );
}
