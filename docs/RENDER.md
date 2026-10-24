# Развёртывание Render

Автоматически аккаунт/сервис здесь НЕ создан; реальный endpoint не проверен. В репозитории есть render.yaml для Node24/Fastify. Он требует реальные секреты, production с MOCK_AI запрещён.

1. В Render подключите приватный inderdrag/racionika через GitHub и создайте Blueprint из render.yaml. Проверьте текущий тариф и регион перед подтверждением.
2. В защищённых Environment задайте ANTHROPIC_API_KEY и APP_ACCESS_CODE. JWT_SECRET генерирует Blueprint; не публикуйте его. Модели должны быть доступны вашему API-аккаунту. Ключи не добавляются в GitHub.
3. Build: npm ci && npm run build -w @racionika/shared && npm run build -w @racionika/server. Start: npm run start -w @racionika/server. PORT задаёт Render. Health: /health.
4. После deploy проверьте /health и /v1/config (mode:real). Выполните один небольшой контролируемый запрос и сверяйте расход в кабинете провайдера.
5. В app/.env укажите VITE_API_BASE_URL=https://ВАШ-СЕРВИС.onrender.com. Пересоберите frontend/APK. Это публичный URL, не ключ.

Бесплатный сервер засыпает, первый запрос может ждать; лимиты в памяти сбрасываются. Перед публичным выпуском нужны постоянные лимиты и внешний бюджет/edge-защита (SERVER.md). autoDeployTrigger:checksPass ждёт успешных GitHub checks; их фактический запуск здесь не подтверждён. Не выдавайте отсутствие деплоя за готовый ИИ-сервис.
