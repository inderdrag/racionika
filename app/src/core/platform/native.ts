import { CapacitorHttp } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import type { Platform } from './types';
export const nativePlatform: Platform = {
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
      } catch {
        return undefined;
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
    get: async (url) => {
      if (!url.startsWith('https://')) throw new Error('Требуется HTTPS');
      const response = await CapacitorHttp.get({ url, connectTimeout: 90000, readTimeout: 90000 });
      if (response.status !== 200) throw new Error('Сервер недоступен');
      return response.data;
    },
  },
  share: {
    json: async (name, value) => {
      const file = await Filesystem.writeFile({
        path: name,
        data: JSON.stringify(value, null, 2),
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      try {
        await Share.share({ url: file.uri });
      } finally {
        await Filesystem.deleteFile({ path: name, directory: Directory.Cache });
      }
    },
  },
  notifications: {
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
