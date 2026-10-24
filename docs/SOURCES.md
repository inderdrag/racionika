# Проверенные технические источники

Проверено 2026-10-24:

- npm registry: @capacitor/core 8.5.3, @aparajita/capacitor-secure-storage 8.0.1, fastify 5.12.7. Точные установленные версии всех зависимостей в package-lock.json.
- https://capacitorjs.com/docs/updating/8-0 — Node 22+, Android Studio Otter 2025.2.1+, SDK 36, Gradle 8.14.3 и AGP 8.13.0. JDK 21 дополнительно подтверждён sourceCompatibility установленного @capacitor/android.
- https://capacitorjs.com/docs/getting-started/environment-setup — Android SDK/Studio.
- https://render.com/docs/blueprint-spec — runtime node, frankfurt, sync:false, autoDeployTrigger checksPass.
- README установленного secure-storage — поддержка Capacitor 8; нативная совместимость пока требует сборки/проверки устройства.

Не проверено и не реализовано: реальные API/модели/цены всех ИИ-провайдеров, фактические условия retention фото, платёжные ограничения провайдеров, успешность Render деплоя и release workflow.
