import { useEffect, useRef, useState } from 'react';
import {
  AnalysisResponseSchema,
  type MealAnalysis,
  type PublicConfig,
  type Quality,
} from '@racionika/shared';
import { db, type FoodEntry } from '../../core/db';
import {
  analyzePhotos,
  analyzeText,
  getConfig,
  AiError,
  setAccessCode,
  serverLabel,
} from '../../core/ai/client';
import { compressPhoto, hashAnalysis } from '../../core/ai/images';
import {
  analysisTotals,
  normalizeAnalysis,
  aggregatePer100,
  roundedComponentCalories,
} from '../../core/nutrition/analysis';
import { getPlatform } from '../../core/platform';
interface Props {
  day: string;
  editing?: FoodEntry;
  onClose: () => void;
  onManual: () => void;
  onSaved: () => void;
}
export function AddFoodDialog({ day, editing, onClose, onManual, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<'text' | 'photo'>('text');
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [quality, setQuality] = useState<Quality>('fast');
  const [config, setConfig] = useState<PublicConfig>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [consent, setConsent] = useState(localStorage.getItem('racionika.aiConsent') === 'v1');
  const [access, setAccess] = useState('');
  const [result, setResult] = useState<MealAnalysis | undefined>(editing?.analysis);
  const [demo, setDemo] = useState(editing?.source === 'demo');
  const [baseGrams, setBaseGrams] = useState(editing?.baseGrams ?? editing?.grams ?? 0);
  const [level] = useState(
    editing?.additionsLevel ??
      (localStorage.getItem('racionika.autoAdditions') === 'false' ? 0 : 1),
  );
  useEffect(() => {
    dialog.current?.showModal();
    let alive = true;
    const warmup = new AbortController();
    if (!editing?.analysis) {
      void getConfig(warmup.signal)
        .then((value) => {
          if (alive) setConfig(value);
        })
        .catch(() => {
          if (alive)
            setError(
              'Нет связи с сервером ИИ. Сервер может просыпаться. Попробуйте позже; ручной ввод доступен.',
            );
        });
    }
    return () => {
      alive = false;
      warmup.abort();
      controller.current?.abort();
    };
  }, [editing?.analysis]);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(timer);
  }, [busy]);
  function rememberConsent(value: boolean) {
    setConsent(value);
    if (value) localStorage.setItem('racionika.aiConsent', 'v1');
    else localStorage.removeItem('racionika.aiConsent');
  }
  function fail(error: unknown) {
    setError(
      error instanceof Error
        ? error.message
        : 'Не удалось выполнить действие. Попробуйте ручной ввод.',
    );
  }
  async function addSources(sources: string[]) {
    setError('');
    try {
      if (photos.length + sources.length > 3) throw new Error('Можно добавить до трёх фотографий.');
      const processed = await Promise.all(sources.map((source) => compressPhoto(source, 1280)));
      setPhotos((current) =>
        [...current, ...processed.map((data) => `data:image/jpeg;base64,${data}`)].slice(0, 3),
      );
    } catch (error) {
      fail(error);
    }
  }
  async function selectFiles(files: FileList | null) {
    if (!files) return;
    try {
      const selected = Array.from(files);
      if (selected.some((file) => file.size > 12 * 1024 * 1024))
        throw new Error('Исходное фото должно быть меньше 12 МБ.');
      const sources = await Promise.all(
        selected.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error('Не удалось прочитать фото.'));
              reader.readAsDataURL(file);
            }),
        ),
      );
      await addSources(sources);
    } catch (error) {
      fail(error);
    }
  }
  async function analyze() {
    setError('');
    if (!consent) {
      setError('Сначала подтвердите отправку данных на сервер и провайдеру ИИ.');
      return;
    }
    if (config?.mode === 'disabled') {
      setError(
        'На сервере не задан ключ ИИ. Для проверки без ключа запустите npm run dev:demo; для реального анализа смотрите docs/DEV.md.',
      );
      return;
    }
    if (mode === 'text' && text.trim().length < 2) {
      setError('Опишите блюдо или продукты.');
      return;
    }
    if (mode === 'photo' && !photos.length) {
      setError('Добавьте фотографию еды.');
      return;
    }
    const current = new AbortController();
    controller.current = current;
    setSlow(false);
    setBusy(true);
    try {
      setAccessCode(access);
      const contextHint = hint.slice(0, 500);
      const images =
        mode === 'photo'
          ? await Promise.all(
              photos.map(async (source) => ({
                mimeType: 'image/jpeg' as const,
                data: await compressPhoto(source, quality === 'fast' ? 768 : 1280),
              })),
            )
          : [];
      current.signal.throwIfAborted();
      const requestText = text;
      const hash = await hashAnalysis({
        version: 2,
        provider: config?.provider,
        mode: config?.mode,
        kind: mode,
        text: mode === 'text' ? requestText : undefined,
        images,
        hint: contextHint,
        quality,
      });
      const cached = await db.aiCache.get(hash);
      let response: ReturnType<typeof AnalysisResponseSchema.parse>;
      let wasCached = false;
      if (cached && Date.now() - cached.createdAt < 86400000) {
        const checked = AnalysisResponseSchema.safeParse(cached.response);
        if (checked.success) {
          response = checked.data;
          wasCached = true;
        } else
          response =
            mode === 'photo'
              ? await analyzePhotos(images, contextHint, quality, current.signal)
              : await analyzeText(requestText, contextHint, quality, current.signal);
      } else
        response =
          mode === 'photo'
            ? await analyzePhotos(images, contextHint, quality, current.signal)
            : await analyzeText(requestText, contextHint, quality, current.signal);
      current.signal.throwIfAborted();
      const normalized = normalizeAnalysis(response.analysis);
      setResult(normalized);
      setBaseGrams(normalized.ingredients.reduce((sum, item) => sum + item.grams, 0));
      setDemo(response.demo);
      // В кеше только оценка, не изображения; максимум 50 ответов, срок 24 часа.
      if (!wasCached)
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
      setBusy(false);
    }
  }
  async function save() {
    if (!result?.ingredients.length) return;
    try {
      const analysis = normalizeAnalysis(result);
      const total = aggregatePer100(analysis, level, baseGrams);
      if (total.grams <= 0) throw new Error('Укажите массу хотя бы одного ингредиента.');
      await db.foodEntries.put({
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
      });
      onSaved();
    } catch (error) {
      fail(error);
    }
  }
  const totals = result ? analysisTotals(result, level, baseGrams) : undefined;
  const componentCalories = totals ? roundedComponentCalories(totals.components) : [];
  const displayGrams = (value: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
  return (
    <dialog
      ref={dialog}
      className="analysis-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="analysis-title"
    >
      <div className="section-head">
        <h2 id="analysis-title">{result ? 'Разбор блюда' : 'Добавить еду'}</h2>
        <button className="close" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
      </div>
      {!result && (
        <p className="subtle">
          Фото или описание → ингредиенты → КБЖУ. Значения вручную вводить не нужно.
        </p>
      )}
      {(!result || demo) && (
        <div
          className={`ai-mode ${config?.mode === 'demo' || demo ? 'demo-mode' : ''}`}
          role="status"
        >
          {config?.mode === 'demo' || demo
            ? 'ДЕМО: фиксированный пример, без распознавания'
            : config?.mode === 'real'
              ? 'ИИ подключён · оценка, не точное измерение'
              : config?.mode === 'disabled'
                ? 'ИИ не настроен на сервере'
                : 'Проверяем сервер…'}
        </div>
      )}
      {!result && (
        <>
          <div className="segmented">
            <button aria-pressed={mode === 'text'} disabled={busy} onClick={() => setMode('text')}>
              Описать еду
            </button>
            <button
              aria-pressed={mode === 'photo'}
              disabled={busy}
              onClick={() => setMode('photo')}
            >
              По фото
            </button>
          </div>
          {mode === 'text' ? (
            <label className="field">
              Что вы съели?
              <textarea
                maxLength={2000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Например: 2 яйца, тост с маслом, кофе с молоком"
                rows={3}
              />
            </label>
          ) : (
            <div className="photo-upload">
              <label className="secondary file-picker">
                Выбрать фото
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => {
                    void selectFiles(e.target.files);
                    e.target.value = '';
                  }}
                  disabled={busy || photos.length >= 3}
                />
              </label>
              <button
                className="secondary"
                disabled={busy || photos.length >= 3}
                onClick={() => void awaitCamera()}
              >
                Камера / галерея
              </button>
              <p className="subtle">
                До 3 фото одного блюда. Перед отправкой удаляем EXIF и сжимаем JPEG.
              </p>
              <div className="photo-grid">
                {photos.map((source, index) => (
                  <figure key={index}>
                    <img src={source} alt={`Фото блюда ${index + 1}`} />
                    <button
                      aria-label={`Удалить фото ${index + 1}`}
                      onClick={() => setPhotos(photos.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {result && (
        <>
          {demo && <p className="subtle">ДЕМО: эта запись не описывает вашу реальную еду.</p>}
          {!result.is_food ? (
            <>
              <p className="error">
                На изображении не распознана еда. Попробуйте другое фото или текстовое описание.
              </p>
              <button className="secondary" onClick={() => setResult(undefined)}>
                Попробовать снова
              </button>
            </>
          ) : (
            <>
              <div className="meal-name">{result.dish_name}</div>
              <div className="ingredient-list" aria-label="Состав блюда">
                {totals?.components.map((item, index) => (
                  <section className="ingredient" key={index}>
                    <h3 className="ingredient-title">{item.name}</h3>
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
                              type="number"
                              min={0}
                              max={5000}
                              step="0.1"
                              value={Math.round(item.grams * 10) / 10}
                              onChange={(e) => changeComponentGrams(index, Number(e.target.value))}
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
                      totals?.sauceUnknown ? 'Известная масса без массы соуса' : 'Общая масса блюда'
                    }
                  >
                    {totals?.sauceUnknown ? '≥ ' : ''}
                    {displayGrams(totals?.mealGrams ?? 0)} <small>г</small>
                  </strong>
                </div>
              </div>
            </>
          )}
        </>
      )}
      {!result && (
        <>
          <label className="field">
            Подсказка для ИИ (необязательно)
            <input
              value={hint}
              maxLength={500}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Например: порция 400 г, без масла"
            />
          </label>
          <label className="field">
            Качество
            <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
              <option value="fast">Экономно</option>
              <option value="accurate">Точно — всё равно приблизительная оценка</option>
            </select>
          </label>
          {(config?.access_code_required || error.includes('код доступа')) && (
            <label className="field">
              Код доступа к серверу
              <input
                type="password"
                value={access}
                onChange={(e) => setAccess(e.target.value)}
                autoComplete="off"
                maxLength={128}
              />
            </label>
          )}
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => rememberConsent(e.target.checked)}
            />
            <span>
              Разрешаю отправить описание и выбранные фото на {serverLabel} и далее провайдеру ИИ.
              Сервер приложения их не сохраняет; обработка провайдером — по его политике. Отозвать
              согласие можно в профиле.
            </span>
          </label>
        </>
      )}
      {busy ? (
        <div className="analysis-busy" role="status">
          <span className="spinner" />
          <p>
            {slow
              ? 'Запрос ещё выполняется. Бесплатный сервер может просыпаться до минуты.'
              : 'ИИ анализирует…'}
          </p>
          <button
            className="secondary"
            onClick={() => {
              controller.current?.abort();
            }}
          >
            Отменить запрос
          </button>
        </div>
      ) : !result ? (
        <button className="primary" onClick={() => void analyze()}>
          Определить КБЖУ
        </button>
      ) : result.is_food ? (
        <button
          className="primary save-analysis"
          disabled={
            !result.ingredients.length || !result.dish_name.trim() || (totals?.mealGrams ?? 0) <= 0
          }
          onClick={() => void save()}
        >
          {demo ? 'Сохранить демозапись' : 'Сохранить блюдо'}
        </button>
      ) : null}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result && (
        <div className="dialog-footer">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setResult(undefined);
              setPhotos([]);
              setError('');
              setText('');
            }}
          >
            Новое блюдо
          </button>
          <button className="text-button" disabled={busy} onClick={onManual}>
            Внести КБЖУ вручную
          </button>
        </div>
      )}
    </dialog>
  );
  async function awaitCamera() {
    try {
      const source = await (await getPlatform()).camera.pick();
      if (source) await addSources([source]);
    } catch (error) {
      fail(error);
    }
  }
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
        i === index ? { ...item, grams: Math.min(5000, Math.max(0, grams)) } : item,
      ),
    });
  }
}
