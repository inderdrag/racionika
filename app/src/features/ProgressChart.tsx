import {
  usePreferences,
  weightText,
  weightUnitLabel,
  waterText,
  waterUnitLabel,
} from '../core/preferences';
import { useId } from 'react';
import { progressSummary, type ProgressDay } from '../core/progress';
type Metric = 'weight' | 'calories' | 'water';
const labels = { weight: 'Вес', calories: 'Калории', water: 'Вода' };

export function progressNumber(value: number, metric: Metric) {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: metric === 'weight' ? 1 : 0 });
}
export function progressDate(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  });
}
export function ProgressChart({ rows, metric }: { rows: ProgressDay[]; metric: Metric }) {
  const preferences = usePreferences();
  const units = {
    weight: weightUnitLabel(preferences),
    calories: 'ккал',
    water: waterUnitLabel(preferences),
  };
  const id = useId();
  const summary = progressSummary(rows, metric);
  const values = rows.flatMap((row) => (row[metric] === null ? [] : [row[metric]]));
  const lowest = values.length ? Math.min(...values) : 0;
  const highest = values.length ? Math.max(...values) : 0;
  const pad = Math.max(0.5, (highest - lowest) * 0.15);
  const min = metric === 'weight' ? Math.max(0, lowest - pad) : 0;
  const max = metric === 'weight' ? highest + pad : Math.max(1, highest * 1.15);
  const x = (index: number) => 64 + (index * 242) / (rows.length - 1);
  const y = (value: number) => 146 - ((value - min) / (max - min)) * 118;
  const number = (value: number) =>
    metric === 'weight'
      ? weightText(value, preferences)
      : metric === 'water'
        ? waterText(value, preferences)
        : progressNumber(value, metric);
  return (
    <section className={`card progress-chart progress-${metric}`} aria-labelledby={id}>
      <header className="progress-chart-header">
        <h2 id={id}>{labels[metric]}</h2>
        <span className="subtle">{units[metric]}</span>
      </header>
      <div className="progress-average">
        <strong>{summary.mean === null ? '—' : number(summary.mean)}</strong>
        <span className="subtle">{metric === 'weight' ? 'средний вес' : 'в среднем за день'}</span>
      </div>
      {summary.count ? (
        <>
          <svg
            className="progress-svg"
            viewBox="0 0 328 180"
            role="img"
            aria-label={`${labels[metric]} за ${rows.length} дней. Значения — в таблице ниже.`}
          >
            {[min, (min + max) / 2, max].map((value) => (
              <g key={value} className="progress-grid">
                <line x1="48" x2="312" y1={y(value)} y2={y(value)} />
                <text x="42" y={y(value) + 4} textAnchor="end">
                  {number(value)}
                </text>
              </g>
            ))}
            {rows.map((row, index) => {
              const value = row[metric];
              const previous = rows[index - 1]?.[metric];
              if (value === null) return null;
              return (
                <g key={row.day} className="progress-marks">
                  <title>{`${progressDate(row.day)}: ${number(value)} ${units[metric]}`}</title>
                  {metric === 'weight' ? (
                    <>
                      {previous !== undefined && previous !== null && (
                        <line x1={x(index - 1)} x2={x(index)} y1={y(previous)} y2={y(value)} />
                      )}
                      <circle cx={x(index)} cy={y(value)} r="4" />
                    </>
                  ) : (
                    <rect
                      x={x(index) - (rows.length === 7 ? 10 : 3)}
                      y={y(value)}
                      width={rows.length === 7 ? 20 : 6}
                      height={Math.max(2, 146 - y(value))}
                      rx="2"
                    />
                  )}
                </g>
              );
            })}
            {[0, Math.floor((rows.length - 1) / 2), rows.length - 1].map((index) => (
              <text className="progress-axis" key={index} x={x(index)} y="172" textAnchor="middle">
                {progressDate(rows[index].day)}
              </text>
            ))}
          </svg>
          <p className="subtle progress-coverage">
            Дней с записями: {summary.count} из {rows.length}
          </p>
          {metric === 'weight' && summary.change !== null && (
            <p className="progress-change">
              Изменение: {summary.change > 0 ? '+' : ''}
              {number(summary.change)} {units.weight}
            </p>
          )}
          <details className="progress-values">
            <summary>Значения по дням</summary>
            <table>
              <caption className="sr-only">{labels[metric]} за выбранный период</caption>
              <thead>
                <tr>
                  <th scope="col">Дата</th>
                  <th scope="col">{units[metric]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.day}>
                    <th scope="row">{progressDate(row.day)}</th>
                    <td>{row[metric] === null ? '—' : number(row[metric])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <p className="subtle progress-empty">Нет записей за этот период.</p>
      )}
    </section>
  );
}
