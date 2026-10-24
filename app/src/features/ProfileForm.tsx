import { useState, type FormEvent } from 'react';
import { ProfileSchema, type UserProfile } from '@racionika/shared';
import { hasAiConsent, personalPlan, saveAiConsent, saveProfile } from '../core/profile';
import { Icon } from '../shared/ui/Icon';
export function ProfileForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: UserProfile;
  onDone: (profile: UserProfile) => void;
  onCancel?: () => void;
}) {
  const [goal, setGoal] = useState(initial?.goal ?? 'maintain');
  const [preview, setPreview] = useState<UserProfile>();
  const [consent, setConsent] = useState(hasAiConsent());
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<UserProfile | undefined>(initial);
  const plan = preview ? personalPlan(preview) : undefined;
  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const weight = Number(data.get('weight'));
      const profile = ProfileSchema.parse({
        version: 1,
        name: data.get('name'),
        sex: data.get('sex'),
        age: Number(data.get('age')),
        height: Number(data.get('height')),
        weight,
        activity: data.get('activity'),
        goal,
        targetWeight: goal === 'maintain' ? weight : Number(data.get('targetWeight')),
        pace: goal === 'maintain' ? 0.5 : Number(data.get('pace')),
        individualCare: data.get('individualCare') === 'on',
        updatedAt: new Date().toISOString(),
      });
      setDraft(profile);
      setPreview(profile);
      window.scrollTo(0, 0);
    } catch {
      setError('Проверьте имя и параметры: все поля должны быть заполнены корректно.');
    }
  }
  function finish() {
    if (!preview) return;
    try {
      saveProfile(preview);
      saveAiConsent(consent);
      onDone(preview);
    } catch {
      setError('Не удалось сохранить профиль. Проверьте свободное место на устройстве.');
    }
  }
  return (
    <div className="onboarding-shell">
      <section className="card profile-form">
        <div className="wordmark">
          <Icon name="leaf" />
          <span>Рационика</span>
        </div>
        <p className="eyebrow">{initial ? 'ВАШИ ПАРАМЕТРЫ' : 'НАЧНЁМ СО ЗНАКОМСТВА'}</p>
        <h1>
          {preview ? 'Ваш личный план' : initial ? 'Настроить профиль' : 'Как к вам обращаться?'}
        </h1>
        {!preview ? (
          <form onSubmit={calculate}>
            <label className="field">
              Имя
              <input
                name="name"
                required
                maxLength={60}
                defaultValue={draft?.name}
                autoComplete="given-name"
              />
            </label>
            <div className="form-grid">
              <label className="field">
                Пол для расчёта
                <select name="sex" required defaultValue={draft?.sex ?? ''}>
                  <option value="" disabled>
                    Выберите
                  </option>
                  <option value="female">Женский</option>
                  <option value="male">Мужской</option>
                </select>
              </label>
              <label className="field">
                Возраст, лет
                <input
                  name="age"
                  type="number"
                  min={6}
                  max={100}
                  step={1}
                  required
                  defaultValue={draft?.age}
                />
              </label>
              <label className="field">
                Рост, см
                <input
                  name="height"
                  type="number"
                  min={100}
                  max={230}
                  step="0.1"
                  required
                  defaultValue={draft?.height}
                />
              </label>
              <label className="field">
                Вес, кг
                <input
                  name="weight"
                  type="number"
                  min={25}
                  max={350}
                  step="0.1"
                  required
                  defaultValue={draft?.weight}
                />
              </label>
            </div>
            <label className="field">
              Активность
              <select name="activity" required defaultValue={draft?.activity ?? ''}>
                <option value="" disabled>
                  Выберите уровень
                </option>
                <option value="1.2">Мало движения, сидячий день</option>
                <option value="1.375">Лёгкая активность, 1–3 тренировки в неделю</option>
                <option value="1.55">Умеренная активность, 3–5 тренировок</option>
                <option value="1.725">Высокая активность, почти каждый день</option>
                <option value="1.9">Очень высокая, тяжёлая физическая работа</option>
              </select>
            </label>
            <label className="field">
              Моя цель
              <select value={goal} onChange={(e) => setGoal(e.target.value as UserProfile['goal'])}>
                <option value="maintain">Поддерживать вес</option>
                <option value="lose">Снизить вес</option>
                <option value="gain">Набрать вес</option>
              </select>
            </label>
            {goal !== 'maintain' && (
              <div className="form-grid">
                <label className="field">
                  Целевой вес, кг
                  <input
                    name="targetWeight"
                    type="number"
                    min={25}
                    max={350}
                    step="0.1"
                    required
                    defaultValue={draft?.targetWeight}
                  />
                </label>
                <label className="field">
                  Темп, кг в неделю
                  <input
                    name="pace"
                    type="number"
                    min={0.1}
                    max={goal === 'gain' ? 0.5 : 1}
                    step="0.1"
                    required
                    defaultValue={draft?.pace ?? (goal === 'gain' ? 0.2 : 0.5)}
                  />
                </label>
              </div>
            )}
            <label className="consent">
              <input name="individualCare" type="checkbox" defaultChecked={draft?.individualCare} />
              <span>
                Нужен индивидуальный подход: беременность, грудное вскармливание, диабет или
                расстройство пищевого поведения.
              </span>
            </label>
            <p className="subtle">
              Профиль и дневник хранятся на телефоне. Это не облачный аккаунт. Норму рассчитывает
              код, а не догадка ИИ.
            </p>
            <button className="primary" type="submit">
              Рассчитать мой план
            </button>
          </form>
        ) : (
          <>
            <p className="profile-greeting">{preview.name}, начнём в вашем темпе.</p>
            {plan?.status === 'ready' ? (
              <div className="plan-preview">
                <strong>
                  {plan.calories} <small>ккал в день</small>
                </strong>
                <p>
                  Коридор: {plan.lower}–{plan.upper} ккал
                </p>
                <p>
                  Белки {plan.protein} г · Жиры {plan.fat} г · Углеводы {plan.carbs} г
                </p>
                <p>
                  Вода: {plan.water} мл — стартовый ориентир, с учётом жажды и индивидуальных
                  рекомендаций.
                </p>
                {plan.weeks !== null && (
                  <p>Расчётный срок: около {plan.weeks} нед., не обещание результата.</p>
                )}
                {plan.adjusted && (
                  <p>Темп ограничен безопасными границами: около {plan.pace?.toFixed(2)} кг/нед.</p>
                )}
              </div>
            ) : (
              <p className="notice">{plan?.message}</p>
            )}
            <p className="subtle">
              {plan?.status === 'ready'
                ? plan.message
                : 'Можно вести дневник и включить напоминания без автоматической диеты.'}
            </p>
            <label className="consent onboarding-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                Включить ИИ. Разрешаю отправлять фото, описания еды и сообщения через сервер
                приложения провайдеру AnyModel. Для наставника также передаются последние 10
                сообщений, сводка выбранного дня, профиль и цель. Сервер приложения их не сохраняет;
                обработка AnyModel — по его политике. Согласие сохраняется и отзывается в Профиле.
              </span>
            </label>
            <p className="subtle">
              Без согласия ИИ выключен, локальный дневник работает. Напоминания включаются отдельно
              в Профиле.
            </p>
            <button className="primary" onClick={finish}>
              {initial ? 'Сохранить профиль' : 'Начать'}
            </button>
            <button className="text-button" onClick={() => setPreview(undefined)}>
              Изменить параметры
            </button>
          </>
        )}
        {onCancel && (
          <button className="text-button" onClick={onCancel}>
            Отмена
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
