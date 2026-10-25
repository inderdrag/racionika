import {
  COACH_CONTEXT_KEY,
  hasCoachContextConsent,
  saveCoachContextConsent,
} from '../core/profile';
import { useState } from 'react';
import { APP_VERSION, type UserProfile } from '@racionika/shared';
import { db, localDay } from '../core/db';
import { getPlatform } from '../core/platform';
import { resetAiSession } from '../core/ai/client';
import { CONSENT_KEY, hasAiConsent, personalPlan, saveAiConsent } from '../core/profile';
import { exportBackup, parseBackup, mergeBackup, type Backup } from '../core/backup';
import { NotificationSettings } from './NotificationSettings';
export function ProfileSettings({
  profile,
  onEdit,
  onReset,
}: {
  profile: UserProfile;
  onEdit: () => void;
  onReset: () => void;
}) {
  const [consent, setConsent] = useState(hasAiConsent);
  const [notice, setNotice] = useState('');
  const [backup, setBackup] = useState<Backup>();
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('racionika.theme') ?? 'system');
  const plan = personalPlan(profile);
  async function safe(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card profile-card">
        <h2>{profile.name}</h2>
        <p>
          {profile.age} лет · {profile.height} см · {profile.weight} кг
        </p>
        <p>
          {profile.goal === 'lose'
            ? 'Снижение веса'
            : profile.goal === 'gain'
              ? 'Набор веса'
              : 'Поддержание веса'}
          {profile.goal !== 'maintain' ? ` · цель ${profile.targetWeight} кг` : ''}
        </p>

        <div className="calorie-goal-card">
          <h3>Цель калорий на день</h3>
          {plan.status === 'ready' ? (
            <>
              <strong className="daily-calorie-goal">
                {plan.calories} <small>ккал</small>
              </strong>
              <p className="subtle">
                {plan.source === 'custom'
                  ? 'Ваша цель · БЖУ пересчитаны'
                  : 'Рассчитано автоматически по вашим данным.'}
              </p>
              <p className="goal-macros">
                Б {plan.protein} г · Ж {plan.fat} г · У {plan.carbs} г
              </p>
            </>
          ) : (
            <p className="subtle">{plan.message}</p>
          )}
        </div>
        <button className="secondary" onClick={onEdit}>
          Изменить данные профиля
        </button>
        <label className="field">
          Тема
          <select
            value={theme}
            onChange={(e) => {
              const value = e.target.value;
              setTheme(value);
              localStorage.setItem('racionika.theme', value);
              if (value === 'system') delete document.documentElement.dataset.theme;
              else document.documentElement.dataset.theme = value;
            }}
          >
            <option value="system">Как на телефоне</option>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </label>
      </section>
      <NotificationSettings />
      <section className="card profile-card">
        <h2>Данные на телефоне</h2>
        <p className="subtle">Резервная копия дневника. Данные хранятся на телефоне.</p>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void safe(async () => {
              await (
                await getPlatform()
              ).share.json(`racionika-${localDay()}.json`, await exportBackup());
              setNotice('');
            })
          }
        >
          Экспортировать JSON
        </button>
        <label className="secondary file-picker">
          Импортировать JSON
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              // A failed new selection must never leave an older backup confirmable.
              setBackup(undefined);
              setNotice('');
              if (file)
                void safe(async () => {
                  if (file.size > 20 * 1024 * 1024)
                    throw new Error('Резервная копия больше 20 МБ.');
                  try {
                    setBackup(parseBackup(await file.text()));
                    setNotice('');
                  } catch {
                    throw new Error(
                      'Файл не похож на корректную резервную копию Рационики. Данные не изменены.',
                    );
                  }
                });
            }}
          />
        </label>
        {backup && (
          <div className="import-preview">
            <h3>Проверка перед импортом</h3>
            <p>
              Блюд: {backup.foodEntries.length} · вода: {backup.waterLogs.length} · сообщений:{' '}
              {backup.chatMessages.length} · записей веса: {backup.weightLogs.length} · избранных:{' '}
              {backup.favoriteDishes.length}
            </p>
            <p className="subtle">
              Записи объединятся по ID, одинаковые ID обновятся. Профиль, согласие и напоминания не
              заменяются автоматически.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void safe(async () => {
                  await mergeBackup(backup);
                  setBackup(undefined);
                  setNotice(
                    'Записи восстановлены. Повторный импорт не создаёт дублей с тем же ID.',
                  );
                })
              }
            >
              Подтвердить импорт
            </button>
            <button className="text-button" disabled={busy} onClick={() => setBackup(undefined)}>
              Отмена импорта
            </button>
          </div>
        )}
        <button
          className="danger-button"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                'Удалить профиль, дневник, избранное, воду, вес и чат с этого телефона? Сначала сохраните экспорт.',
              )
            )
              void safe(async () => {
                const result = await (await getPlatform()).notifications.replaceDaily([], false);
                if (!result.granted) throw new Error('Не удалось отключить напоминания.');
                await db.transaction(
                  'rw',
                  [
                    db.foodEntries,
                    db.waterLogs,
                    db.chatMessages,
                    db.aiCache,
                    db.weightLogs,
                    db.favoriteDishes,
                  ],
                  async () => {
                    await Promise.all([
                      db.foodEntries.clear(),
                      db.waterLogs.clear(),
                      db.chatMessages.clear(),
                      db.aiCache.clear(),
                      db.weightLogs.clear(),
                      db.favoriteDishes.clear(),
                    ]);
                  },
                );
                for (const key of [
                  'racionika.profile',
                  'racionika.reminders',
                  CONSENT_KEY,
                  COACH_CONTEXT_KEY,
                ])
                  localStorage.removeItem(key);
                await resetAiSession();
                onReset();
              });
          }}
        >
          Удалить локальные данные
        </button>
        <p className="subtle">Версия {APP_VERSION}</p>
      </section>
      <details className="card app-permissions">
        <summary>Разрешения приложения</summary>
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              const value = e.target.checked;
              saveAiConsent(value, true);
              setConsent(value);
              if (!value) void db.aiCache.clear();
            }}
          />
          <span>Использовать ИИ</span>
        </label>
        <p className="subtle">
          Фото, описания еды, сообщения, профиль и сводки передаются через сервер в AnyModel. Чат
          использует последние 10 сообщений. Расширенный контекст — дневник за 7 дней и вес за 30
          дней. Отключение останавливает новые запросы.
        </p>
        <label className="consent">
          <input
            type="checkbox"
            checked={hasCoachContextConsent()}
            disabled={!consent}
            onChange={(e) => {
              saveCoachContextConsent(e.target.checked);
              setConsent(hasAiConsent());
              setNotice(
                e.target.checked
                  ? 'Контекст наставника включён.'
                  : 'Наставнику доступен только выбранный день.',
              );
            }}
          />
          <span>Контекст наставника: 7 дней и динамика веса</span>
        </label>
      </details>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
