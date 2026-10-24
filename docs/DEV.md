# Запуск на ПК

## Быстрая проверка без ключа

Установите Node 24 LTS и Git for Windows. Откройте PowerShell в папке проекта:

```powershell
git pull --ff-only
npm.cmd ci
npm.cmd run dev:demo
```

Для первого скачивания вместо git pull: `git clone https://github.com/inderdrag/racionika.git`, затем `cd racionika`.

Откройте http://localhost:5173. Демо возвращает одно фиксированное блюдо независимо от текста/фото и явно это сообщает. Можно проверить отправку фото, правки граммов, сохранение, воду, чат. Ключ и деньги не нужны. Ctrl+C останавливает сервер и сайт. На Linux/macOS — те же команды с npm.

`npm.cmd` предотвращает ошибку ExecutionPolicy PowerShell без изменения политики безопасности. `ERR_CONNECTION_REFUSED` — терминал с сервером должен оставаться открытым. При занятом порте остановите прошлый запуск (Ctrl+C), не запускайте второй поверх него. Порты: сайт 5173, API 8787.

## Настоящее распознавание

Остановите демо. Выполните в корне проекта:

```powershell
Copy-Item server/.env.example server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
notepad server/.env
```

В локальном `server/.env`: заполните ANTHROPIC_API_KEY ключом аккаунта Anthropic, JWT_SECRET результатом генератора, APP_ACCESS_CODE личным кодом доступа. MOCK_AI=false. Не присылайте ключ в чат и не коммитьте .env. Затем:

```powershell
npm.cmd run dev
```

Откройте http://localhost:5173. Проверьте: http://localhost:8787/v1/config показывает mode: real, не demo. В форме задайте описание/фото, согласие и код доступа. У провайдера должен быть доступ к заданным моделям и оплаченный API-баланс.

Модели по умолчанию: claude-haiku-5-5 и claude-sonnet-5-5. Если ваш аккаунт не имеет доступа, укажите доступные vision-модели в MODEL_FAST/MODEL_ACCURATE. Для OpenAI: AI_PROVIDER=openai, OPENAI_API_KEY и обе модели; для Gemini аналогично AI_PROVIDER=gemini, GEMINI_API_KEY. Переименование моделей и доступность проверяются по актуальной документации аккаунта. Никаких публичных VITE_* ключей.

Без ключа обычный npm run dev показывает «ИИ не настроен», но ручной дневник работает. После изменений .env перезапустите сервер. После смены JWT_SECRET клиент автоматически зарегистрируется заново; код доступа может понадобиться повторно.

## Хранение и экспорт

Dexie в браузере хранит дневник, воду, историю чата и ограниченный кеш оценок. Очистка данных сайта/смена origin удаляет или изолирует эти данные. Делайте JSON-экспорт в профиле. Импорт ещё не реализован. Фото не сохраняются; при повторном открытии блюда доступен текстовый разбор, а не исходное изображение. Веб-сессия/идентификатор хранятся в sessionStorage, на Android — secure storage.

## Android

Для браузера Android Studio не нужна. Для APK нужны Android Studio, SDK Platform 36, Build Tools 36, Platform Tools и JDK 21. Настройте JAVA_HOME, ANDROID_HOME и adb в PATH. `npm run doctor` проверяет окружение, `npm run apk:debug` собирает debug APK в app/android/app/build/outputs/apk/debug/app-debug.apk. Здесь этот шаг не проверен: Android SDK отсутствует.

Для native-сборки задайте публичный HTTPS VITE_API_BASE_URL в app/.env (см. пример), затем npm run build. В APK не используйте localhost и HTTP. Ключ остаётся на сервере. CapacitorHttp после запуска не гарантирует сетевую отмену: клиент игнорирует поздний ответ, серверный таймаут ограничивает длительность; уже начатый запрос может оплачиваться.

## Разработка

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Браузерные тесты запускают демосервер: `npx playwright install chromium`, затем `npm run test:e2e`. При локальном системном Chromium: `npm run test:e2e:local`, путь можно передать PLAYWRIGHT_CHROMIUM_EXECUTABLE. Не запускайте тесты поверх сервера в реальном режиме: они рассчитаны на mock без платных вызовов.
