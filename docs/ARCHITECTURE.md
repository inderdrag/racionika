# Архитектура 0.2.0

app (React/Dexie/Capacitor): features/add-food и Coach → core/ai/client → platform HTTP → HTTPS API (или Vite proxy в dev). core/nutrition считает порции; core/db сохраняет дневник, воду, кеш и чат.

server (Fastify): конфигурация/env → JWT/квоты → строгая входная схема → prompts → provider adapter → строгая выходная схема → клиент. Провайдеры: Anthropic Messages, OpenAI Responses, Gemini generateContent. Никакого универсального проксирования произвольных URL/моделей пользователя.

packages/shared: Zod-контракты, версия и типы. Перед сервером компилируется shared; клиент Vite использует source alias. dev автоматически собирает shared, но при изменении shared во время разработки перезапустите dev для синхронизации server dist.

Dexie v1 (ручные записи/вода) → v2 (добавлены aiCache/chatMessages, существующие таблицы сохранены). Анализ хранится в FoodEntry опционально: legacy записи продолжают считаться через per100. Export schema2 включает анализ/чат, не JWT и не фото. Импорт ещё не сделан.

Фото/тексты проходят через сервер и провайдера только после согласия; сервер их не сохраняет. Дневная сводка отправляется наставнику по явному действию. In-memory лимиты не распределены и не постоянны; требования публичного сервиса см. SERVER.md.

Целевой выпуск — Android APK. Render работает с SERVE_WEB=false и раздаёт только API; app/dist упаковывается внутрь APK через Capacitor. Публичный HTTPS VITE_API_BASE_URL задаётся при сборке APK, ключ AnyModel остаётся на сервере. Опциональный режим SERVE_WEB=true сохранён в коде для технических проверок, но не включён в целевое развёртывание. AnyModel — отдельный серверный адаптер Chat Completions.
