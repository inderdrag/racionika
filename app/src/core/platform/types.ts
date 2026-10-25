import type { DailyReminder } from '../notifications/plan';
import type { Tab } from '../navigation';
export interface ScheduledReminder {
  id: number;
  title: string;
  body: string;
  at: Date;
}
export interface Platform {
  navigation: { listenBack: (onBack: () => boolean) => Promise<() => void> };
  camera: { pick: () => Promise<string | undefined> };
  secureStorage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  http: {
    get: (url: string) => Promise<unknown>;
    request: (
      url: string,
      options: {
        method: 'GET' | 'POST';
        body?: unknown;
        headers?: Record<string, string>;
        signal?: AbortSignal;
      },
    ) => Promise<{ status: number; data: unknown }>;
  };
  share: { json: (name: string, value: unknown) => Promise<void> };
  notifications: {
    replaceDaily: (
      items: DailyReminder[],
      requestPermission: boolean,
    ) => Promise<{ granted: boolean; exact: boolean }>;
    listen: (onAction: (route: Tab) => void) => Promise<() => void>;
    openExactSettings: () => Promise<void>;
    schedule: (reminder: ScheduledReminder) => Promise<boolean>;
    cancel: (ids: number[]) => Promise<void>;
  };
}
