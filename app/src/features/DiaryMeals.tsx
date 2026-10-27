import { useDialogFocus } from '../shared/ui/useDialogFocus';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { liveQuery } from 'dexie';
import { db, type FavoriteDish, type FoodEntry, type MealType } from '../core/db';
import {
  copyDish,
  prepareDishForReuse,
  dishKey,
  localTime,
  mealTypes,
  recentDishes,
  validateDetails,
} from '../core/diary';
import { entryTotals } from '../core/nutrition/analysis';
import { Icon } from '../shared/ui/Icon';
interface Props {
  entries: FoodEntry[];
  day: string;
  expanded: boolean;
  onEdit: (entry: FoodEntry) => void;
}
type Editor = { entry: FoodEntry; mode: 'details' | 'copy' | 'reuse' };
export function DiaryMeals({ entries, day, expanded, onEdit }: Props) {
  const [favorites, setFavorites] = useState<FavoriteDish[]>([]);
  const [recent, setRecent] = useState<FoodEntry[]>([]);
  const [library, setLibrary] = useState<'favorites' | 'recent'>('favorites');
  const [editor, setEditor] = useState<Editor>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const libraryButton = useRef<HTMLButtonElement>(null);
  const editorOpener = useRef<HTMLElement | null>(null);
  function openEditor(value: Editor) {
    editorOpener.current = document.activeElement as HTMLElement | null;
    setEditor(
      value.mode === 'details' ? value : { ...value, entry: prepareDishForReuse(value.entry) },
    );
  }
  useEffect(() => {
    const sub = liveQuery(async () => ({
      favorites: await db.favoriteDishes.orderBy('createdAt').reverse().toArray(),
      recent: recentDishes(
        await db.foodEntries.orderBy('createdAt').reverse().limit(200).toArray(),
      ),
    })).subscribe({
      next: (value) => {
        setFavorites(value.favorites);
        setRecent(value.recent);
      },
      error: () => setError('Не удалось открыть избранное и недавние блюда.'),
    });
    return () => sub.unsubscribe();
  }, []);
  async function safe(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить изменение.');
    } finally {
      setBusy(false);
    }
  }
  function closeEditor() {
    setEditor(undefined);
    requestAnimationFrame(() => {
      if (editorOpener.current?.isConnected) editorOpener.current.focus();
      else libraryButton.current?.focus();
    });
  }
  async function toggleFavorite(entry: FoodEntry) {
    await safe(async () => {
      await db.transaction('rw', db.favoriteDishes, async () => {
        const existing = (await db.favoriteDishes.toArray()).filter(
          (item) => dishKey(item.entry) === dishKey(entry),
        );
        if (existing.length) {
          await db.favoriteDishes.bulkDelete(existing.map((item) => item.id));
        } else {
          if ((await db.favoriteDishes.count()) >= 10000)
            throw new Error('В избранном уже 10 000 блюд. Удалите ненужные.');
          await db.favoriteDishes.add({
            id: crypto.randomUUID(),
            entry: structuredClone(entry),
            createdAt: new Date().toISOString(),
          });
        }
      });
    });
  }
  const favoriteKeys = new Set(favorites.map((item) => dishKey(item.entry)));
  function row(entry: FoodEntry) {
    const favorite = favoriteKeys.has(dishKey(entry));
    return (
      <li key={entry.id} className="diary-entry">
        <div className="diary-entry-main">
          <button className="meal-edit" onClick={() => onEdit(entry)}>
            <span className="meal-avatar">
              <Icon name="leaf" />
            </span>
            <span>
              <strong>{entry.name}</strong>
              <small>
                {entry.eatenTime ? `${entry.eatenTime} · ` : ''}
                {Math.round(entry.grams)} г ·{' '}
                {entry.source === 'demo'
                  ? 'ДЕМО'
                  : entry.catalogSource
                    ? entry.catalogSource.provider === 'usda'
                      ? 'USDA'
                      : 'Open Food Facts'
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
            disabled={busy}
            aria-label={`Удалить ${entry.name}`}
            onClick={() =>
              void safe(async () => {
                await db.foodEntries.delete(entry.id);
              })
            }
          >
            ×
          </button>
        </div>
        {entry.note && <p className="diary-note">{entry.note}</p>}
        <details className="entry-actions">
          <summary>Действия{favorite ? ' · в избранном' : ''}</summary>
          <div>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => openEditor({ entry, mode: 'details' })}
            >
              Время и заметка
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void toggleFavorite(entry)}
            >
              {favorite ? 'Убрать из избранного' : 'В избранное'}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => openEditor({ entry, mode: 'copy' })}
            >
              Копировать на дату
            </button>
          </div>
        </details>
      </li>
    );
  }
  const groups = [...mealTypes, { value: undefined, label: 'Без категории' }];
  const dishes = library === 'favorites' ? favorites.map((item) => item.entry) : recent;
  return (
    <>
      <section className="card diary-meals">
        <div className="section-head">
          <h2>Приёмы пищи</h2>
          <span className="subtle">Записей: {entries.length}</span>
        </div>
        {!entries.length ? (
          <div className="empty">
            <div className="empty-icon">
              <Icon name="leaf" size={32} />
            </div>
            <h3>Начнём с одного блюда</h3>
            <p>Найдите продукт или сфотографируйте еду.</p>
          </div>
        ) : expanded ? (
          groups.map((group) => {
            const items = entries
              .filter((entry) => entry.mealType === group.value)
              .sort(
                (a, b) =>
                  (a.eatenTime ?? '99:99').localeCompare(b.eatenTime ?? '99:99') ||
                  a.createdAt.localeCompare(b.createdAt),
              );
            return (
              <section className="meal-group" key={group.value ?? 'none'} aria-label={group.label}>
                <div className="section-head">
                  <h3>{group.label}</h3>
                  <span className="subtle">
                    {Math.round(items.reduce((sum, item) => sum + entryTotals(item).kcal, 0))} ккал
                  </span>
                </div>
                {items.length ? (
                  <ul className="meals">{items.map(row)}</ul>
                ) : (
                  <p className="subtle group-empty">Пока нет записей</p>
                )}
              </section>
            );
          })
        ) : (
          <ul className="meals">{entries.map(row)}</ul>
        )}
      </section>
      {expanded && (
        <section className="card dish-library">
          <h2>Мои блюда</h2>
          <div className="library-tabs" role="group" aria-label="Список блюд">
            <button
              ref={libraryButton}
              className={library === 'favorites' ? 'primary' : 'secondary'}
              aria-pressed={library === 'favorites'}
              onClick={() => setLibrary('favorites')}
            >
              Избранное
            </button>
            <button
              className={library === 'recent' ? 'primary' : 'secondary'}
              aria-pressed={library === 'recent'}
              onClick={() => setLibrary('recent')}
            >
              Недавние
            </button>
          </div>
          {!dishes.length ? (
            <p className="subtle">
              {library === 'favorites' ? 'Пока нет избранных блюд.' : 'Пока нет недавних блюд.'}
            </p>
          ) : (
            <ul className="library-list">
              {dishes.map((entry, index) => (
                <li key={library === 'favorites' ? favorites[index].id : entry.id}>
                  <div>
                    <strong>{entry.name}</strong>
                    <small>
                      {Math.round(prepareDishForReuse(entry).grams)} г ·{' '}
                      {Math.round(entryTotals(prepareDishForReuse(entry)).kcal)} ккал
                      {entry.source === 'demo' ? ' · ДЕМО' : ''}
                    </small>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    aria-label={`Добавить ${entry.name} из списка`}
                    onClick={() => openEditor({ entry, mode: 'reuse' })}
                  >
                    Добавить
                  </button>
                  {library === 'favorites' && (
                    <button
                      className="text-button"
                      disabled={busy}
                      aria-label={`Убрать ${entry.name} из избранного`}
                      onClick={() => void toggleFavorite(entry)}
                    >
                      Убрать
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {editor && (
        <EntryDetails
          key={`${editor.mode}-${editor.entry.id}`}
          editor={editor}
          day={day}
          onClose={closeEditor}
          onSaved={() => {
            closeEditor();
          }}
        />
      )}
    </>
  );
}
function EntryDetails({
  editor,
  day,
  onClose,
  onSaved,
}: {
  editor: Editor;
  day: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { entry, mode } = editor;
  const dialog = useRef<HTMLDialogElement>(null);
  useDialogFocus(dialog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const date = mode === 'details' ? entry.day : String(data.get('day'));
    const time = String(data.get('time') ?? '');
    const category = String(data.get('mealType') ?? '');
    const note = String(data.get('note') ?? '');
    setBusy(true);
    setError('');
    try {
      validateDetails(date, time, note, category);
      if (mode === 'details') {
        const count = await db.foodEntries.update(entry.id, {
          eatenTime: time || undefined,
          mealType: (category || undefined) as MealType | undefined,
          note: note.trim() || undefined,
        });
        if (!count) throw new Error('Запись уже удалена. Закройте окно и обновите дневник.');
      } else await db.foodEntries.add(copyDish(entry, date, time, category, note));
      onSaved(
        mode === 'details'
          ? 'Время и заметка сохранены.'
          : `Блюдо добавлено на ${date.split('-').reverse().join('.')}. Исходная запись не изменена.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить запись.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="entry-details-dialog"
      aria-labelledby="entry-details-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={(event) => void save(event)}>
        <div className="section-head">
          <h2 id="entry-details-title">
            {mode === 'details'
              ? 'Время и заметка'
              : mode === 'copy'
                ? 'Копировать блюдо'
                : 'Добавить готовое блюдо'}
          </h2>
          <button
            type="button"
            className="close"
            aria-label="Закрыть"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <h3>{entry.name}</h3>
        <p className="subtle">
          {Math.round(entry.grams)} г · {Math.round(entryTotals(entry).kcal)} ккал
          {entry.source === 'demo' ? ' · ДЕМО' : ''}
        </p>
        <fieldset disabled={busy} className="entry-details-fields">
          {mode !== 'details' && (
            <label>
              Дата добавления
              <input
                name="day"
                type="date"
                required
                min="1900-01-01"
                max="9999-12-31"
                defaultValue={day}
              />
            </label>
          )}
          <label>
            Приём пищи
            <select aria-label="Приём пищи" name="mealType" defaultValue={entry.mealType ?? ''}>
              <option value="">Без категории</option>
              {mealTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Время еды
            <input
              name="time"
              type="time"
              defaultValue={mode === 'reuse' ? localTime() : (entry.eatenTime ?? '')}
            />
          </label>
          <label>
            Заметка
            <textarea
              aria-label="Заметка"
              name="note"
              maxLength={1000}
              rows={3}
              defaultValue={mode === 'reuse' ? '' : (entry.note ?? '')}
              placeholder="Например, домашний обед"
            />
          </label>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Сохраняем…' : mode === 'details' ? 'Сохранить детали' : 'Добавить в дневник'}
        </button>
      </form>
    </dialog>
  );
}
