# Запуск на Windows для новичка

## 1. Браузерный режим (доступен сейчас)

1. Установите Git for Windows и Node 24 LTS. Откройте новый PowerShell.
2. Выполните команды из README: git clone, cd racionika, npm ci, npm run dev.
3. Откройте http://localhost:5173. На широком экране появится рамка телефона. В инструментах браузера можно выбрать ширину 360×640 или Pixel 7.
4. Остановка: Ctrl+C в терминале. Однокликовый повторный запуск: scripts/start-dev.bat.
5. Публичный health-check: http://localhost:8787/health. Ключей ИИ не нужно. MOCK_AI пока НЕ реализован; не выдаём закрытые ИИ-функции за mock-провайдер.

На web фотоадаптер открывает выбор файла; storage-адаптер использует sessionStorage; экспорт скачивает JSON. В UI фото и уведомления пока не включены. Уведомления web-адаптера работают только при открытой вкладке. Не используйте техническую сборку для важных напоминаний.

## 2. Dev-панель (ещё не реализована)

В плане: источники ИИ, моки/ошибки/таймауты, очищенный request inspector, машина времени, расписания и генератор 30 дней. Сейчас этого нет.

## 3. Android Studio / эмулятор (нужно проверить на вашей машине)

1. Установите Android Studio Otter 2025.2.1 или новее: https://developer.android.com/studio .
2. В SDK Manager установите Android SDK Platform 36, Build Tools 36 и Platform Tools. Создайте AVD в Device Manager (например Pixel 7, API 36), запустите его.
3. Для командной сборки нужен JDK 21. Укажите JAVA_HOME и добавьте его bin в PATH. Установите ANDROID_HOME на каталог SDK (обычно `%LOCALAPPDATA%\Android\Sdk`), добавьте `%ANDROID_HOME%\platform-tools` в PATH. Откройте новый терминал.
4. Выполните `npm run doctor`. Исправьте отсутствующие инструменты.
5. Выполните `npm run apk:debug`. Файл при успехе: app/android/app/build/outputs/apk/debug/app-debug.apk. Успех этого шага здесь пока не подтверждён.
6. `npm run dev:android` устанавливает/запускает текущую оболочку через Capacitor. Это НЕ готовый livereload workflow; для чистого production-клиента cleartext запрещён. Не включайте debug URL в release-конфигурацию.
7. Телефон: включите параметры разработчика → USB-отладка, подключите USB и разрешите отладку. Проверьте `adb devices`.

Для диагностики WebView используйте отдельную debug-конфигурацию; в текущем Capacitor config WebView-debugging отключён, поэтому chrome://inspect не обещан как рабочий путь без явной debug-настройки. Эмулятору для самой работы дневника не нужен интернет.

## Тесты

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, затем `npx playwright install chromium` и `npm run test:e2e`. В CI используется штатный браузер Playwright. Системный Chromium можно использовать только в локальном QA через отдельный конфиг.
