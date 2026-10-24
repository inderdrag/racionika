# Рационика / Racionika

Локальный дневник питания для Android и ПК. Собственный TypeScript backend для будущего ИИ-наставника.

> **Статус: начальная техническая версия, не готовый продукт из ТЗ.**
> Реализован фундамент фазы 0 и небольшой вертикальный прототип ручного дневника. ИИ не подключён. APK не собран и не проверен. Render не развёрнут.

## Уже работает

- React 18 + Vite + TypeScript strict, npm workspaces, локальные шрифты Manrope, светлая/системная тёмная тема.
- Пять разделов, доступные пустые состояния; будущие функции явно обозначены.
- Ручной ввод и изменение блюда, граммов и значений на 100 г; локальный пересчёт и контроль согласованности ккал/БЖУ.
- Сохранение записей и воды в Dexie, выбор даты, отмена воды, удаление блюда.
- Экспорт JSON без токенов и полная очистка этих записей с подтверждением.
- Fastify `/health`, Helmet, ограниченный CORS и базовый IP rate limit. Платные ИИ-маршруты закрыты (404).
- Zod-контракты, платформенные адаптеры web/Capacitor, исходники Android-оболочки.

## Запуск на ПК

Нужны Node 24 LTS и Git. Android Studio не нужна для браузерной разработки.

```sh
git clone https://github.com/inderdrag/racionika.git
cd racionika
npm ci
npm run dev
```

Откройте http://localhost:5173. Сервер: http://localhost:8787/health.
На Windows можно затем запускать `scripts/start-dev.bat`. `/health` работает без ключей и `.env`.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run doctor
```

Android: сначала установите Android Studio и SDK согласно [docs/DEV.md](docs/DEV.md), затем `npm run apk:debug`. Скрипт не создаёт release и не загружает APK в GitHub Releases.

## Важно

Это не медицинская рекомендация. Цели, онбординг, база 400–600 продуктов, ИИ, фотоанализ, чат, напоминания и release-процесс ещё не реализованы. Веб-прототип не гарантирует запуск после офлайн-перезагрузки браузера: Service Worker пока нет. Capacitor в APK упаковывает ресурсы локально, но сборка и поведение на устройстве ещё требуют проверки.

Подробный статус: [docs/STATUS.md](docs/STATUS.md). Исходное ТЗ: [docs/REQUIREMENTS.original.md](docs/REQUIREMENTS.original.md). Решения: [docs/DECISIONS.md](docs/DECISIONS.md).

## Если вы получили ZIP, а не клонировали GitHub

При первоначальной поставке доступ GitHub был ограничен. Подключение переавторизовано, и текущие исходники публикуются в репозитории. Для обычной работы предпочтителен git clone из раздела выше. Инструкция ниже нужна только для восстановления истории из ранее выданного ZIP.

Для запуска достаточно распаковать папку racionika, открыть в ней терминал и выполнить `npm ci` → `npm run dev`. Git не нужен, чтобы просто запустить архив.

В ZIP также есть `history/racionika.bundle`: переносимая история Git. Чтобы восстановить её в **новую соседнюю папку** и отправить в созданный приватный репозиторий:

```sh
git clone history/racionika.bundle ../racionika-git
cd ../racionika-git
git remote set-url origin https://github.com/inderdrag/racionika.git
git push -u origin main
```

Для push потребуется ваш GitHub-доступ. Авторизуйтесь обычным поддерживаемым Git/GitHub способом на своём ПК; если установлен GitHub CLI, используйте `gh auth login`. Не присылайте токен в чат. Если подключение GitHub ограничено списком репозиториев, предоставьте ему доступ к новому racionika; текущая ошибка сама по себе не доказывает конкретную причину ограничения.
