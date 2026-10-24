# Разработка и сборка Android

Пользовательский вариант — APK; локальный браузер ниже нужен только разработчику для проверки интерфейса. Для Render API и сборки APK через GitHub см. RENDER.md.

## Проверка интерфейса разработчиком без ключа

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

В локальном `server/.env`: заполните ANYMODEL_API_KEY ключом AnyModel, JWT_SECRET результатом генератора, REQUIRE_ACCESS_CODE=false (поле кода в APK отсутствует). MOCK_AI=false. Не присылайте ключ в чат и не коммитьте .env. Затем:

```powershell
npm.cmd run dev
```

Откройте http://localhost:5173. Проверьте: http://localhost:8787/v1/config показывает mode: real, не demo. Согласие задайте один раз в Профиле, затем описание/фото; кода доступа в APK нет. У провайдера должен быть доступ к заданным моделям и оплаченный API-баланс.

В текущем .env.example выбран AnyModel: укажите AI_PROVIDER=anymodel и точные ID vision-моделей из его каталога в MODEL_FAST и MODEL_ACCURATE. Можно использовать один ID в обеих строках. Для прямого Anthropic выберите AI_PROVIDER=anthropic и ANTHROPIC_API_KEY; модели по умолчанию: claude-haiku-5-5 и claude-sonnet-5-5. Если ваш аккаунт не имеет доступа, укажите доступные vision-модели в MODEL_FAST/MODEL_ACCURATE. Для OpenAI: AI_PROVIDER=openai, OPENAI_API_KEY и обе модели; для Gemini аналогично AI_PROVIDER=gemini, GEMINI_API_KEY. Переименование моделей и доступность проверяются по актуальной документации аккаунта. Никаких публичных VITE_* ключей.

Без ключа обычный npm run dev показывает «ИИ не настроен», но ручной дневник работает. После изменений .env перезапустите сервер. После смены JWT_SECRET клиент автоматически зарегистрируется заново; ввод кода в APK не нужен.

## Хранение и экспорт

Dexie в браузере хранит дневник, воду, историю чата и ограниченный кеш оценок. Очистка данных сайта/смена origin удаляет или изолирует эти данные. Делайте JSON-экспорт в профиле. Проверяемый импорт JSON с подтверждением и слиянием по ID доступен в Профиле. Фото не сохраняются; при повторном открытии блюда доступен текстовый разбор, а не исходное изображение. Веб-сессия/идентификатор хранятся в sessionStorage, на Android — secure storage.

## Android

Для браузера Android Studio не нужна. Для APK нужны Android Studio, SDK Platform 36, Build Tools 36, Platform Tools и JDK 21. Настройте JAVA_HOME, ANDROID_HOME и adb в PATH. `npm run doctor` проверяет окружение, `npm run apk:debug` собирает debug APK в app/android/app/build/outputs/apk/debug/app-debug.apk. Здесь этот шаг не проверен: Android SDK отсутствует.

Ручная сборка APK проверяет, что адрес API задан, использует HTTPS и не указывает localhost. Проверка не подтверждает доступность сервера.

Для native-сборки задайте публичный HTTPS VITE_API_BASE_URL в app/.env (см. пример), затем npm run build. В APK не используйте localhost и HTTP. Ключ остаётся на сервере. CapacitorHttp после запуска не гарантирует сетевую отмену: клиент игнорирует поздний ответ, серверный таймаут ограничивает длительность; уже начатый запрос может оплачиваться.

## Разработка

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Браузерные тесты запускают демосервер: `npx playwright install chromium`, затем `npm run test:e2e`. При локальном системном Chromium: `npm run test:e2e:local`, путь можно передать PLAYWRIGHT_CHROMIUM_EXECUTABLE. Не запускайте тесты поверх сервера в реальном режиме: они рассчитаны на mock без платных вызовов.

## Release APK

Для обновлений используйте постоянный PKCS12-ключ и apk:release, а не apk:debug. Настройка переменных/Secrets, счётчика и безопасного перехода — RELEASE.md. Локальный release требует ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD и при обновлении CI-сборки достаточно высокий ANDROID_VERSION_CODE. Не коммитьте файлы ключа и пароли.
