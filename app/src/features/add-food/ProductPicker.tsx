import { useEffect, useRef, useState, type FormEvent } from 'react';
import { liveQuery } from 'dexie';
import { PortionInput } from './PortionInput';
import { productUsage, rankByUsage, shortForm, sourceKey } from '../../core/catalog/usage';
import { searchCatalog } from '../../core/catalog';
import type { CatalogProduct } from '../../core/catalog/types';
import { useFavorites } from '../../core/favorites';
import { FavoriteHeart } from '../../shared/ui/FavoriteHeart';
import type { FoodEntry } from '../../core/db';
import { db } from '../../core/db';
import { mealMetadata, mealTypes } from '../../core/diary';
import { scaleNutrients } from '../../core/nutrition/meal';
import { CatalogSource } from './CatalogSource';
export function ProductPicker({
  day,
  busy,
  onCamera,
  onSaved,
  onPick,
  onCompose,
}: {
  day: string;
  busy: boolean;
  onCamera: () => void;
  onSaved: () => void;
  onPick?: (entry: FoodEntry, keepOpen?: boolean) => void;
  onCompose?: (entry: FoodEntry) => void;
}) {
  const favorites = useFavorites();
  function productEntry(product: CatalogProduct, amount = 100): FoodEntry {
    return {
      ...mealMetadata(),
      id: crypto.randomUUID(),
      day,
      name: product.name,
      grams: amount,
      per100: product.per100,
      source: 'label',
      catalogSource: product.source,
      mealType: mealTypes.find((m) => m.value === mealType)?.value,
      createdAt: new Date().toISOString(),
    };
  }
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [grams, setGrams] = useState('100');
  const [mealType, setMealType] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<FoodEntry[]>([]);
  const [added, setAdded] = useState(0);
  useEffect(() => {
    const subscription = liveQuery(() =>
      db.foodEntries.orderBy('createdAt').reverse().limit(1000).toArray(),
    ).subscribe({
      next: setHistory,
      error: () => setError('История порций недоступна. Поиск работает.'),
    });
    return () => subscription.unsubscribe();
  }, []);
  const usage = productUsage(history);
  const results = query.trim() ? rankByUsage(searchCatalog(query), usage) : [];
  function backToSearch() {
    setSelected(null);
    setError('');
    requestAnimationFrame(() => {
      search.current?.focus();
      search.current?.select();
    });
  }
  async function saveSelected(keepOpen = false) {
    const category = mealTypes.find((item) => item.value === mealType)?.value;
    if (!selected || !total || (!onPick && !category) || saving) return;
    setSaving(true);
    setError('');
    try {
      const entry = productEntry(selected, amount);
      if (onPick) onPick(entry, keepOpen);
      else {
        await db.foodEntries.put(entry);
        if (!keepOpen) onSaved();
      }
      if (keepOpen) {
        setAdded((n) => n + 1);
        backToSearch();
      }
    } catch {
      setError('Не удалось сохранить продукт.');
    } finally {
      setSaving(false);
    }
  }
  const amount = Number(grams);
  const total =
    selected && Number.isFinite(amount) && amount >= 1 && amount <= 5000
      ? scaleNutrients(selected.per100, amount)
      : null;
  async function save(event: FormEvent) {
    event.preventDefault();
    await saveSelected();
  }
  if (selected)
    return (
      <form onSubmit={(e) => void save(e)} className="catalog-selection">
        {!onPick && (
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
        )}
        <div className="favorite-title">
          <h3>{selected.name}</h3>
          <FavoriteHeart
            entry={productEntry(selected, total ? amount : 100)}
            favorites={favorites.items}
            disabled={saving || !total}
          />
        </div>
        <p className="subtle">
          {selected.preparation} · {selected.per100.kcal.toLocaleString('ru-RU')} ккал на 100 г
        </p>
        <PortionInput
          key={selected.id}
          source={selected.source}
          grams={grams}
          onChange={setGrams}
          lastGrams={usage.get(sourceKey(selected.source))?.grams}
          disabled={saving}
        />
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
        {onCompose && (
          <button
            type="button"
            className="secondary"
            disabled={saving || !total}
            onClick={() => onCompose(productEntry(selected, amount))}
          >
            ＋ Добавить продукт
          </button>
        )}
        <CatalogSource source={selected.source} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="secondary"
          disabled={saving || !total || (!onPick && !mealType)}
          onClick={() => void saveSelected(true)}
        >
          Добавить и продолжить
        </button>
        <button className="primary" disabled={saving || !total || (!onPick && !mealType)}>
          {onPick ? 'Добавить продукт' : 'Добавить в дневник'}
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
      {added > 0 && (
        <p className="subtle" role="status">
          Добавлено: {added}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {query.trim() && (
        <>
          <ul className="catalog-results" aria-label="Продукты на телефоне">
            {results.slice(0, limit).map((product) => (
              <li key={product.id} className="catalog-result-row">
                <button
                  type="button"
                  className="catalog-pick"
                  data-product-id={product.id}
                  disabled={busy}
                  onClick={() => {
                    setSelected(product);
                    setGrams('100');
                  }}
                >
                  <strong>{product.name}</strong>
                  <span className="subtle">
                    {shortForm(product)} · {Math.round(product.per100.kcal)} ккал на 100 г
                    {usage.has(sourceKey(product.source)) ? ' · недавно' : ''}
                  </span>
                </button>
                <FavoriteHeart
                  entry={productEntry(product)}
                  favorites={favorites.items}
                  disabled={busy}
                />
              </li>
            ))}
          </ul>
          {results.some((p) => p.source.provider === 'off') && (
            <p className="catalog-attribution subtle">
              Данные{' '}
              <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
                Open Food Facts
              </a>{' '}
              ·{' '}
              <a
                href="https://opendatacommons.org/licenses/odbl/1-0/"
                target="_blank"
                rel="noopener noreferrer"
              >
                ODbL
              </a>
            </p>
          )}
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
