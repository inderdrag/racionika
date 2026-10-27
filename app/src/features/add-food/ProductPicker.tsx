import { useRef, useState, type FormEvent } from 'react';
import { searchCatalog } from '../../core/catalog';
import type { CatalogProduct } from '../../core/catalog/types';
import { db } from '../../core/db';
import { mealMetadata, mealTypes } from '../../core/diary';
import { scaleNutrients } from '../../core/nutrition/meal';
import { CatalogSource } from './CatalogSource';
export function ProductPicker({
  day,
  busy,
  onCamera,
  onSaved,
}: {
  day: string;
  busy: boolean;
  onCamera: () => void;
  onSaved: () => void;
}) {
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [grams, setGrams] = useState('100');
  const [mealType, setMealType] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const results = query.trim() ? searchCatalog(query) : [];
  const amount = Number(grams);
  const total =
    selected && Number.isFinite(amount) && amount >= 1 && amount <= 5000
      ? scaleNutrients(selected.per100, amount)
      : null;
  async function save(event: FormEvent) {
    event.preventDefault();
    const category = mealTypes.find((item) => item.value === mealType)?.value;
    if (!selected || !total || !category || saving) return;
    setSaving(true);
    setError('');
    try {
      await db.foodEntries.put({
        ...mealMetadata(),
        id: crypto.randomUUID(),
        day,
        name: selected.name,
        grams: amount,
        per100: selected.per100,
        source: 'label',
        catalogSource: selected.source,
        mealType: category,
        createdAt: new Date().toISOString(),
      });
      onSaved();
    } catch {
      setError('Не удалось сохранить продукт.');
    } finally {
      setSaving(false);
    }
  }
  if (selected)
    return (
      <form onSubmit={(e) => void save(e)} className="catalog-selection">
        <label className="field">
          Куда добавить
          <select
            aria-label="Куда добавить"
            value={mealType}
            required
            onChange={(e) => setMealType(e.target.value)}
          >
            <option value="">Выберите приём пищи</option>
            {mealTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <h3>{selected.name}</h3>
        <p className="subtle">
          {selected.preparation} · {selected.per100.kcal.toLocaleString('ru-RU')} ккал на 100 г
        </p>
        <label>
          Масса, г
          <input
            type="number"
            inputMode="decimal"
            min="1"
            max="5000"
            step="0.1"
            required
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
          />
        </label>
        <div className="catalog-total">
          <strong>
            {Math.round(total?.kcal ?? 0).toLocaleString('ru-RU')} <small>ккал</small>
          </strong>
          <p>
            Б {(total?.protein ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} г · Ж{' '}
            {(total?.fat ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} г · У{' '}
            {(total?.carbs ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} г
          </p>
        </div>
        <CatalogSource source={selected.source} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={saving || !total || !mealType}>
          Добавить в дневник
        </button>
        <button
          type="button"
          className="text-button"
          disabled={saving}
          onClick={() => {
            setSelected(null);
            setError('');
            requestAnimationFrame(() => search.current?.focus());
          }}
        >
          Вернуться к поиску
        </button>
      </form>
    );
  return (
    <>
      <form role="search" className="product-search" onSubmit={(e) => e.preventDefault()}>
        <input
          ref={search}
          type="search"
          aria-label="Поиск продуктов"
          placeholder="Найти продукт"
          autoComplete="off"
          maxLength={120}
          value={query}
          disabled={busy}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(20);
          }}
        />
        <button
          type="button"
          className="product-camera"
          aria-label="Сфотографировать продукт"
          disabled={busy}
          onClick={onCamera}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5Z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
      </form>
      {query.trim() && (
        <>
          <ul className="catalog-results" aria-label="Продукты на телефоне">
            {results.slice(0, limit).map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  className="catalog-pick"
                  disabled={busy}
                  onClick={() => {
                    setSelected(product);
                    setGrams('100');
                  }}
                >
                  <strong>{product.name}</strong>
                  <span className="subtle">{Math.round(product.per100.kcal)} ккал на 100 г</span>
                </button>
              </li>
            ))}
          </ul>
          {!results.length && (
            <p className="subtle" role="status">
              Ничего не найдено.
            </p>
          )}
          {results.length > limit && (
            <button
              type="button"
              className="secondary"
              onClick={() => setLimit((n) => n + 20)}
              disabled={busy}
            >
              Показать ещё
            </button>
          )}
        </>
      )}
    </>
  );
}
