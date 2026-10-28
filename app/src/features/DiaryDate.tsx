import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { db, localDay } from '../core/db';
import { monthCells, shiftDay } from '../core/calendar';
import { validDiaryDay } from '../core/diary';
export function DiaryDate({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const toggle = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(day.slice(0, 7));
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  useEffect(() => {
    const subscription = liveQuery(() =>
      db.foodEntries.where('day').between(`${month}-01`, `${month}-31`, true, true).uniqueKeys(),
    ).subscribe({
      next: (days) => {
        setMarked(new Set(days.map(String)));
        setError('');
      },
      error: () => setError('Не удалось загрузить отметки календаря.'),
    });
    return () => subscription.unsubscribe();
  }, [month]);
  const label = new Date(`${day}T12:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  function choose(value: string) {
    if (validDiaryDay(value)) {
      onChange(value);
      setMonth(value.slice(0, 7));
      setOpen(false);
      if (open) requestAnimationFrame(() => toggle.current?.focus());
    }
  }
  return (
    <section className="diary-date" aria-label="Переход между днями">
      <div className="day-navigation">
        <button
          className="secondary"
          aria-label="Предыдущий день"
          disabled={day === '1900-01-01'}
          onClick={() => choose(shiftDay(day, -1))}
        >
          ‹
        </button>
        <button
          className="text-button calendar-toggle"
          aria-expanded={open}
          ref={toggle}
          aria-controls={open ? 'diary-calendar' : undefined}
          onClick={() => {
            setMonth(day.slice(0, 7));
            setOpen(!open);
          }}
        >
          {label}
        </button>
        <button
          className="secondary"
          aria-label="Следующий день"
          disabled={day === '9999-12-31'}
          onClick={() => choose(shiftDay(day, 1))}
        >
          ›
        </button>
      </div>
      <button className="text-button today-button" onClick={() => choose(localDay())}>
        Сегодня
      </button>
      {open && (
        <div id="diary-calendar" className="diary-calendar">
          <div className="calendar-month">
            <button
              className="text-button"
              aria-label="Предыдущий месяц"
              disabled={month === '1900-01'}
              onClick={() => setMonth(shiftDay(`${month}-01`, -1).slice(0, 7))}
            >
              ‹
            </button>
            <strong aria-live="polite">
              {new Date(`${month}-01T12:00:00`).toLocaleDateString('ru-RU', {
                month: 'long',
                year: 'numeric',
              })}
            </strong>
            <button
              className="text-button"
              aria-label="Следующий месяц"
              disabled={month === '9999-12'}
              onClick={() =>
                setMonth(
                  shiftDay(`${month}-${monthCells(month).filter(Boolean).length}`, 1).slice(0, 7),
                )
              }
            >
              ›
            </button>
          </div>
          <div className="calendar-days">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <span key={d} aria-hidden="true">
                {d}
              </span>
            ))}
            {monthCells(month).map((value, i) =>
              value ? (
                <button
                  key={value}
                  className="calendar-day"
                  aria-label={`${value}${marked.has(value) ? ', есть записи' : ''}`}
                  aria-pressed={value === day}
                  data-recorded={marked.has(value)}
                  onClick={() => choose(value)}
                >
                  {Number(value.slice(-2))}
                  <span aria-hidden="true">{marked.has(value) ? '•' : '\u00a0'}</span>
                </button>
              ) : (
                <span key={`blank-${i}`} />
              ),
            )}
          </div>
          <label className="field">
            Дата дневника
            <input
              aria-label="Дата дневника"
              type="date"
              min="1900-01-01"
              max="9999-12-31"
              value={day}
              onChange={(e) => choose(e.target.value)}
            />
          </label>
          {error && (
            <p role="status" className="subtle">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
