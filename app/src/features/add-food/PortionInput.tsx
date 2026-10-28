import { useState } from 'react';
import type { CatalogSource } from '../../core/catalog/types';
import { portionGrams, portionMeasures } from '../../core/catalog/portions';
export function PortionInput({
  source,
  grams,
  onChange,
  label = 'Масса, г',
  lastGrams,
  disabled = false,
}: {
  source?: CatalogSource;
  grams: string;
  onChange: (value: string) => void;
  label?: string;
  lastGrams?: number;
  disabled?: boolean;
}) {
  const measures = portionMeasures(source);
  const [unit, setUnit] = useState('');
  const [count, setCount] = useState('1');
  const [weight, setWeight] = useState('');
  function update(c: string, w: string) {
    setCount(c);
    setWeight(w);
    onChange(portionGrams(Number(c), Number(w)));
  }
  return (
    <div className="portion-input">
      {measures.length > 0 && (
        <label className="field">
          Единица порции
          <select
            disabled={disabled}
            value={unit}
            onChange={(e) => {
              const key = e.target.value;
              setUnit(key);
              if (key) {
                const measure = measures[Number(key) - 1];
                setCount('1');
                setWeight(String(measure.grams));
                onChange(String(measure.grams));
              }
            }}
          >
            <option value="">Граммы</option>
            {measures.map((m, i) => (
              <option key={m.sourceRow} value={String(i + 1)}>
                {m.label} ≈ {m.grams} г
              </option>
            ))}
          </select>
        </label>
      )}
      {unit && (
        <div className="portion-measures">
          <label className="field">
            Количество
            <input
              disabled={disabled}
              type="number"
              min="0.1"
              step="0.1"
              inputMode="decimal"
              value={count}
              onChange={(e) => update(e.target.value, weight)}
            />
          </label>
          <label className="field">
            Вес одной меры, г
            <input
              disabled={disabled}
              type="number"
              min="0.1"
              max="5000"
              step="0.1"
              inputMode="decimal"
              value={weight}
              onChange={(e) => update(count, e.target.value)}
            />
          </label>
        </div>
      )}
      <label className="field">
        {label}
        <input
          disabled={disabled}
          type="number"
          inputMode="decimal"
          min="1"
          max="5000"
          step="0.1"
          required
          value={grams}
          onChange={(e) => {
            onChange(e.target.value);
            if (unit && Number(weight) > 0)
              setCount(String(Math.round((Number(e.target.value) / Number(weight)) * 1000) / 1000));
          }}
        />
      </label>
      {lastGrams !== undefined && (
        <button
          type="button"
          disabled={disabled}
          className="text-button last-portion"
          onClick={() => {
            setUnit('');
            onChange(String(lastGrams));
          }}
        >
          Последняя порция: {lastGrams.toLocaleString('ru-RU')} г
        </button>
      )}
    </div>
  );
}
