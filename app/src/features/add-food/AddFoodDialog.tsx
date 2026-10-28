import { useDialogFocus } from '../../shared/ui/useDialogFocus';
import { loadPreferences } from '../../core/preferences';
import { mealMetadata, mealTypes } from '../../core/diary';
import { hasAiConsent } from '../../core/profile';
import { useEffect, useId, useRef, useState } from 'react';
import {
  AnalysisResponseSchema,
  RECOGNITION_REVISION,
  reviewMealComposition,
  type MealAnalysis,
} from '@racionika/shared';
import { db, type FoodEntry, type MealType } from '../../core/db';
import { analyzePhotos, getConfig, AiError } from '../../core/ai/client';
import { compressPhoto, hashAnalysis } from '../../core/ai/images';
import {
  analysisTotals,
  normalizeAnalysis,
  withoutAutomaticAdditions,
  aggregatePer100,
  roundedComponentCalories,
} from '../../core/nutrition/analysis';
import { getPlatform } from '../../core/platform';
import { useFavorites } from '../../core/favorites';
import { ingredientEntry } from '../../core/meal-composer';
import { FavoriteHeart } from '../../shared/ui/FavoriteHeart';
import { MealComposer } from './MealComposer';
import { ProductPicker } from './ProductPicker';
interface Props {
  day: string;
  editing?: FoodEntry;
  onPick?: (entry: FoodEntry, keepOpen?: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}
export function AddFoodDialog({ day, editing, onClose, onSaved, onPick }: Props) {
  const titleId = useId();
  const favorites = useFavorites();
  const [composing, setComposing] = useState<FoodEntry>();
  const dialog = useRef<HTMLDialogElement>(null);
  useDialogFocus(dialog);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true),
    inFlight = useRef(false),
    photo = useRef<string>();
  const [hint, setHint] = useState('');
  const [quality] = useState(() => loadPreferences().quality);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false),
    [slow, setSlow] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [result, setResult] = useState<MealAnalysis | undefined>(editing?.analysis);
  const [demo, setDemo] = useState(editing?.source === 'demo');
  const [baseGrams, setBaseGrams] = useState(editing?.baseGrams ?? editing?.grams ?? 0);
  const level = 0;
  const [mealType, setMealType] = useState<MealType | ''>(editing?.mealType ?? '');
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    if (!editing) dialog.current?.querySelector<HTMLInputElement>('input[type=search]')?.focus();
    return () => {
      mounted.current = false;
      controller.current?.abort();
      photo.current = undefined;
    };
  }, [editing]);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(timer);
  }, [busy]);
  function fail(error: unknown) {
    if (mounted.current)
      setError(error instanceof Error ? error.message : 'Не удалось выполнить действие.');
  }
  async function analyze(takePhoto = false) {
    if (inFlight.current) return;
    if (!hasAiConsent()) {
      setError('Разрешите ИИ в Профиле → Разрешения приложения.');
      return;
    }
    const current = new AbortController();
    controller.current = current;
    inFlight.current = true;
    setBusy(true);
    setSlow(false);
    setError('');
    try {
      if (takePhoto) {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        const source = await (await getPlatform()).camera.capture(current.signal);
        current.signal.throwIfAborted();
        if (!source) return;
        photo.current = source;
      }
      if (!photo.current) return;
      const config = await getConfig(current.signal);
      current.signal.throwIfAborted();
      if (config.mode === 'disabled') throw new Error('Распознавание временно недоступно.');
      const images = [
        {
          mimeType: 'image/jpeg' as const,
          data: await compressPhoto(photo.current, quality === 'fast' ? 1280 : 1600),
        },
      ];
      current.signal.throwIfAborted();
      const contextHint = hint.slice(0, 500);
      const hash = await hashAnalysis({
        version: RECOGNITION_REVISION,
        provider: config.provider,
        mode: config.mode,
        kind: 'photo',
        images,
        hint: contextHint,
        quality,
      });
      const cached = await db.aiCache.get(hash);
      const checked =
        cached && Date.now() - cached.createdAt < 86400000
          ? AnalysisResponseSchema.safeParse(cached.response)
          : undefined;
      current.signal.throwIfAborted();
      const response = checked?.success
        ? checked.data
        : await analyzePhotos(images, contextHint, quality, current.signal);
      current.signal.throwIfAborted();
      const normalized = normalizeAnalysis(response.analysis);
      setResult(normalized);
      setBaseGrams(normalized.ingredients.reduce((sum, item) => sum + item.grams, 0));
      setDemo(response.demo);
      if (!checked?.success)
        await db.aiCache.put({
          hash,
          createdAt: Date.now(),
          response: { ...response, analysis: normalized },
        });
      const old = await db.aiCache.orderBy('createdAt').toArray();
      await db.aiCache.bulkDelete(
        old
          .filter(
            (item, index) => Date.now() - item.createdAt >= 86400000 || index < old.length - 50,
          )
          .map((item) => item.hash),
      );
    } catch (error) {
      if (!(error instanceof AiError && error.code === 'cancelled') && !current.signal.aborted)
        fail(error);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function draftEntry(): FoodEntry {
    if (!result?.ingredients.length) throw new Error('Добавьте продукт.');
    const analysis = withoutAutomaticAdditions(result);
    const total = aggregatePer100(analysis, level, baseGrams);
    if (total.grams < 1 || total.grams > 5000) throw new Error('Масса: от 1 до 5000 г.');
    return {
      ...mealMetadata(editing),
      mealType: mealType || undefined,
      id: editing?.id ?? crypto.randomUUID(),
      day,
      name: analysis.dish_name,
      grams: total.grams,
      per100: total.per100,
      analysis,
      baseGrams,
      additionsLevel: level,
      source: demo ? 'demo' : 'ai',
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
  }
  let favoriteDraft: FoodEntry | undefined;
  try {
    favoriteDraft = draftEntry();
  } catch {
    /* Empty result. */
  }
  async function save() {
    if (inFlight.current) return;
    if (!onPick && !mealType) {
      setError('Выберите, куда добавить блюдо.');
      return;
    }
    const issues = result ? reviewMealComposition(result) : [];
    if (issues.length) {
      setError(issues[0].message);
      return;
    }
    inFlight.current = true;
    try {
      const entry = draftEntry();
      if (onPick) {
        onPick(entry);
        return;
      }
      await db.foodEntries.put(entry);
      onSaved();
    } catch (error) {
      fail(error);
    } finally {
      inFlight.current = false;
    }
  }
  const totals = result ? analysisTotals(result, level, baseGrams) : undefined;
  const reviewIssues = result ? reviewMealComposition(result) : [];
  const componentCalories = totals ? roundedComponentCalories(totals.components) : [];
  const displayGrams = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
  return (
    <>
      <dialog
        ref={dialog}
        className="analysis-dialog product-dialog"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <div className="section-head">
          <h2 id={titleId}>{result ? 'Разбор блюда' : 'Добавить продукт'}</h2>
          <button className="close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        {!result && (
          <ProductPicker
            day={day}
            busy={busy}
            onCamera={() => void analyze(true)}
            onSaved={onSaved}
            onPick={onPick}
            onCompose={onPick ? undefined : setComposing}
          />
        )}
        {result && demo && (
          <p className="ai-mode demo-mode" role="status">
            ДЕМО: фиксированный пример, без распознавания
          </p>
        )}
        {result && (
          <>
            {demo && <p className="subtle">ДЕМО: эта запись не описывает вашу реальную еду.</p>}
            {!result.is_food ? (
              <>
                <p className="error" role="alert">
                  На фото не распознана еда. Сделайте другой снимок.
                </p>
                <button className="secondary" onClick={() => setResult(undefined)}>
                  Попробовать снова
                </button>
              </>
            ) : (
              <>
                {!onPick && (
                  <label className="field result-category">
                    Куда добавить
                    <select
                      aria-label="Приём пищи для блюда"
                      value={mealType}
                      onChange={(event) => {
                        setMealType(event.target.value as MealType | '');
                        setError('');
                      }}
                    >
                      <option value="">Выберите категорию</option>
                      {mealTypes.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="favorite-title">
                  <div className="meal-name">{result.dish_name}</div>
                  {favoriteDraft && (
                    <FavoriteHeart
                      entry={favoriteDraft}
                      favorites={favorites.items}
                      disabled={busy}
                    />
                  )}
                </div>
                <div className="ingredient-list" aria-label="Состав блюда">
                  {totals?.components.map((item, index) => (
                    <section className="ingredient" key={index}>
                      <div className="ingredient-head">
                        <h3 className="ingredient-title">{item.name}</h3>
                        {item.ingredientIndex !== undefined && (
                          <FavoriteHeart
                            entry={ingredientEntry(
                              result.ingredients[item.ingredientIndex],
                              demo ? 'demo' : 'ai',
                            )}
                            favorites={favorites.items}
                            disabled={busy}
                          />
                        )}
                        {item.ingredientIndex !== undefined && (
                          <button
                            className="remove-ingredient"
                            aria-label={`Удалить продукт ${index + 1}`}
                            disabled={busy}
                            onClick={() => {
                              const ingredientIndex = item.ingredientIndex;
                              setResult({
                                ...result,
                                ingredients: result.ingredients.filter(
                                  (_, i) => i !== ingredientIndex,
                                ),
                              });
                              setError('');
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <div className="ingredient-mass">
                        {item.grams !== null ? (
                          <>
                            <button
                              aria-label={`Уменьшить массу ${index + 1}`}
                              onClick={() => changeComponentGrams(index, (item.grams ?? 0) - 10)}
                            >
                              −
                            </button>
                            <label>
                              Масса, г
                              <input
                                aria-label={`Масса ингредиента ${index + 1}`}
                                inputMode="decimal"
                                type="number"
                                min={0}
                                max={5000}
                                step="0.1"
                                value={Math.round(item.grams * 10) / 10}
                                onChange={(e) =>
                                  changeComponentGrams(index, Number(e.target.value))
                                }
                              />
                            </label>
                            <button
                              aria-label={`Увеличить массу ${index + 1}`}
                              onClick={() => changeComponentGrams(index, (item.grams ?? 0) + 10)}
                            >
                              +
                            </button>
                          </>
                        ) : (
                          <span className="unknown-mass" aria-label="Масса соуса неизвестна">
                            — г
                          </span>
                        )}
                        <strong className="component-kcal">
                          {componentCalories[index]} <small>ккал</small>
                        </strong>
                      </div>
                    </section>
                  ))}
                </div>
                <div className="result-summary" aria-label="Итого блюдо" aria-live="polite">
                  <span>Итого</span>
                  <div className="meal-total-values">
                    <strong className="result-kcal">
                      {Math.round(totals?.nutrients.kcal ?? 0)} <small>ккал</small>
                    </strong>
                    <strong
                      className="result-grams"
                      aria-label={
                        totals?.sauceUnknown
                          ? 'Известная масса без массы соуса'
                          : 'Общая масса блюда'
                      }
                    >
                      {totals?.sauceUnknown ? '≥ ' : ''}
                      {displayGrams(totals?.mealGrams ?? 0)} <small>г</small>
                    </strong>
                  </div>
                </div>
                {reviewIssues.length > 0 && (
                  <p className="error" role="alert">
                    {reviewIssues[0].message}
                  </p>
                )}
                <details
                  className="analysis-check"
                  onToggle={(event) => setReviewOpen(event.currentTarget.open)}
                >
                  <summary>
                    {result.warnings.some((w) => w.includes('Ккал отличаются'))
                      ? 'Проверить КБЖУ и состав'
                      : 'Уточнить состав'}
                  </summary>
                  {reviewOpen && (
                    <div>
                      {result.warnings.map((warning, i) => (
                        <p key={`warning-${i}`}>{warning}</p>
                      ))}
                      {result.clarifying_questions.map((item, i) => (
                        <p key={`question-${i}`}>{item.question}</p>
                      ))}
                      {!editing && (
                        <>
                          <label>
                            Уточнение
                            <input
                              value={hint}
                              maxLength={500}
                              placeholder="Например: рис 150 г готового, соуса нет"
                              onChange={(e) => setHint(e.target.value)}
                              disabled={busy}
                            />
                          </label>
                          <p>Новый запрос к ИИ. Массу по фото лучше сверить на весах.</p>
                          <button
                            className="secondary"
                            disabled={busy || !hint.trim()}
                            onClick={() => void analyze()}
                          >
                            Повторить разбор
                          </button>
                        </>
                      )}
                      {editing &&
                        !result.warnings.length &&
                        !result.clarifying_questions.length && (
                          <p>Исправьте массу выше или удалите лишний продукт.</p>
                        )}
                    </div>
                  )}
                </details>
              </>
            )}
          </>
        )}
        {!onPick && favoriteDraft && !busy && (
          <button type="button" className="secondary" onClick={() => setComposing(draftEntry())}>
            ＋ Добавить продукт
          </button>
        )}
        {busy ? (
          <div className="analysis-busy" role="status">
            <span className="spinner" />
            <p>{slow ? 'Распознавание ещё выполняется…' : 'Распознаём фото…'}</p>
            <button className="secondary" onClick={() => controller.current?.abort()}>
              Отменить запрос
            </button>
          </div>
        ) : result?.is_food ? (
          <button
            className="primary save-analysis"
            disabled={
              reviewIssues.length > 0 ||
              !result.ingredients.length ||
              !result.dish_name.trim() ||
              (totals?.mealGrams ?? 0) <= 0
            }
            onClick={() => void save()}
          >
            {demo
              ? onPick
                ? 'Добавить демопродукт'
                : 'Сохранить демозапись'
              : onPick
                ? 'Добавить продукт'
                : 'Сохранить блюдо'}
          </button>
        ) : null}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </dialog>
      {composing && (
        <MealComposer
          entry={composing}
          day={day}
          editing={!!editing}
          initialCategory={composing.mealType}
          onClose={() => setComposing(undefined)}
          onSaved={onSaved}
          renderPicker={(pick, close) => (
            <AddFoodDialog day={day} onPick={pick} onClose={close} onSaved={close} />
          )}
        />
      )}
    </>
  );
  function changeComponentGrams(index: number, grams: number) {
    const item = totals?.components[index];
    if (!result || !item || !Number.isFinite(grams)) return;
    if (item.ingredientIndex !== undefined) {
      changeGrams(item.ingredientIndex, grams);
    } else if (item.additionKey && totals && totals.multiplier > 0) {
      const max = item.additionKey === 'salt_g' ? 20 : 100;
      setResult({
        ...result,
        hidden_additions: {
          ...result.hidden_additions,
          [item.additionKey]: Math.min(max, Math.max(0, grams / totals.multiplier)),
        },
      });
    }
  }
  function changeGrams(index: number, grams: number) {
    if (!result || !Number.isFinite(grams)) return;
    setResult({
      ...result,
      ingredients: result.ingredients.map((item, i) =>
        i === index
          ? {
              ...item,
              grams: Math.min(5000, Math.max(0, grams)),
              grams_range: [Math.min(5000, Math.max(0, grams)), Math.min(5000, Math.max(0, grams))],
            }
          : item,
      ),
    });
  }
}
