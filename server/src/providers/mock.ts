import type { Task } from '../prompts/index.js';
import type { MealAnalysis } from '@racionika/shared';
export const DEMO_MEAL: MealAnalysis = {
  is_food: true,
  dish_name: 'Демо: курица с рисом',
  confidence: 0.65,
  cooking_method: 'baked',
  ingredients: [
    {
      name: 'Куриная грудка, запечённая',
      grams: 150,
      grams_range: [120, 180],
      per_100g: { kcal: 165, protein: 31, fat: 3.6, carbs: 0 },
      confidence: 0.85,
    },
    {
      name: 'Рис белый, варёный',
      grams: 180,
      grams_range: [140, 220],
      per_100g: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
      confidence: 0.7,
    },
  ],
  hidden_additions: {
    oil_g: 5,
    salt_g: 1,
    sugar_g: 0,
    sauce_kcal: 0,
    note: 'Демонстрационная добавка масла',
  },
  clarifying_questions: [
    { question: 'Есть ли дополнительный соус?', options: ['Нет', 'Добавлю уточнение'] },
  ],
  warnings: ['ДЕМОНСТРАЦИЯ: фиксированный пример, это не распознавание вашей еды.'],
};
export function mockReply(task: Task) {
  return task === 'meal'
    ? structuredClone(DEMO_MEAL)
    : task === 'lookup'
      ? {
          name: 'Демо: рис варёный',
          per_100g: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 },
          typical_grams: 150,
          warning: 'ДЕМОНСТРАЦИЯ: фиксированный продукт, не результат поиска.',
        }
      : {
          text: 'ДЕМОНСТРАЦИЯ: это заготовленный ответ, не совет ИИ. В реальном режиме наставник использует сводку дневника.',
        };
}
