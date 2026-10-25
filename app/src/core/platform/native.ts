import { CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { shareBackup } from './share-backup';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import type { Platform } from './types';
export const nativePlatform: Platform = {
  navigation: {
    listenBack: async (onBack) => {
      const listener = await App.addListener('backButton', ({ canGoBack }) => {
        if (onBack()) return;
        if (canGoBack) window.history.back();
        else void App.exitApp();
      });
      return () => {
        void listener.remove();
      };
    },
  },
  camera: {
    pick: async () => {
      try {
        return (
          await Camera.getPhoto({
            quality: 80,
            resultType: CameraResultType.DataUrl,
            source: CameraSource.Prompt,
            width: 1280,
            height: 1280,
            correctOrientation: true,
          })
        ).dataUrl;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String((error as { message?: string })?.message ?? error);
        if (/cancel(?:led|ed)|user_cancel|no (?:image|photo) (?:picked|selected)/i.test(message))
          return undefined;
        throw new Error(
          'Не удалось открыть камеру или галерею. Проверьте разрешения Рационики в настройках Android и попробуйте ещё раз.',
          { cause: error },
        );
      }
    },
  },
  secureStorage: {
    get: async (key) => {
      const value = await SecureStorage.get(key);
      return typeof value === 'string' ? value : null;
    },
    set: async (key, value) => {
      await SecureStorage.set(key, value);
    },
    remove: async (key) => {
      await SecureStorage.remove(key);
    },
  },
  http: {
    request: async (url, options) => {
      if (!url.startsWith('https://')) throw new Error('Требуется HTTPS');
      options.signal?.throwIfAborted();
      const response = await CapacitorHttp.request({
        url,
        method: options.method,
        headers: { 'content-type': 'application/json', ...options.headers },
        data: options.body,
        connectTimeout: 90000,
        readTimeout: 90000,
      });
      options.signal?.throwIfAborted();
      return { status: response.status, data: response.data };
    },
    get: async (url) => {
      if (!url.startsWith('https://')) throw new Error('Требуется HTTPS');
      const response = await CapacitorHttp.get({ url, connectTimeout: 90000, readTimeout: 90000 });
      if (response.status !== 200) throw new Error('Сервер недоступен');
      return response.data;
    },
  },
  share: { json: shareBackup },
  notifications: {
    replaceDaily: async (items, requestPermission) => {
      if (items.length) {
        const permission = requestPermission
          ? await LocalNotifications.requestPermissions()
          : await LocalNotifications.checkPermissions();
        if (permission.display !== 'granted') return { granted: false, exact: false };
      }
      const exact =
        (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
      for (const [id, name] of [
        ['meals', 'Питание'],
        ['water', 'Вода'],
        ['motivation', 'Поддержка'],
      ])
        await LocalNotifications.createChannel({ id, name, importance: 3 });
      const pending = (
        await LocalNotifications.getAll({ state: 'SCHEDULED' })
      ).notifications.filter((item) => item.id >= 10000 && item.id < 40000);
      if (pending.length)
        await LocalNotifications.cancel({ notifications: pending.map(({ id }) => ({ id })) });
      try {
        if (items.length)
          await LocalNotifications.schedule({
            notifications: items.map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              channelId: item.channel,
              isExactNotification: exact,
              schedule: {
                on: {
                  hour: item.hour,
                  minute: item.minute,
                  ...(item.weekday ? { weekday: item.weekday } : {}),
                },
                repeats: true,
                allowWhileIdle: true,
              },
              extra: { route: item.route },
            })),
          });
      } catch {
        // A failed replacement must not silently remove the previous schedule.
        try {
          await LocalNotifications.cancel({ notifications: items.map(({ id }) => ({ id })) });
          if (pending.length) await LocalNotifications.schedule({ notifications: pending });
        } catch {
          throw new Error('Не удалось восстановить напоминания. Сохраните расписание ещё раз.');
        }
        throw new Error('Не удалось изменить напоминания. Предыдущее расписание восстановлено.');
      }
      return { granted: true, exact };
    },
    listen: async (onAction) => {
      const listener = await LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (event) => {
          const route = event.notification.extra?.route;
          if (['home', 'diary', 'coach', 'progress', 'settings'].includes(route)) onAction(route);
        },
      );
      return () => {
        void listener.remove();
      };
    },
    openExactSettings: async () => {
      await LocalNotifications.changeExactNotificationSetting();
    },
    schedule: async (reminder) => {
      if ((await LocalNotifications.requestPermissions()).display !== 'granted') return false;
      await LocalNotifications.createChannel({ id: 'meals', name: 'Питание', importance: 3 });
      await LocalNotifications.schedule({
        notifications: [
          {
            id: reminder.id,
            title: reminder.title,
            body: reminder.body,
            channelId: 'meals',
            schedule: { at: reminder.at },
            extra: { route: 'diary' },
          },
        ],
      });
      return true;
    },
    cancel: async (ids) => {
      await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
    },
  },
};
