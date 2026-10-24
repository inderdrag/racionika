# Проверенные технические источники

Проверено 2026-10-24:

- npm registry: @capacitor/core 8.5.3, @aparajita/capacitor-secure-storage 8.0.1, fastify 5.12.7. Точные установленные версии всех зависимостей в package-lock.json.
- https://capacitorjs.com/docs/updating/8-0 — Node 22+, Android Studio Otter 2025.2.1+, SDK 36, Gradle 8.14.3 и AGP 8.13.0. JDK 21 дополнительно подтверждён sourceCompatibility установленного @capacitor/android.
- https://capacitorjs.com/docs/getting-started/environment-setup — Android SDK/Studio.
- https://render.com/docs/blueprint-spec — runtime node, frankfurt, sync:false, autoDeployTrigger checksPass.
- README установленного secure-storage — поддержка Capacitor 8; нативная совместимость пока требует сборки/проверки устройства.

Для реализации 0.2.0 дополнительно загружены официальные форматы API:

- https://platform.claude.com/docs/en/api/messages/create — Messages,base64 images,system/cache_control,usage.
- https://platform.claude.com/docs/en/about-claude/models/overview — claude-haiku-5-5 и claude-sonnet-5-5,vision; доступ конкретному аккаунту не проверен.
- https://platform.openai.com/docs/api-reference/responses/create — input_text/input_image,store:false,output_text,usage.
- https://ai.google.dev/api/generate-content — systemInstruction,inlineData,responseMimeType,usageMetadata.

Живые платные вызовы не выполнялись. Тарифы не захардкожены;retention, доступность конкретному аккаунту, платёжные ограничения и реальные условия данных нужно проверять у провайдера. Render deploy и release workflow не проверены.

- https://anymodel.org/api-docs.md — AnyModel Chat Completions, Bearer, каталог ID с префиксами, imageToText и единицы баланса. Проверено 2026-10-24, без ключа и платных запросов.
- https://render.com/docs/blueprint-spec — единый Node Web Service, env generateValue/sync:false и checksPass.
