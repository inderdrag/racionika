import { useEffect, useRef, useState, type ReactNode } from 'react';
import { db, type FoodEntry, type MealType } from '../../core/db';
import { mealMetadata, mealTypes } from '../../core/diary';
import {
  appendIngredients,
  composeEntry,
  ingredientEntry,
  ingredientsOf,
  resizeIngredients,
} from '../../core/meal-composer';
import { useFavorites } from '../../core/favorites';
import { FavoriteHeart } from '../../shared/ui/FavoriteHeart';
import { useDialogFocus } from '../../shared/ui/useDialogFocus';
import { reviewMealComposition } from '@racionika/shared';
import { PortionInput } from './PortionInput';
import { entryTotals } from '../../core/nutrition/analysis';
interface Props {
  entry: FoodEntry;
  day: string;
  editing?: boolean;
  initialCategory?: MealType;
  onClose: () => void;
  onSaved: () => void;
  renderPicker: (
    pick: (entry: FoodEntry, keepOpen?: boolean) => void,
    close: () => void,
  ) => ReactNode;
}
export function MealComposer({
  entry,
  day,
  editing = false,
  initialCategory,
  onClose,
  onSaved,
  renderPicker,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null),
    add = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialog);
  const [seed, setSeed] = useState(() => structuredClone(entry));
  const [items, setItems] = useState(() => ingredientsOf(entry));
  const [name, setName] = useState(entry.name);
  const [category, setCategory] = useState<MealType | ''>(
    initialCategory ?? (editing ? (entry.mealType ?? '') : ''),
  );
  const [mass, setMass] = useState(String(ingredientsOf(entry).reduce((s, p) => s + p.grams, 0)));
  const [picking, setPicking] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const favorites = useFavorites();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  let draft: FoodEntry | undefined;
  try {
    draft = composeEntry(seed, items, name, day);
  } catch {
    /* Invalid fields remain editable. */
  }
  const issue = draft?.analysis ? reviewMealComposition(draft.analysis)[0]?.message : '';
  function closePicker() {
    setPicking(false);
  }
  const wasPicking = useRef(false);
  useEffect(() => {
    if (!picking && wasPicking.current) requestAnimationFrame(() => add.current?.focus());
    wasPicking.current = picking;
  }, [picking]);
  async function save() {
    if (
      !draft ||
      !category ||
      issue ||
      busy ||
      Number(mass) < 1 ||
      Number(mass) > 5000 ||
      !Number.isFinite(Number(mass))
    ) {
      setError(issue || 'Выберите приём пищи и проверьте массу.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = {
        ...draft,
        ...mealMetadata(editing ? entry : undefined),
        mealType: category,
        id: editing ? entry.id : crypto.randomUUID(),
        createdAt: editing ? entry.createdAt : new Date().toISOString(),
      };
      await db.foodEntries.put(saved);
      onSaved();
    } catch {
      setError('Не удалось сохранить блюдо.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <dialog
        ref={dialog}
        className="analysis-dialog meal-composer"
        aria-labelledby="composer-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) onClose();
        }}
      >
        <div className="section-head">
          <h2 id="composer-title">Добавить блюдо</h2>
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
        <div className="favorite-title">
          <h3>{name}</h3>
          {draft && (
            <FavoriteHeart
              entry={draft}
              favorites={favorites.items}
              disabled={
                busy || Number(mass) < 1 || Number(mass) > 5000 || !Number.isFinite(Number(mass))
              }
            />
          )}
        </div>
        <PortionInput
          key={
            items.length === 1 && items[0].name === seed.name
              ? (seed.catalogSource?.id ?? 'single')
              : 'meal'
          }
          source={
            items.length === 1 && items[0].name === seed.name ? seed.catalogSource : undefined
          }
          grams={mass}
          label="Масса порции, г"
          disabled={busy}
          onChange={(value) => {
            setMass(value);
            setError('');
            try {
              setItems(resizeIngredients(items, Number(value)));
            } catch {
              setError('Масса: от 1 до 5000 г.');
            }
          }}
        />
        <label className="field">
          Куда добавить
          <select
            aria-label="Куда добавить"
            value={category}
            onChange={(e) => setCategory(e.target.value as MealType)}
          >
            <option value="">Выберите приём пищи</option>
            {mealTypes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <ul className="composer-ingredients" aria-label="Состав блюда">
          {items.map((p, index) =>
            items.length === 1 && p.name === name ? null : (
              <li key={index}>
                <div className="favorite-title">
                  <strong>{p.name}</strong>
                  <FavoriteHeart
                    entry={ingredientEntry(p, seed.source)}
                    favorites={favorites.items}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="remove-ingredient"
                    aria-label={`Удалить компонент ${index + 1}`}
                    disabled={busy}
                    onClick={() => {
                      const next = items.filter((_, i) => i !== index);
                      setItems(next);
                      setMass(String(Math.round(next.reduce((s, p) => s + p.grams, 0) * 10) / 10));
                      setError('');
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="composer-portion">
                  <label>
                    Масса, г
                    <input
                      aria-label={`Масса компонента ${index + 1}`}
                      type="number"
                      min="0"
                      max="5000"
                      step="0.1"
                      inputMode="decimal"
                      disabled={busy}
                      value={Math.round(p.grams * 10) / 10}
                      onChange={(e) => {
                        const grams = Number(e.target.value);
                        if (!Number.isFinite(grams) || grams < 0 || grams > 5000) return;
                        const next = items.map((v, i) =>
                          i === index
                            ? { ...v, grams, grams_range: [grams, grams] as [number, number] }
                            : v,
                        );
                        setItems(next);
                        setMass(
                          String(Math.round(next.reduce((s, p) => s + p.grams, 0) * 10) / 10),
                        );
                        setError('');
                      }}
                    />
                  </label>
                  <strong>{Math.round((p.per_100g.kcal * p.grams) / 100)} ккал</strong>
                </div>
              </li>
            ),
          )}
        </ul>
        <button
          type="button"
          ref={add}
          className="secondary"
          disabled={busy}
          onClick={() => setPicking(true)}
        >
          ＋ Добавить продукт
        </button>
        <div className="catalog-total">
          <strong>{Math.round(draft ? entryTotals(draft).kcal : 0)} ккал</strong>
          <span>{draft ? Math.round(draft.grams * 10) / 10 : 0} г</span>
        </div>
        <details className="composer-name">
          <summary>Название блюда</summary>
          <label className="field">
            Название
            <input maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </details>
        {(error || issue || favorites.error) && (
          <p role="alert" className="error">
            {error || issue || favorites.error}
          </p>
        )}
        <button
          type="button"
          className="primary"
          disabled={
            busy ||
            !draft ||
            !category ||
            !!issue ||
            !Number.isFinite(Number(mass)) ||
            Number(mass) < 1 ||
            Number(mass) > 5000
          }
          onClick={() => void save()}
        >
          {busy
            ? 'Сохраняем…'
            : seed.source === 'demo'
              ? 'Сохранить демозапись'
              : 'Добавить в дневник'}
        </button>
      </dialog>
      {picking &&
        renderPicker((picked, keepOpen) => {
          try {
            const next = appendIngredients(items, ingredientsOf(picked));
            setItems(next);
            setMass(String(Math.round(next.reduce((s, p) => s + p.grams, 0) * 10) / 10));
            setSeed((current) => ({
              ...current,
              source:
                current.source === 'demo' || picked.source === 'demo'
                  ? 'demo'
                  : current.source === 'ai' || picked.source === 'ai'
                    ? 'ai'
                    : current.source,
            }));
            setError('');
            if (!keepOpen) closePicker();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Не удалось добавить продукт.');
            if (keepOpen) throw e;
            closePicker();
          }
        }, closePicker)}
    </>
  );
}
