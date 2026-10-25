import { loadProfile, personalPlan } from './core/profile';
import { loadReminders, reminderPlan, motivations } from './core/notifications/plan';
import { ProfileForm } from './features/ProfileForm';
import { ProfileSettings } from './features/ProfileSettings';
import { Progress } from './features/Progress';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { liveQuery } from 'dexie';
import { APP_VERSION } from '@racionika/shared';
import { db, localDay, type FoodEntry } from './core/db';
import { useNavigation, type Tab } from './core/navigation';
import { consistentNutrients, scaleNutrients } from './core/nutrition/meal';
import { getPlatform } from './core/platform';
import { entryTotals } from './core/nutrition/analysis';
import { AddFoodDialog } from './features/add-food/AddFoodDialog';
import { Coach } from './features/Coach';
import { t } from './core/i18n';
import { Icon } from './shared/ui/Icon';
const tabs: Tab[] = ['home', 'diary', 'coach', 'progress', 'settings'];
export function App() {
  const { tab, setTab } = useNavigation();
  const [day, setDay] = useState(localDay());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [water, setWater] = useState(0);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState<FoodEntry>();
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState(loadProfile);
  const [editingProfile, setEditingProfile] = useState(false);
  const [customWater, setCustomWater] = useState('');
  const [error, setError] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  const backHandler = useRef<() => boolean>(() => false);
  useEffect(() => {
    backHandler.current = () => {
      if (open) {
        closeDialog();
        return true;
      }
      if (editingProfile) {
        setEditingProfile(false);
        return true;
      }
      if (tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    };
  });
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void getPlatform()
      .then(async (platform) => {
        const stop = await platform.navigation.listenBack(() => backHandler.current());
        if (disposed) stop();
        else cleanup = stop;
      })
      .catch(() =>
        setNotice('Не удалось настроить кнопку «Назад». Используйте кнопки приложения.'),
      );
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const subscription = liveQuery(async () => ({
      entries: await db.foodEntries.where('day').equals(day).sortBy('createdAt'),
      water: (await db.waterLogs.where('day').equals(day).toArray()).reduce(
        (sum, item) => sum + item.ml,
        0,
      ),
    })).subscribe({
      next: (data) => {
        setEntries(data.entries);
        setWater(data.water);
      },
      error: () =>
        setError(
          'Не удалось открыть локальную базу. Проверьте свободное место и доступ к хранилищу браузера.',
        ),
    });
    return () => subscription.unsubscribe();
  }, [day]);
  useEffect(() => {
    const update = () => setProfile(loadProfile());
    window.addEventListener('racionika:profile', update);
    window.addEventListener('racionika:consent', update);
    const theme = localStorage.getItem('racionika.theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    return () => {
      window.removeEventListener('racionika:profile', update);
      window.removeEventListener('racionika:consent', update);
    };
  }, []);
  const hasProfile = Boolean(profile);
  useEffect(() => {
    if (!hasProfile) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const reschedule = () => {
      void getPlatform()
        .then((p) => p.notifications.replaceDaily(reminderPlan(loadReminders()), false))
        .catch(() => {
          if (!disposed)
            setNotice('Проверьте напоминания в Профиле: Android мог изменить разрешения.');
        });
    };
    void getPlatform()
      .then(async (p) => {
        const stop = await p.notifications.listen((route) => {
          setTab(route);
          if (route === 'diary') setOpen(true);
        });
        if (disposed) stop();
        else cleanup = stop;
        if (!disposed) reschedule();
      })
      .catch(() => {
        if (!disposed)
          setNotice('Не удалось проверить уведомления. Откройте настройки напоминаний.');
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [hasProfile, setTab]);
  const plan = profile ? personalPlan(profile) : undefined;
  const totals = entries.reduce(
    (sum, entry) => {
      const value = entryTotals(entry);
      return {
        kcal: sum.kcal + value.kcal,
        protein: sum.protein + value.protein,
        fat: sum.fat + value.fat,
        carbs: sum.carbs + value.carbs,
      };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
  async function safely(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      setError('Не удалось сохранить данные. Проверьте свободное место и попробуйте ещё раз.');
    }
  }
  function closeDialog() {
    setOpen(false);
    setManual(false);
    setEditing(undefined);
    // Wait until the modal unmounts: background controls are inert while it is open.
    requestAnimationFrame(() => addButton.current?.focus());
  }
  async function addWater(ml: number) {
    await safely(() =>
      db.waterLogs.add({ id: crypto.randomUUID(), day, ml, createdAt: new Date().toISOString() }),
    );
  }
  async function undoWater() {
    await safely(async () => {
      const logs = await db.waterLogs.where('day').equals(day).sortBy('createdAt');
      const last = logs.at(-1);
      if (last) await db.waterLogs.delete(last.id);
    });
  }
  const dateText = new Date(`${day}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
  const mealList = (
    <section className="card">
      <div className="section-head">
        <h2>Приёмы пищи</h2>
        <span className="subtle">Записей: {entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <Icon name="leaf" size={32} />
          </div>
          <h3>Начнём с одного блюда</h3>
          <p>
            Сфотографируйте или опишите еду.
            <br />
            Ингредиенты и КБЖУ определит ИИ.
          </p>
          <button className="text-button" onClick={() => setOpen(true)}>
            Определить КБЖУ <Icon name="arrow" size={18} />
          </button>
        </div>
      ) : (
        <ul className="meals">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                className="meal-edit"
                onClick={() => {
                  setEditing(entry);
                  setOpen(true);
                }}
              >
                <span className="meal-avatar">
                  <Icon name="leaf" />
                </span>
                <span>
                  <strong>{entry.name}</strong>
                  <small>
                    {Math.round(entry.grams)} г ·{' '}
                    {entry.source === 'demo'
                      ? 'ДЕМО'
                      : entry.analysis
                        ? 'оценка ИИ'
                        : 'ручной ввод'}
                  </small>
                </span>
                <b>
                  {Math.round(entryTotals(entry).kcal)}
                  <small>ккал</small>
                </b>
              </button>
              <button
                className="delete"
                aria-label={`Удалить ${entry.name}`}
                onClick={() => void safely(() => db.foodEntries.delete(entry.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  if (!profile || editingProfile)
    return (
      <ProfileForm
        initial={editingProfile && profile ? profile : undefined}
        onDone={(value) => {
          setProfile(value);
          setEditingProfile(false);
          window.scrollTo(0, 0);
        }}
        onCancel={editingProfile ? () => setEditingProfile(false) : undefined}
      />
    );
  return (
    <div className="desktop">
      <aside className="desktop-note">
        <div className="wordmark">
          <Icon name="leaf" size={36} />
          <span>Рационика</span>
        </div>
        <h1>
          Питание.
          <br />
          Без лишнего
          <br />
          <em>давления.</em>
        </h1>
        <p>
          Ваш дневник — на вашем устройстве.
          <br />
          Маленькие шаги каждый день.
        </p>
        <div className="stage">
          Ваш спокойный ритм · {APP_VERSION}
          <br />
          <span>
            КБЖУ по фото и описанию.
            <br />
            Профиль и дневник — на вашем устройстве.
          </span>
        </div>
      </aside>
      <div className="phone">
        <header className="topbar">
          <span className="brand">
            <Icon name="leaf" size={20} />
            {t('brand')}
          </span>
          <span className="local-badge">На телефоне</span>
        </header>
        <main>
          <div className="page-title">
            <p className="eyebrow">{profile.name}, ВАШ СПОКОЙНЫЙ РИТМ</p>
            <h1>
              {tab === 'home'
                ? 'Хороший день для себя'
                : tab === 'diary'
                  ? 'Дневник питания'
                  : tab === 'coach'
                    ? 'Рядом, без осуждения'
                    : tab === 'progress'
                      ? 'В своём темпе'
                      : 'Ваше пространство'}
            </h1>
          </div>
          {(tab === 'home' || tab === 'diary') && (
            <>
              <label className="date-control">
                <span>{dateText}</span>
                <input
                  aria-label="Дата дневника"
                  type="date"
                  value={day}
                  onChange={(event) => event.target.value && setDay(event.target.value)}
                />
              </label>
              <section className="card energy">
                <div className="section-head">
                  <h2>Энергия дня</h2>
                  <span className="subtle">ккал</span>
                </div>
                <div className="energy-display">
                  <div className="calorie-orbit">
                    <div>
                      <strong>{Math.round(totals.kcal).toLocaleString('ru-RU')}</strong>
                      <span>съедено</span>
                    </div>
                  </div>
                  <div className="energy-copy">
                    <span className="tiny-leaf">
                      <Icon name="leaf" />
                    </span>
                    <h3>
                      {plan?.status === 'ready' ? `${plan.calories} ккал` : 'Индивидуальный план'}
                    </h3>
                    <p>
                      {plan?.status === 'ready' ? (
                        <>
                          Ваша цель на день
                          <br />
                          {Math.max(0, plan.calories - Math.round(totals.kcal))} ккал осталось
                        </>
                      ) : (
                        'Стандартная диета не назначена. Настройте индивидуальный план со специалистом.'
                      )}
                    </p>
                  </div>
                </div>
                <div className="macros">
                  {(['protein', 'fat', 'carbs'] as const).map((key, index) => (
                    <div key={key} className={key}>
                      <span>{['Белки', 'Жиры', 'Углеводы'][index]}</span>
                      <strong>
                        {Math.round(totals[key])}
                        <small> г{plan?.status === 'ready' ? ` / ${plan[key]} г` : ''}</small>
                      </strong>
                      <div className="macro-line" />
                    </div>
                  ))}
                </div>
              </section>
              {tab === 'home' && (
                <section className="card water">
                  <div className="section-head">
                    <h2>
                      <Icon name="drop" size={20} /> Вода
                    </h2>
                    <strong>
                      {water.toLocaleString('ru-RU')} <small>мл</small>
                    </strong>
                  </div>
                  <p>
                    {plan?.water
                      ? `Ориентир: ${plan.water} мл · с учётом жажды`
                      : 'Глоток заботы о себе'}
                  </p>
                  <div className="water-actions">
                    {[150, 200, 250, 500].map((ml) => (
                      <button key={ml} onClick={() => void addWater(ml)}>
                        +{ml}
                      </button>
                    ))}
                  </div>
                  <form
                    className="custom-water"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = Number(customWater);
                      if (Number.isInteger(value) && value > 0 && value <= 5000) {
                        void addWater(value);
                        setCustomWater('');
                      } else setError('Введите объём от 1 до 5000 мл.');
                    }}
                  >
                    <label className="field">
                      Свой объём, мл
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        required
                        value={customWater}
                        onChange={(e) => setCustomWater(e.target.value)}
                      />
                    </label>
                    <button className="secondary">Добавить воду</button>
                  </form>
                  {water > 0 && (
                    <button className="text-button" onClick={() => void undoWater()}>
                      Отменить последнее
                    </button>
                  )}
                </section>
              )}
              {tab === 'home' && (
                <section className="card daily-support">
                  <h2>Поддержка дня</h2>
                  <p>{motivations[new Date(`${day}T12:00:00`).getDay()]}</p>
                </section>
              )}
              {mealList}
            </>
          )}
          {tab === 'coach' && profile && (
            <Coach day={day} totals={totals} entries={entries} water={water} profile={profile} />
          )}
          {tab === 'progress' && profile && <Progress profile={profile} />}
          {tab === 'settings' && profile && (
            <ProfileSettings
              profile={profile}
              onEdit={() => setEditingProfile(true)}
              onReset={() => {
                setProfile(null);
                setTab('home');
              }}
            />
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="disclaimer">
            Оценки питания не заменяют консультацию врача.
            <br />
            КБЖУ по фото — оценка. Для точности проверьте массу и рецепт.
          </p>
        </main>
        <button
          ref={addButton}
          className="fab"
          aria-label="Добавить еду"
          onClick={() => setOpen(true)}
        >
          <Icon name="plus" size={25} />
          <span>Добавить еду</span>
        </button>
        <nav className="bottom-nav" aria-label="Основная навигация">
          {tabs.map((item) => (
            <button
              key={item}
              aria-label={t(item)}
              aria-current={tab === item ? 'page' : undefined}
              onClick={() => setTab(item)}
            >
              <span>
                <Icon name={item} />
              </span>
              {item === 'coach' ? 'ИИ' : t(item)}
            </button>
          ))}
        </nav>
      </div>
      {open && (manual || (editing && !editing.analysis)) && (
        <FoodDialog
          day={day}
          editing={editing}
          onClose={closeDialog}
          onSaved={(corrected) => {
            setNotice(
              corrected ? 'Калории уточнены по БЖУ и сохранены' : 'Запись сохранена на устройстве',
            );
            closeDialog();
          }}
        />
      )}
      {open && !manual && (!editing || editing.analysis) && (
        <AddFoodDialog
          day={day}
          editing={editing}
          onClose={closeDialog}
          onManual={() => setManual(true)}
          onSaved={() => {
            setNotice('Блюдо сохранено. КБЖУ рассчитаны на устройстве.');
            closeDialog();
          }}
        />
      )}
    </div>
  );
}
function FoodDialog({
  day,
  editing,
  onClose,
  onSaved,
}: {
  day: string;
  editing?: FoodEntry;
  onClose: () => void;
  onSaved: (corrected: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const name = String(data.get('name') ?? '').trim();
      if (!name || name.length > 160) throw new Error('name');
      const grams = Number(data.get('grams'));
      const { nutrients, corrected } = consistentNutrients({
        kcal: Number(data.get('kcal')),
        protein: Number(data.get('protein')),
        fat: Number(data.get('fat')),
        carbs: Number(data.get('carbs')),
      });
      scaleNutrients(nutrients, grams);
      if (grams === 0) throw new Error('grams');
      setBusy(true);
      await db.foodEntries.put({
        id: editing?.id ?? crypto.randomUUID(),
        day,
        name,
        grams,
        per100: nutrients,
        createdAt: editing?.createdAt ?? new Date().toISOString(),
      });
      onSaved(corrected);
    } catch {
      setError(
        'Не удалось сохранить. Проверьте название и значения: масса 1–5000 г, БЖУ 0–100 г, калории 0–1000 на 100 г.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="food-title"
    >
      <form onSubmit={(event) => void save(event)}>
        <div className="section-head">
          <h2 id="food-title">{editing ? 'Правка блюда' : 'Добавить вручную'}</h2>
          <button type="button" className="close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="subtle">
          Возьмите значения с упаковки на 100 г. Всё считается локально, без ИИ.
        </p>
        <label>
          Название
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={editing?.name}
            placeholder="Например, творог 5%"
            autoFocus
          />
        </label>
        <label>
          Масса порции, г
          <input
            name="grams"
            type="number"
            min="1"
            max="5000"
            step="0.1"
            required
            defaultValue={editing?.grams ?? 100}
            inputMode="decimal"
          />
        </label>
        <fieldset>
          <legend>На 100 г продукта</legend>
          <div className="form-grid">
            {(['kcal', 'protein', 'fat', 'carbs'] as const).map((key, index) => (
              <label key={key}>
                {['Калории, ккал', 'Белки, г', 'Жиры, г', 'Углеводы, г'][index]}
                <input
                  name={key}
                  type="number"
                  min="0"
                  max={key === 'kcal' ? 1000 : 100}
                  step="0.1"
                  required
                  defaultValue={editing?.per100[key] ?? 0}
                  inputMode="decimal"
                />
              </label>
            ))}
          </div>
        </fieldset>
        <p className="subtle">
          Если ккал расходятся с БЖУ более чем на 15%, используем 4·Б + 4·У + 9·Ж и сообщим об этом.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить запись'}
        </button>
      </form>
    </dialog>
  );
}
