import { useEffect, useRef, useState } from 'react';
import {
  AnalysisResponseSchema,
  type AnalysisResponse,
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
  lookupFood,
  setAccessCode,
  serverLabel,
} from '../../core/ai/client';
import { compressPhoto, hashAnalysis } from '../../core/ai/images';
import { analysisTotals, normalizeAnalysis, aggregatePer100 } from '../../core/nutrition/analysis';
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
  const [level, setLevel] = useState(
    editing?.additionsLevel ??
      (localStorage.getItem('racionika.autoAdditions') === 'false' ? 0 : 1),
  );
  const [fromCache, setFromCache] = useState(false);
  const [lookupName, setLookupName] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [daily, setDaily] = useState<AnalysisResponse['daily']>();
  useEffect(() => {
    dialog.current?.showModal();
    let alive = true;
    const warmup = new AbortController();
    void getConfig(warmup.signal)
      .then((value) => {
        if (alive) setConfig(value);
      })
      .catch(() => {
        if (alive)
          setError(
            'Нет связи с сервером ИИ. Проверьте npm run dev и настройки сервера. Ручной ввод доступен.',
          );
      });
    return () => {
      alive = false;
      warmup.abort();
      controller.current?.abort();
    };
  }, []);
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
  async function analyze(refine = false) {
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
    if (mode === 'text' && text.trim().length < 2 && !refine) {
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
      const contextHint = [
        hint,
        ...Object.entries(answers).map(([question, answer]) => `${question}: ${answer}`),
      ]
        .join('\n')
        .slice(0, 500);
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
      const requestText =
        refine && !text ? `Блюдо: ${result?.dish_name ?? ''}. Уточнение: ${contextHint}` : text;
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
      let response: AnalysisResponse;
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
      setDaily(response.daily);
      setFromCache(wasCached);
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
  async function addIngredient() {
    if (!lookupName.trim() || !result) return;
    if (!consent) {
      setError('Для поиска через ИИ подтвердите отправку данных.');
      return;
    }
    setSlow(false);
    setBusy(true);
    setError('');
    const current = new AbortController();
    controller.current = current;
    try {
      setAccessCode(access);
      const response = await lookupFood(lookupName, current.signal);
      current.signal.throwIfAborted();
      const food = response.food;
      const item = {
        name: food.name,
        grams: food.typical_grams,
        grams_range: [food.typical_grams, food.typical_grams] as [number, number],
        per_100g: food.per_100g,
        confidence: 0.5,
      };
      setResult(
        normalizeAnalysis({
          ...result,
          ingredients: [...result.ingredients, item],
          warnings: [...result.warnings, food.warning].slice(-10),
        }),
      );
      setDemo(demo || response.demo);
      setDaily(response.daily);
      setLookupName('');
    } catch (error) {
      if (!current.signal.aborted) fail(error);
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
      <p className="subtle">
        Фото или описание → ингредиенты → КБЖУ. Значения вручную вводить не нужно.
      </p>
      <div
        className={`ai-mode ${config?.mode === 'demo' || demo ? 'demo-mode' : ''}`}
        role="status"
      >
        {config?.mode === 'demo'
          ? 'ДЕМО: фиксированный пример, без распознавания'
          : config?.mode === 'real'
            ? 'ИИ подключён · оценка, не точное измерение'
            : config?.mode === 'disabled'
              ? 'ИИ не настроен на сервере'
              : 'Проверяем сервер…'}
      </div>
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
          <div className="result-summary">
            <label className="field">
              Блюдо
              <input
                value={result.dish_name}
                maxLength={160}
                onChange={(e) => setResult({ ...result, dish_name: e.target.value })}
              />
            </label>
            <strong className="result-kcal">
              {Math.round(totals?.nutrients.kcal ?? 0)} <small>ккал</small>
            </strong>
            <p>
              Б {Math.round(totals?.nutrients.protein ?? 0)} г · Ж{' '}
              {Math.round(totals?.nutrients.fat ?? 0)} г · У{' '}
              {Math.round(totals?.nutrients.carbs ?? 0)} г
            </p>
            <p className="subtle">
              {demo
                ? 'ДЕМО: эта запись не описывает вашу реальную еду.'
                : fromCache
                  ? 'Предыдущая оценка из локального кеша.'
                  : 'Оценка ИИ. Проверьте состав и размер порции.'}
            </p>
          </div>
          {!result.is_food ? (
            <p className="error">
              На изображении не распознана еда. Попробуйте другое фото или текстовое описание.
            </p>
          ) : (
            <>
              <div className="ingredient-list">
                {result.ingredients.map((item, index) => (
                  <section className="ingredient" key={index}>
                    <div className="section-head">
                      <label className="ingredient-name">
                        <span className="sr-only">Название ингредиента {index + 1}</span>
                        <input
                          value={item.name}
                          maxLength={160}
                          readOnly
                          title="Для замены продукта удалите его и найдите новый ингредиент"
                        />
                      </label>
                      <button
                        className="delete"
                        aria-label={`Удалить ингредиент ${index + 1}`}
                        onClick={() =>
                          setResult({
                            ...result,
                            ingredients: result.ingredients.filter((_, i) => i !== index),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                    <div className="ingredient-mass">
                      <button
                        aria-label={`Уменьшить массу ${index + 1}`}
                        onClick={() => changeGrams(index, item.grams - 10)}
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
                          value={item.grams}
                          onChange={(e) => changeGrams(index, Number(e.target.value))}
                        />
                      </label>
                      <button
                        aria-label={`Увеличить массу ${index + 1}`}
                        onClick={() => changeGrams(index, item.grams + 10)}
                      >
                        +
                      </button>
                      <strong>
                        {Math.round((item.per_100g.kcal * item.grams) / 100)} <small>ккал</small>
                      </strong>
                    </div>
                    <p className="subtle">
                      {item.confidence >= 0.8
                        ? 'Уверенность в составе: высокая'
                        : item.confidence >= 0.5
                          ? 'Уверенность в составе: средняя'
                          : 'Уверенность в составе: низкая'}{' '}
                      · Масса по фото приблизительна
                      {item.grams_range[0] !== item.grams_range[1]
                        ? ` (${item.grams_range.join('–')} г)`
                        : ''}
                    </p>
                  </section>
                ))}
              </div>
              <div className="additions">
                <p>
                  <b>Масло, соль, специи (авто): +{Math.round(totals?.additionsKcal ?? 0)} ккал</b>
                </p>
                <label className="field">
                  Уровень автодобавок
                  <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                    <option value={0}>Нет</option>
                    <option value={0.5}>Мало</option>
                    <option value={1}>Норма</option>
                    <option value={1.5}>Много</option>
                  </select>
                </label>
                {totals?.sauceUnknown && (
                  <p className="subtle">
                    Калории соуса включены, но его БЖУ неизвестны. Для точного учёта отключите
                    автодобавки и внесите соус по этикетке отдельным ингредиентом.
                  </p>
                )}
              </div>
              <div className="ingredient-search">
                <label className="field">
                  Добавить ингредиент
                  <input
                    value={lookupName}
                    onChange={(e) => setLookupName(e.target.value)}
                    maxLength={160}
                    placeholder="Название, вид, бренд"
                  />
                </label>
                <button
                  className="secondary"
                  disabled={busy || !lookupName.trim() || result.ingredients.length >= 30}
                  onClick={() => void addIngredient()}
                >
                  Найти КБЖУ через ИИ
                </button>
              </div>
              {result.clarifying_questions.map((question) => (
                <fieldset className="clarification" key={question.question}>
                  <legend>{question.question}</legend>
                  <div className="chips">
                    {question.options.map((option) => (
                      <button
                        key={option}
                        aria-pressed={answers[question.question] === option}
                        onClick={() => setAnswers({ ...answers, [question.question]: option })}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </>
          )}
          {result.warnings.map((warning, index) => (
            <p className="warning" key={index}>
              {warning}
            </p>
          ))}
        </>
      )}
      <label className="field">
        {result ? 'Уточнение состава' : 'Подсказка для ИИ (необязательно)'}
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
      ) : (
        <>
          <button className="primary" onClick={() => void analyze(Boolean(result))}>
            {result ? 'Уточнить у ИИ (новый запрос)' : 'Определить КБЖУ'}
          </button>
          {result?.is_food && (
            <button
              className="primary save-analysis"
              disabled={!result.ingredients.length || !result.dish_name.trim()}
              onClick={() => void save()}
            >
              {demo ? 'Сохранить демозапись' : 'Сохранить блюдо'}
            </button>
          )}
        </>
      )}
      {daily && (
        <p className="subtle usage-note">
          Разборы: {daily.analyses} / {daily.analysis_limit} сегодня (UTC).
          {fromCache ? ' Кеш не расходует запрос.' : ''}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-footer">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setResult(undefined);
            setPhotos([]);
            setAnswers({});
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
