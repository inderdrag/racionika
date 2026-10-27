import { useState } from 'react';
import { localDay } from '../core/db';
import { exportCsv, type ReportType } from '../core/csv';
import { getPlatform } from '../core/platform';
import { savePreferences, usePreferences } from '../core/preferences';
import notices from '../data/licenses.json';
export function SettingsExtras() {
  const preferences = usePreferences();
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<ReportType>('days');
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return localDay(date);
  });
  const [to, setTo] = useState(localDay());
  function patch(value: Partial<typeof preferences>) {
    try {
      savePreferences({ ...preferences, ...value });
      setNotice('');
    } catch {
      setNotice('Не удалось сохранить настройки.');
    }
  }
  return (
    <>
      <section className="card profile-card" aria-label="Единицы и качество ИИ">
        <h2>Единицы и ИИ</h2>
        <div className="form-grid">
          <label className="field">
            Единицы веса
            <select
              value={preferences.weightUnit}
              onChange={(e) => patch({ weightUnit: e.target.value as 'kg' | 'lb' })}
            >
              <option value="kg">Килограммы</option>
              <option value="lb">Фунты</option>
            </select>
          </label>
          <label className="field">
            Единицы воды
            <select
              value={preferences.waterUnit}
              onChange={(e) => patch({ waterUnit: e.target.value as 'ml' | 'l' })}
            >
              <option value="ml">Миллилитры</option>
              <option value="l">Литры</option>
            </select>
          </label>
        </div>
        <label className="field">
          Качество распознавания по умолчанию
          <select
            value={preferences.quality}
            onChange={(e) => patch({ quality: e.target.value as 'fast' | 'accurate' })}
          >
            <option value="fast">Экономно</option>
            <option value="accurate">Точнее</option>
          </select>
        </label>
        <p className="subtle">
          «Точнее» использует модель, настроенную на сервере; расход и результат зависят от модели.
        </p>
        <p className="subtle">
          Порции — в граммах, энергия — в ккал. Темп изменения веса — в кг за неделю.
        </p>
      </section>
      <section className="card profile-card">
        <h2>CSV-отчёты</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setNotice('');
            void (async () => {
              try {
                const text = await exportCsv(type, from, to);
                await (
                  await getPlatform()
                ).share.text(`racionika-${type}-${from}-${to}.csv`, text, 'text/csv;charset=utf-8');
              } catch (error) {
                setNotice(error instanceof Error ? error.message : 'Не удалось сохранить отчёт.');
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          <label className="field">
            Вид отчёта
            <select value={type} onChange={(e) => setType(e.target.value as ReportType)}>
              <option value="days">Итоги по дням</option>
              <option value="meals">Приёмы пищи и заметки</option>
              <option value="weights">История веса</option>
            </select>
          </label>
          <div className="form-grid">
            <label className="field">
              С даты
              <input
                type="date"
                required
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="field">
              По дату
              <input
                type="date"
                required
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <p className="subtle">
            Для Excel: UTF-8, разделитель «;». Единицы в файле: кг, мл, ккал, г. Пропуски пустые.
            CSV — отчёт, не резервная копия.
          </p>
          <button className="secondary" disabled={busy}>
            Сохранить CSV
          </button>
        </form>
      </section>
      <details className="card app-permissions licenses">
        <summary>О приложении и лицензии</summary>
        <p>Рационика. Локальный дневник питания.</p>
        <p className="subtle">
          USDA FoodData Central · SR Legacy 2018. Данные USDA — общественное достояние. Русские
          названия локализованы в приложении.
        </p>
        <p className="subtle">
          Open Food Facts: база ODbL 1.0, содержимое отдельных записей — Database Contents License.
          Изображения продуктов — CC BY-SA 3.0. В приложении изображения OFF не используются.
        </p>
        <p>
          <a href="https://world.openfoodfacts.org/terms-of-use" target="_blank" rel="noreferrer">
            Условия Open Food Facts ↗
          </a>
        </p>
        <p className="subtle">
          Шрифт Manrope — SIL OFL 1.1. Ниже — тексты лицензий JavaScript и Capacitor-пакетов,
          включая их runtime-зависимости. Нативные Android-библиотеки описаны в документации
          проекта.
        </p>
        {notices.map((item) => (
          <details key={item.name + item.version}>
            <summary>
              {item.name} · {item.version} · {item.license}
            </summary>
            {item.texts.map((text) => (
              <pre key={text.file}>{text.text}</pre>
            ))}
          </details>
        ))}
      </details>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
