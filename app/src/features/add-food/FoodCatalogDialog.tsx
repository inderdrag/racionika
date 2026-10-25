import { useEffect, useRef, useState, type FormEvent } from 'react';
import { catalog, catalogCategories, searchCatalog } from '../../core/catalog';
import { formLabels, type CatalogProduct } from '../../core/catalog/types';
import {
  searchExternalFoods,
  loadExternalFood,
  type CatalogSearchResult,
} from '../../core/catalog/external';
import { db } from '../../core/db';
import { mealMetadata, mealTypes } from '../../core/diary';
import { scaleNutrients } from '../../core/nutrition/meal';
import { CatalogSource } from './CatalogSource';
export function FoodCatalogDialog({
  day,
  onClose,
  onSaved,
}: {
  day: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [form, setForm] = useState('');
  const [limit, setLimit] = useState(20);
  const [mode, setMode] = useState<'local' | 'external'>('local');
  const [external, setExternal] = useState<CatalogSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [grams, setGrams] = useState('100');
  const [mealType, setMealType] = useState('');
  const [labelConfirmed, setLabelConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => controller.current?.abort();
  }, []);
  const results = mode === 'local' ? searchCatalog(query, category, form) : external;
  const amount = Number(grams);
  const total =
    selected && Number.isFinite(amount) && amount > 0 && amount <= 5000
      ? scaleNutrients(selected.per100, amount)
      : null;
  function changeMode(next: 'local' | 'external') {
    controller.current?.abort();
    setBusy(false);
    setMode(next);
    setSelected(null);
    setError('');
    setLimit(20);
  }
  async function find(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSelected(null);
    setExternal([]);
    setSearched(false);
    setBusy(true);
    const current = new AbortController();
    controller.current?.abort();
    controller.current = current;
    try {
      const result = await searchExternalFoods(query, current.signal);
      if (!current.signal.aborted) {
        setExternal(result);
        setSearched(true);
      }
    } catch (error) {
      if (!current.signal.aborted)
        setError(error instanceof Error ? error.message : 'Не удалось выполнить поиск.');
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  async function pick(product: CatalogSearchResult) {
    setError('');
    setGrams('100');
    setLabelConfirmed(false);
    if (!('needsDetails' in product)) {
      setSelected(product);
      return;
    }
    const current = new AbortController();
    controller.current?.abort();
    controller.current = current;
    setBusy(true);
    try {
      const full = await loadExternalFood(product.source.id, current.signal);
      if (!current.signal.aborted) setSelected(full);
    } catch (error) {
      if (!current.signal.aborted)
        setError(error instanceof Error ? error.message : 'Не удалось открыть карточку.');
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!selected || !total || !mealTypes.some((item) => item.value === mealType)) {
      setError('Выберите приём пищи и массу от 1 до 5000 г.');
      return;
    }
    if (selected.source.provider === 'off' && !labelConfirmed) {
      setError('Проверьте данные на упаковке и подтвердите единицу: на 100 г.');
      return;
    }
    setBusy(true);
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
        mealType: mealTypes.find((item) => item.value === mealType)!.value,
        createdAt: new Date().toISOString(),
      });
      onSaved();
    } catch {
      setError('Не удалось сохранить продукт. Проверьте свободное место.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="catalog-dialog"
      aria-labelledby="catalog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="section-head">
        <h2 id="catalog-title">{selected ? 'Добавить продукт' : 'База продуктов'}</h2>
        <button className="close" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
      </div>
      {selected ? (
        <form onSubmit={(e) => void save(e)} className="catalog-selection">
          <label>
            Куда добавить
            <select
              value={mealType}
              required
              onChange={(e) => setMealType(e.target.value)}
              aria-label="Куда добавить"
            >
              <option value="" disabled>
                Выберите приём пищи
              </option>
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
          {selected.source.provider === 'off' && (
            <label className="consent">
              <input
                type="checkbox"
                checked={labelConfirmed}
                onChange={(e) => setLabelConfirmed(e.target.checked)}
              />
              <span>Сверил КБЖУ с упаковкой. Значения — на 100 г, не на 100 мл.</span>
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={busy || !total || (selected.source.provider === 'off' && !labelConfirmed)}
          >
            Добавить в дневник
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setSelected(null);
              setError('');
            }}
          >
            Вернуться к поиску
          </button>
        </form>
      ) : (
        <>
          <div className="catalog-tabs" role="group" aria-label="Справочник">
            <button
              aria-pressed={mode === 'local'}
              className={mode === 'local' ? 'primary' : 'secondary'}
              onClick={() => changeMode('local')}
            >
              На телефоне
            </button>
            <button
              aria-pressed={mode === 'external'}
              className={mode === 'external' ? 'primary' : 'secondary'}
              onClick={() => changeMode('external')}
            >
              В интернете
            </button>
          </div>
          <p className="subtle catalog-caption">
            {mode === 'local'
              ? `${catalog.length} продуктов и вариантов · USDA · без интернета`
              : 'Open Food Facts · данные пользователей. Сверьте с упаковкой.'}
          </p>
          <form onSubmit={mode === 'external' ? (e) => void find(e) : (e) => e.preventDefault()}>
            <label>
              {mode === 'local' ? 'Найти продукт' : 'Название или штрихкод'}
              <input
                aria-label="Поиск продуктов"
                type="search"
                maxLength={120}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(20);
                  if (mode === 'external') {
                    setExternal([]);
                    setSearched(false);
                  }
                }}
                placeholder="Например, рис или куриная грудка"
                disabled={busy}
              />
            </label>
            {mode === 'local' ? (
              <div className="catalog-filters">
                <label>
                  Категория
                  <select
                    aria-label="Категория"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setLimit(20);
                    }}
                  >
                    <option value="">Все продукты</option>
                    {catalogCategories.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Вид
                  <select
                    aria-label="Вид"
                    value={form}
                    onChange={(e) => {
                      setForm(e.target.value);
                      setLimit(20);
                    }}
                  >
                    <option value="">Любой</option>
                    {Object.entries(formLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <>
                <p className="subtle catalog-caption">
                  Поиск отправит только запрос напрямую в Open Food Facts.
                </p>
                <button className="primary" disabled={busy || query.trim().length < 2}>
                  {busy ? 'Ищем…' : 'Найти в интернете'}
                </button>
              </>
            )}
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="subtle catalog-count" role="status">
            {busy
              ? 'Загружаем данные…'
              : mode === 'local' || searched
                ? `Найдено: ${results.length}`
                : ''}
          </p>
          <ul className="catalog-results">
            {results.slice(0, limit).map((product) => (
              <li key={product.id}>
                <button className="catalog-pick" disabled={busy} onClick={() => void pick(product)}>
                  <strong>{product.name}</strong>
                  {'needsDetails' in product ? (
                    <span className="subtle">Open Food Facts · открыть полную карточку</span>
                  ) : (
                    <span className="subtle">
                      {Math.round(product.per100.kcal)} ккал · Б{' '}
                      {product.per100.protein.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}{' '}
                      · Ж {product.per100.fat.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}{' '}
                      · У{' '}
                      {product.per100.carbs.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}{' '}
                      на 100 г
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!results.length && (mode === 'local' || searched) && (
            <p className="subtle">
              Ничего не найдено{mode === 'external' ? ' с полными КБЖУ на 100 г' : ''}. Попробуйте
              другое название.
            </p>
          )}
          {results.length > limit && (
            <button className="secondary" onClick={() => setLimit((n) => n + 20)}>
              Показать ещё
            </button>
          )}
        </>
      )}
    </dialog>
  );
}
