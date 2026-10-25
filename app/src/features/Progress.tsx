import { useEffect, useState, type FormEvent } from 'react';
import { liveQuery } from 'dexie';
import { db, localDay, type WeightLog } from '../core/db';
import type { UserProfile } from '@racionika/shared';
export function Progress({ profile }: { profile: UserProfile }) {
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [day, setDay] = useState(localDay());
  const [kg, setKg] = useState(String(profile.weight));
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const sub = liveQuery(() => db.weightLogs.orderBy('day').toArray()).subscribe({
      next: setWeights,
      error: () => setNotice('Не удалось открыть историю веса.'),
    });
    return () => sub.unsubscribe();
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    const value = Number(kg);
    if (!Number.isFinite(value) || value < 25 || value > 350) {
      setNotice('Проверьте вес: от 25 до 350 кг.');
      return;
    }
    try {
      await db.weightLogs.put({
        id: `weight-${day}`,
        day,
        kg: value,
        createdAt: new Date().toISOString(),
      });
      setNotice('Вес сохранён. Норма калорий не меняется без вашего подтверждения.');
    } catch {
      setNotice('Не удалось сохранить вес.');
    }
  }
  const last = weights.at(-1);
  const first = weights[0];
  return (
    <>
      <section className="card profile-card">
        <h2>Мой вес</h2>
        <p>
          Последняя запись: <strong>{last?.kg ?? profile.weight} кг</strong>
        </p>
        {first && last && weights.length > 1 && (
          <p>Изменение с первой записи: {(last.kg - first.kg).toFixed(1)} кг</p>
        )}
        <p className="subtle">
          {profile.goal === 'maintain'
            ? 'Цель — поддерживать вес'
            : `Целевой вес: ${profile.targetWeight} кг`}
        </p>
        <form onSubmit={(event) => void save(event)}>
          <div className="form-grid">
            <label className="field">
              Дата взвешивания
              <input
                type="date"
                required
                value={day}
                max={localDay()}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <label className="field">
              Вес сегодня, кг
              <input
                inputMode="decimal"
                type="number"
                required
                min={25}
                max={350}
                step="0.1"
                value={kg}
                onChange={(e) => setKg(e.target.value)}
              />
            </label>
          </div>
          <button className="primary">Сохранить вес</button>
        </form>
      </section>
      <section className="card profile-card">
        <h2>История веса</h2>
        {weights.length ? (
          <ul className="weight-history">
            {weights
              .slice(-30)
              .reverse()
              .map((item) => (
                <li key={item.id}>
                  <span>{new Date(`${item.day}T12:00:00`).toLocaleDateString('ru-RU')}</span>
                  <strong>{item.kg} кг</strong>
                  <button
                    className="delete"
                    aria-label={`Удалить вес за ${item.day}`}
                    onClick={() => {
                      if (window.confirm('Удалить эту запись веса?'))
                        void db.weightLogs
                          .delete(item.id)
                          .catch(() => setNotice('Не удалось удалить запись.'));
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <p className="subtle">Добавьте первое взвешивание — оно появится здесь.</p>
        )}
      </section>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
