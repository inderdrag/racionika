import { useState, type FormEvent } from 'react';
import { getPlatform } from '../core/platform';
import {
  REMINDER_KEY,
  loadReminders,
  reminderPlan,
  type ReminderSettings,
} from '../core/notifications/plan';
export function NotificationSettings() {
  const [settings, setSettings] = useState(loadReminders);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  let preview: ReturnType<typeof reminderPlan> = [];
  try {
    preview = reminderPlan(settings);
  } catch {
    /* Ошибка показывается при сохранении. */
  }
  const patch = (next: Partial<ReminderSettings>) =>
    setSettings((current) => ({ ...current, ...next }));
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const items = reminderPlan(settings);
      const result = await (await getPlatform()).notifications.replaceDaily(items, true);
      if (!result.granted)
        throw new Error(
          'Нет разрешения на уведомления. Разрешите их для Рационики в настройках Android; расписание не сохранено.',
        );
      localStorage.setItem(REMINDER_KEY, JSON.stringify(settings));
      setNotice(
        items.length
          ? `Сохранено.${result.exact ? '' : ' Android может задерживать доставку; для точного времени разрешите будильники.'}`
          : 'Все напоминания отключены.',
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось настроить уведомления.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card notification-settings">
      <h2>Напоминания и поддержка</h2>
      <p className="subtle">Без уведомлений во время сна.</p>
      <form onSubmit={(event) => void save(event)}>
        <div className="form-grid">
          <label className="field">
            Ложусь спать
            <input
              type="time"
              required
              value={settings.sleep}
              onChange={(e) => patch({ sleep: e.target.value })}
            />
          </label>
          <label className="field">
            Просыпаюсь
            <input
              type="time"
              required
              value={settings.wake}
              onChange={(e) => patch({ wake: e.target.value })}
            />
          </label>
        </div>
        <label className="consent">
          <input
            type="checkbox"
            checked={settings.meals}
            onChange={(e) => patch({ meals: e.target.checked })}
          />
          <span>Напоминать о еде</span>
        </label>
        {settings.meals && (
          <label className="field">
            Еда каждые, часов
            <input
              type="number"
              min={1}
              max={12}
              step={1}
              required
              value={settings.mealHours}
              onChange={(e) => patch({ mealHours: Number(e.target.value) })}
            />
          </label>
        )}
        <label className="consent">
          <input
            type="checkbox"
            checked={settings.water}
            onChange={(e) => patch({ water: e.target.checked })}
          />
          <span>Напоминать о воде</span>
        </label>
        {settings.water && (
          <label className="field">
            Вода каждые, минут
            <input
              type="number"
              min={30}
              max={240}
              step={30}
              required
              value={settings.waterMinutes}
              onChange={(e) => patch({ waterMinutes: Number(e.target.value) })}
            />
          </label>
        )}
        <label className="consent">
          <input
            type="checkbox"
            checked={settings.motivation}
            onChange={(e) => patch({ motivation: e.target.checked })}
          />
          <span>Присылать мотивацию</span>
        </label>
        {settings.motivation && (
          <label className="field">
            Время поддержки
            <input
              type="time"
              required
              value={settings.motivationTime}
              onChange={(e) => patch({ motivationTime: e.target.value })}
            />
          </label>
        )}
        {settings.meals && (
          <p className="schedule-preview">
            Еда:{' '}
            {preview
              .filter((item) => item.channel === 'meals')
              .map(
                (item) =>
                  `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`,
              )
              .join(', ') || 'проверьте время'}
            .
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Настраиваем…' : 'Сохранить напоминания'}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            void getPlatform()
              .then((p) => p.notifications.openExactSettings())
              .then(() => setNotice('После изменения разрешения сохраните напоминания ещё раз.'))
              .catch(() => setNotice('Эта настройка доступна в Android-приложении.'))
          }
        >
          Точное время уведомлений
        </button>
      </form>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
