import { useEffect, useRef, useState, type FormEvent } from 'react';
import { liveQuery } from 'dexie';
import type { Nutrients, PublicConfig } from '@racionika/shared';
import { db, type ChatMessage, type FoodEntry } from '../core/db';
import { askCoach, getConfig, setAccessCode, serverLabel } from '../core/ai/client';
export function Coach({
  day,
  totals,
  entries,
  water,
}: {
  day: string;
  totals: Nutrients;
  entries: FoodEntry[];
  water: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [config, setConfig] = useState<PublicConfig>();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(localStorage.getItem('racionika.aiConsent') === 'v1');
  const [code, setCode] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    const subscription = liveQuery(() => db.chatMessages.orderBy('createdAt').toArray()).subscribe(
      setMessages,
    );
    void getConfig()
      .then(setConfig)
      .catch(() => setError('Сервер недоступен. Запустите его или проверьте подключение.'));
    return () => {
      subscription.unsubscribe();
      abort.current?.abort();
    };
  }, []);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || !consent || busy) return;
    const message = text.trim();
    setBusy(true);
    setError('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      setAccessCode(code);
      const result = await askCoach(
        message,
        JSON.stringify({
          day,
          totals,
          water,
          meals: entries.map((entry) => ({
            name: entry.name,
            grams: entry.grams,
            source: entry.source ?? 'manual',
          })),
          note: 'Профиль и цели не настроены; не назначать калорийность.',
        }).slice(0, 6000),
        messages.slice(-10).map(({ role, text }) => ({ role, text: text.slice(0, 1500) })),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      await db.chatMessages.bulkAdd([
        {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          role: 'user',
          text: message,
        },
        {
          id: crypto.randomUUID(),
          createdAt: new Date(Date.now() + 1).toISOString(),
          role: 'assistant',
          text: result.reply.text,
          demo: result.demo,
        },
      ]);
      setText('');
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : 'Не удалось получить ответ.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card coach-card">
      <h2>Спросить наставника</h2>
      <p className="subtle">
        {config?.mode === 'demo'
          ? 'ДЕМО: фиксированный тестовый ответ, не совет ИИ.'
          : config?.mode === 'real'
            ? 'Ответы ИИ могут ошибаться. Это не медицинская консультация.'
            : 'ИИ пока не настроен. Нужен ключ провайдера на сервере.'}
      </p>
      <div className="chat-history" aria-live="polite">
        {messages.slice(-50).map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            <strong>
              {message.role === 'user' ? 'Вы' : message.demo ? 'Демо-наставник' : 'Наставник'}
            </strong>
            <p>{message.text}</p>
          </div>
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
          />
        </label>
        {config?.access_code_required && (
          <label className="field">
            Код доступа
            <input type="password" value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
        )}
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => {
              setConsent(event.target.checked);
              if (event.target.checked) localStorage.setItem('racionika.aiConsent', 'v1');
              else localStorage.removeItem('racionika.aiConsent');
            }}
          />
          <span>
            Разрешаю передать сообщение, последние 10 сообщений и сводку выбранного дня на{' '}
            {serverLabel} и провайдеру {config?.provider ?? 'ИИ'}. История хранится на устройстве.
          </span>
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={busy || !consent || !text.trim() || !config || config.mode === 'disabled'}
        >
          {busy ? 'Ждём ответ…' : 'Отправить'}
        </button>
        {busy && (
          <button type="button" className="text-button" onClick={() => abort.current?.abort()}>
            Отменить
          </button>
        )}
      </form>
      {messages.length > 0 && (
        <button className="text-button" onClick={() => void db.chatMessages.clear()}>
          Очистить историю
        </button>
      )}
    </section>
  );
}
