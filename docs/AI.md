# Контракты ИИ: фундамент

Реализованы строгие Zod-схемы MealAnalysis, Ingredient, Nutrients, RegisterInput, Health и ApiError. См. packages/shared/src/index.ts. Это контракты, не работающий ИИ.

Схема блюда содержит per_100g, grams/range, confidence, is_food, hidden_additions, clarifying_questions и warnings. sugar_g добавлен явно (по умолчанию 0), так как он упомянут в требованиях и отсутствует в исходном примере JSON. Числа конечные и ограниченные; неизвестные ключи отбрасывать не молча, а отклонять strict-валидацией.

Пока не реализованы: все провайдеры, model selection, системные промпты, image validation, токены/лимиты, usage/cost, caching, retries, SSE. Не передавайте API-ключ клиенту и не добавляйте его в GitHub Secrets.

Текущие контракты ещё потребуют тестов на реальных зафиксированных fixtures до production. Использование zod не гарантирует медицинскую корректность ответа.
