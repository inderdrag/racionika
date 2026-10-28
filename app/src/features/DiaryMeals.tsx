import { useDialogFocus } from '../shared/ui/useDialogFocus';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { liveQuery } from 'dexie';
import { db, type FoodEntry, type MealType } from '../core/db';
import {
  copyDish,
  prepareDishForReuse,
  mealTypes,
  recentDishes,
  validateDetails,
} from '../core/diary';
import { entryTotals } from '../core/nutrition/analysis';
import { useFavorites } from '../core/favorites';
import { FavoriteHeart } from '../shared/ui/FavoriteHeart';
import { MealComposer } from './add-food/MealComposer';
import { AddFoodDialog } from './add-food/AddFoodDialog';
import { Icon } from '../shared/ui/Icon';
interface Props {
  entries: FoodEntry[];
  day: string;
  expanded: boolean;
  onEdit: (entry: FoodEntry) => void;
}
type Editor = { entry: FoodEntry; mode: 'details' | 'copy' };
export function DiaryMeals({ entries, day, expanded, onEdit }: Props) {
  const { items: favorites, error: favoriteError } = useFavorites();
  const [composer, setComposer] = useState<FoodEntry>();
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
      recent: recentDishes(
        await db.foodEntries.orderBy('createdAt').reverse().limit(200).toArray(),
      ),
    })).subscribe({
      next: (value) => {
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
  function row(entry: FoodEntry) {
    return (
      <li key={entry.id} className="diary-entry">
        <div className="diary-entry-main">
          <button className="meal-edit" onClick={() => onEdit(entry)}>
            <strong>{entry.name}</strong>
          </button>
          <FavoriteHeart entry={entry} favorites={favorites} disabled={busy} />
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
        <div className="diary-entry-info">
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
          <b>
            {Math.round(entryTotals(entry).kcal)}
            <small>ккал</small>
          </b>
        </div>
        {entry.note && <p className="diary-note">{entry.note}</p>}
        <details className="entry-actions">
          <summary>Действия</summary>
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
                    onClick={() => {
                      editorOpener.current = document.activeElement as HTMLElement;
                      setComposer(prepareDishForReuse(entry));
                    }}
                  >
                    +
                  </button>
                  <FavoriteHeart entry={entry} favorites={favorites} disabled={busy} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {composer && (
        <MealComposer
          entry={composer}
          day={day}
          onClose={() => {
            setComposer(undefined);
            closeEditor();
          }}
          onSaved={() => {
            setComposer(undefined);
            closeEditor();
          }}
          renderPicker={(pick, close) => (
            <AddFoodDialog day={day} onPick={pick} onClose={close} onSaved={close} />
          )}
        />
      )}
      {(error || favoriteError) && (
        <p className="error" role="alert">
          {error || favoriteError}
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
            {mode === 'details' ? 'Время и заметка' : 'Копировать блюдо'}
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
            <input name="time" type="time" defaultValue={entry.eatenTime ?? ''} />
          </label>
          <label>
            Заметка
            <textarea
              aria-label="Заметка"
              name="note"
              maxLength={1000}
              rows={3}
              defaultValue={entry.note ?? ''}
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
