import { useEffect, useState, type FormEvent } from 'react';
import { liveQuery } from 'dexie';
import { db, localDay, type FoodEntry, type WaterLog, type WeightLog } from '../core/db';
import { validDiaryDay } from '../core/diary';
import { loadProfile, saveProfile } from '../core/profile';
import {
  progressDays,
  progressSeries,
  weightPlanProposal,
  type ProgressPeriod,
  type WeightPlanProposal,
} from '../core/progress';
import { ProgressChart } from './ProgressChart';
import type { UserProfile } from '@racionika/shared';
export function Progress({ profile }: { profile: UserProfile }) {
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [food, setFood] = useState<FoodEntry[]>([]);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [today, setToday] = useState(localDay());
  const [period, setPeriod] = useState<ProgressPeriod>(7);
  const [day, setDay] = useState(today);
  const [kg, setKg] = useState(String(profile.weight));
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<WeightPlanProposal | null>(null);
  const [dismissed, setDismissed] = useState('');
  useEffect(() => {
    const update = () => setToday(localDay());
    const timer = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => {
    const first = progressDays(today, 30)[0];
    const sub = liveQuery(async () => ({
      weights: await db.weightLogs.orderBy('day').toArray(),
      food: await db.foodEntries.where('day').between(first, today, true, true).toArray(),
      water: await db.waterLogs.where('day').between(first, today, true, true).toArray(),
    })).subscribe({
      next: (data) => {
        setWeights(data.weights);
        setFood(data.food);
        setWater(data.water);
        setLoading(false);
      },
      error: () => {
        setNotice('Не удалось открыть данные прогресса.');
        setLoading(false);
      },
    });
    return () => sub.unsubscribe();
  }, [today]);
  async function save(event: FormEvent) {
    event.preventDefault();
    const value = Number(kg);
    if (!validDiaryDay(day) || day > localDay()) {
      setNotice('Выберите дату не позднее сегодняшней.');
      return;
    }
    if (!Number.isFinite(value) || value < 25 || value > 350) {
      setNotice('Проверьте вес: от 25 до 350 кг.');
      return;
    }
    setSaving(true);
    try {
      await db.weightLogs.put({
        id: `weight-${day}`,
        day,
        kg: value,
        createdAt: new Date().toISOString(),
      });
      setPreview(null);
      setNotice('');
    } catch {
      setNotice('Не удалось сохранить вес.');
    } finally {
      setSaving(false);
    }
  }
  const visibleWeights = weights.filter((item) => item.day <= today);
  const last = visibleWeights.at(-1);
  const proposal = weightPlanProposal(profile, weights, today);
  const proposalKey = proposal ? JSON.stringify([proposal.measurement, profile]) : '';
  async function confirmPlan() {
    if (!preview) return;
    setSaving(true);
    try {
      // Re-read before applying: an imported profile or deleted measurement invalidates the preview.
      const current = loadProfile();
      const currentProposal =
        current && weightPlanProposal(current, await db.weightLogs.toArray(), localDay());
      if (
        !currentProposal ||
        JSON.stringify(current) !== JSON.stringify(preview.profile) ||
        JSON.stringify(currentProposal.measurement) !== JSON.stringify(preview.measurement)
      ) {
        setPreview(null);
        setNotice('Данные изменились. Откройте пересчёт ещё раз.');
        return;
      }
      if (currentProposal.next.status !== 'ready') {
        setPreview(null);
        setNotice('Проверьте цель в Профиле перед пересчётом.');
        return;
      }
      saveProfile({ ...currentProposal.candidate, updatedAt: new Date().toISOString() });
      setPreview(null);
      setNotice('');
    } catch {
      setNotice('Не удалось сохранить новый план. Старый план не изменён.');
    } finally {
      setSaving(false);
    }
  }
  const rows = progressSeries(today, period, weights, food, water);
  return (
    <>
      <section className="card profile-card">
        <h2>Мой вес</h2>
        <p>
          Последняя запись: <strong>{last?.kg ?? profile.weight} кг</strong>
        </p>
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
                max={today}
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
          <button className="primary" disabled={saving}>
            Сохранить вес
          </button>
        </form>
      </section>
      {proposal && proposalKey !== dismissed && (
        <section className="card profile-card weight-plan" aria-label="Пересчёт по новому весу">
          <h2>Обновить норму?</h2>
          <p>
            В профиле {profile.weight} кг → новое взвешивание {proposal.measurement.kg} кг.
          </p>
          {proposal.next.status === 'ready' ? (
            preview ? (
              <>
                <div className="plan-preview">
                  <p>
                    Калории: {preview.previous.calories ?? '—'} →{' '}
                    <b>{preview.next.calories} ккал</b>
                  </p>
                  <p>
                    Б {preview.next.protein} г · Ж {preview.next.fat} г · У {preview.next.carbs} г
                  </p>
                  <p>Вода: {preview.next.water} мл</p>
                </div>
                <p className="subtle">
                  {profile.customCalories !== undefined
                    ? 'Ваша ручная цель калорий останется прежней. Обновятся вес и БЖУ.'
                    : 'Новая норма начнёт действовать после подтверждения.'}
                </p>
                <button className="primary" disabled={saving} onClick={() => void confirmPlan()}>
                  Подтвердить пересчёт
                </button>
                <button className="text-button" onClick={() => setPreview(null)}>
                  Отмена
                </button>
              </>
            ) : (
              <>
                <button className="primary" onClick={() => setPreview(proposal)}>
                  Посмотреть пересчёт
                </button>
                <button className="text-button" onClick={() => setDismissed(proposalKey)}>
                  Позже
                </button>
              </>
            )
          ) : (
            <p className="subtle">Проверьте цель в Профиле. Текущая норма не изменена.</p>
          )}
        </section>
      )}
      <section className="card progress-period" aria-label="Период графиков">
        <div className="progress-period-buttons" role="group" aria-label="Период">
          {([7, 30] as const).map((value) => (
            <button
              key={value}
              aria-pressed={period === value}
              className={period === value ? 'primary' : 'secondary'}
              onClick={() => setPeriod(value)}
            >
              {value} дней
            </button>
          ))}
        </div>
        <p className="subtle">Средние — по дням с записями. Пропуски — не нули.</p>
      </section>
      {loading ? (
        <p className="subtle" role="status">
          Загружаем графики…
        </p>
      ) : (
        <>
          {(['weight', 'calories', 'water'] as const).map((metric) => (
            <ProgressChart key={metric} rows={rows} metric={metric} />
          ))}
        </>
      )}
      <section className="card profile-card">
        <details className="progress-history">
          <summary>История веса</summary>
          {visibleWeights.length ? (
            <ul className="weight-history">
              {visibleWeights
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
            <p className="subtle">Пока нет взвешиваний.</p>
          )}
        </details>
      </section>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
