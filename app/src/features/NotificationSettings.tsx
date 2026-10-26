import { useState, type FormEvent } from 'react';
import { loadReminderProgress } from '../core/notifications/progress';
import { loadProfile } from '../core/profile';
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
      const platform = await getPlatform();
      const profile = loadProfile();
      const progress = profile ? await loadReminderProgress(profile) : undefined;
      const result = await platform.notifications.replaceDaily(items, true, progress);
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
      <p className="subtle">
        Без уведомлений во время сна. Расписание — по местному времени телефона.
      </p>
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
        <fieldset className="reminder-days">
          <legend>Дни недели</legend>
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((name, i) => (
            <label key={name}>
              <input
                type="checkbox"
                aria-label={name}
                checked={settings.days.includes(i + 1)}
                onChange={(e) =>
                  patch({
                    days: e.target.checked
                      ? [...settings.days, i + 1]
                      : settings.days.filter((d) => d !== i + 1),
                  })
                }
              />
              <span>{name}</span>
            </label>
          ))}
        </fieldset>
        <label className="consent">
          <input
            type="checkbox"
            checked={settings.meals}
            onChange={(e) => patch({ meals: e.target.checked })}
          />
          <span>Напоминать о еде</span>
        </label>
        {settings.meals && (
          <>
            <label className="field">
              Расписание еды
              <select
                aria-label="Расписание еды"
                value={settings.mealMode}
                onChange={(e) =>
                  patch({ mealMode: e.target.value as ReminderSettings['mealMode'] })
                }
              >
                <option value="interval">Через интервал</option>
                <option value="times">В выбранное время</option>
              </select>
            </label>
            {settings.mealMode === 'times' && (
              <div className="reminder-times">
                {settings.mealTimes.map((value, i) => (
                  <div className="reminder-time-row" key={i}>
                    <label className="field">
                      Время еды {i + 1}
                      <input
                        type="time"
                        value={value}
                        required
                        onChange={(e) =>
                          patch({
                            mealTimes: settings.mealTimes.map((v, j) =>
                              i === j ? e.target.value : v,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Удалить время ${i + 1}`}
                      onClick={() =>
                        patch({ mealTimes: settings.mealTimes.filter((_, j) => j !== i) })
                      }
                    >
                      Убрать
                    </button>
                  </div>
                ))}
                {settings.mealTimes.length < 8 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => patch({ mealTimes: [...settings.mealTimes, '12:00'] })}
                  >
                    Добавить время
                  </button>
                )}
              </div>
            )}
            {settings.mealMode === 'interval' && (
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
                checked={settings.mealFollowups}
                onChange={(e) => patch({ mealFollowups: e.target.checked })}
              />
              <span>Повторять, если еда не записана</span>
            </label>
            {settings.mealFollowups && (
              <p className="subtle">
                Через 30 минут — повтор, ещё через 30 — приём не отмечен. Запись еды отменяет
                повторы.
              </p>
            )}
          </>
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
        <label className="consent">
          <input
            type="checkbox"
            checked={settings.stopWhenGoal}
            onChange={(e) => patch({ stopWhenGoal: e.target.checked })}
          />
          <span>Не напоминать после выполнения нормы еды или воды</span>
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'Настраиваем…' : 'Сохранить напоминания'}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            void getPlatform()
              .then((p) => p.notifications.openExactSettings())
              .then(() =>
                setNotice(
                  'После изменения разрешения сохраните напоминания ещё раз. В энергосбережении Android может задерживать доставку.',
                ),
              )
              .catch(() => setNotice('Эта настройка доступна в Android-приложении.'))
          }
        >
          Точное время уведомлений
        </button>
      </form>
      <details className="notification-check">
        <summary>Проверка на телефоне</summary>
        <p className="subtle">
          Тест через минуту: закройте приложение и дождитесь уведомления. После «Остановить
          принудительно» Android блокирует напоминания до нового запуска.
        </p>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void getPlatform()
              .then((p) => p.notifications.testDelivery())
              .then((status) =>
                setNotice(
                  !status.granted
                    ? 'Разрешите уведомления в настройках Android.'
                    : `Тест назначен через минуту. Закройте приложение.${status.exact ? '' : ' Точное время не разрешено.'}${status.batterySaving ? ' Включено энергосбережение.' : ''}${status.restricted ? ' Android ограничивает фоновую работу приложения.' : ''} Система может задержать доставку.`,
                ),
              )
              .catch((error) =>
                setNotice(error instanceof Error ? error.message : 'Не удалось назначить тест.'),
              )
              .finally(() => setBusy(false));
          }}
        >
          Тестовое уведомление
        </button>
      </details>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
