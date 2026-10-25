import { hasAiConsent, personalPlan } from '../core/profile';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { liveQuery } from 'dexie';
import type { Nutrients, PublicConfig, UserProfile } from '@racionika/shared';
import { db, type ChatMessage, type FoodEntry } from '../core/db';
import { askCoach, getConfig } from '../core/ai/client';
export function Coach({
  day,
  totals,
  entries,
  water,
  profile,
}: {
  day: string;
  totals: Nutrients;
  entries: FoodEntry[];
  water: number;
  profile: UserProfile;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [config, setConfig] = useState<PublicConfig>();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const consent = hasAiConsent();
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
          profile,
          plan: personalPlan(profile),
          note: 'БЖУ рассчитаны кодом; source=custom означает пользовательскую цель калорий. Подбирай варианты еды под plan и остаток калорий/БЖУ после totals, без обещания точности или быстрого похудения. Не меняй цели молча; review означает отсутствие стандартной диеты.',
        }).slice(0, 6000),
        messages.slice(-10).map(({ role, text }) => ({ role, text: text.slice(0, 1500) })),
        controller.signal,
        personalPlan(profile).status === 'ready' ? profile.goal : 'maintain',
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
      <div className="coach-quick-actions">
        {['Оцени мой день', 'Что съесть на ужин?', 'Поддержи меня'].map((message) => (
          <button
            type="button"
            className="text-button"
            key={message}
            onClick={() => setText(message)}
          >
            {message}
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
          />
        </label>
        {!consent && (
          <p className="notice">
            Включите ИИ в Профиле. Повторное согласие в каждом сообщении не требуется.
          </p>
        )}
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
