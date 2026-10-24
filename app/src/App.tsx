import { useEffect, useRef, useState, type FormEvent } from 'react';
import { liveQuery } from 'dexie';
import { APP_VERSION } from '@racionika/shared';
import { db, localDay, type FoodEntry } from './core/db';
import { useNavigation, type Tab } from './core/navigation';
import { consistentNutrients, scaleNutrients } from './core/nutrition/meal';
import { getPlatform } from './core/platform';
import { checkServer } from './core/ai/client';
import { t } from './core/i18n';
import { Icon } from './shared/ui/Icon';
const tabs: Tab[] = ['home', 'diary', 'coach', 'progress', 'settings'];
export function App() {
  const { tab, setTab } = useNavigation();
  const [day, setDay] = useState(localDay());
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [water, setWater] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FoodEntry>();
  const [notice, setNotice] = useState('');
  const [server, setServer] = useState('Не проверен');
  const [error, setError] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
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
  const totals = entries.reduce(
    (sum, entry) => {
      const value = scaleNutrients(entry.per100, entry.grams);
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
    setEditing(undefined);
    addButton.current?.focus();
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
            Внесите продукт и массу.
            <br />
            Калории пересчитаются на устройстве.
          </p>
          <button className="text-button" onClick={() => setOpen(true)}>
            Добавить вручную <Icon name="arrow" size={18} />
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
                  <small>{entry.grams} г · ручной ввод</small>
                </span>
                <b>
                  {Math.round(scaleNutrients(entry.per100, entry.grams).kcal)}
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
          Техническая сборка · {APP_VERSION}
          <br />
          <span>
            Ручной ввод и вода доступны.
            <br />
            ИИ и персональный план — в разработке.
          </span>
        </div>
      </aside>
      <div className="phone">
        <header className="topbar">
          <span className="brand">
            <Icon name="leaf" size={20} />
            {t('brand')}
          </span>
          <span className="local-badge">Локально</span>
        </header>
        <main>
          <div className="page-title">
            <p className="eyebrow">ВАШ СПОКОЙНЫЙ РИТМ</p>
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
                      Сначала —<br />
                      знакомство
                    </h3>
                    <p>
                      Личная норма появится
                      <br />
                      после настройки плана.
                    </p>
                  </div>
                </div>
                <div className="macros">
                  {(['protein', 'fat', 'carbs'] as const).map((key, index) => (
                    <div key={key} className={key}>
                      <span>{['Белки', 'Жиры', 'Углеводы'][index]}</span>
                      <strong>
                        {Math.round(totals[key])}
                        <small> г</small>
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
                  <p>Глоток заботы о себе</p>
                  <div className="water-actions">
                    {[150, 200, 250, 500].map((ml) => (
                      <button key={ml} onClick={() => void addWater(ml)}>
                        +{ml}
                      </button>
                    ))}
                  </div>
                  {water > 0 && (
                    <button className="text-button" onClick={() => void undoWater()}>
                      Отменить последнее
                    </button>
                  )}
                </section>
              )}
              {mealList}
            </>
          )}
          {tab === 'coach' && (
            <section className="card feature-empty">
              <span className="empty-icon">
                <Icon name="coach" size={40} />
              </span>
              <h2>Наставник ещё учится</h2>
              <p>
                ИИ не подключён в этой технической сборке. Фото и сообщения никуда не отправляются.
              </p>
              <p className="subtle">
                Следующий этап: защищённый сервер, лимиты и проверка ответов. Это не чат с имитацией
                ИИ.
              </p>
            </section>
          )}
          {tab === 'progress' && (
            <section className="card feature-empty">
              <span className="empty-icon">
                <Icon name="progress" size={40} />
              </span>
              <h2>История начнётся с вас</h2>
              <p>
                Графики веса, воды и питания появятся на следующем этапе. Сейчас можно вести дневник
                и отмечать воду.
              </p>
              <button className="primary" onClick={() => setTab('diary')}>
                Открыть дневник
              </button>
            </section>
          )}
          {tab === 'settings' && (
            <>
              <section className="card feature-empty align-left">
                <h2>Техническая сборка {APP_VERSION}</h2>
                <p>
                  Дневник и вода хранятся в локальной базе Dexie. Удаление приложения или очистка
                  данных браузера удаляет записи.
                </p>
                <button
                  className="secondary"
                  onClick={() =>
                    void safely(async () => {
                      await (
                        await getPlatform()
                      ).share.json(`racionika-${localDay()}.json`, {
                        schemaVersion: 1,
                        exportedAt: new Date().toISOString(),
                        foodEntries: await db.foodEntries.toArray(),
                        waterLogs: await db.waterLogs.toArray(),
                      });
                      setNotice('Экспорт подготовлен');
                    })
                  }
                >
                  Экспортировать JSON
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void safely(async () => {
                      setServer('Проверяем…');
                      setServer(
                        (await checkServer())
                          ? 'Health доступен · ИИ не подключён'
                          : 'Недоступен или не настроен',
                      );
                    })
                  }
                >
                  Проверить сервер
                </button>
                <p className="subtle" role="status">
                  {server}
                </p>
                <button
                  className="danger-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Удалить все блюда и записи воды на этом устройстве? Сначала сохраните экспорт.',
                      )
                    )
                      void safely(async () => {
                        await db.transaction('rw', db.foodEntries, db.waterLogs, async () => {
                          await db.foodEntries.clear();
                          await db.waterLogs.clear();
                        });
                        setNotice('Локальные записи удалены');
                      });
                  }}
                >
                  Удалить локальные данные
                </button>
              </section>
              <section className="card">
                <h2>Что пока не готово</h2>
                <p>
                  Онбординг, профиль, цели, распознавание фото, ИИ-чат, напоминания, импорт и
                  отчёты.
                </p>
              </section>
            </>
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
            Техническая сборка · ИИ пока недоступен
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
      {open && (
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
