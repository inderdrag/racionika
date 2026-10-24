import type { Platform } from './types';
const timers = new Map<number, ReturnType<typeof setTimeout>>();
export const webPlatform: Platform = {
  camera: {
    pick: () =>
      new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) {
            resolve(undefined);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => resolve(undefined);
          reader.readAsDataURL(file);
        };
        input.oncancel = () => resolve(undefined);
        input.click();
      }),
  },
  secureStorage: {
    get: async (key) => sessionStorage.getItem(key),
    set: async (key, value) => {
      sessionStorage.setItem(key, value);
    },
    remove: async (key) => {
      sessionStorage.removeItem(key);
    },
  },
  http: {
    request: async (url, options) => {
      const response = await fetch(url, {
        method: options.method,
        headers: { 'content-type': 'application/json', ...options.headers },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.any([
          AbortSignal.timeout(90000),
          ...(options.signal ? [options.signal] : []),
        ]),
      });
      return { status: response.status, data: await response.json() };
    },
    get: async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error('Сервер недоступен');
      return response.json();
    },
  },
  share: {
    json: async (name, value) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  },
  // Только пока открыта вкладка. Это НЕ фоновые напоминания Android.
  notifications: {
    schedule: async (reminder) => {
      if (!('Notification' in window)) return false;
      if ((await Notification.requestPermission()) !== 'granted') return false;
      const delay = reminder.at.getTime() - Date.now();
      if (delay < 0 || delay > 2147483647) return false;
      const previous = timers.get(reminder.id);
      if (previous) clearTimeout(previous);
      timers.set(
        reminder.id,
        setTimeout(() => {
          new Notification(reminder.title, { body: reminder.body });
          timers.delete(reminder.id);
        }, delay),
      );
      return true;
    },
    cancel: async (ids) => {
      for (const id of ids) {
        const timer = timers.get(id);
        if (timer) clearTimeout(timer);
        timers.delete(id);
      }
    },
  },
};
