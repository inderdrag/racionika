import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { DailyReminder } from './plan';
import type { ReminderProgress } from './progress';
import type { Tab } from '../navigation';
export const NativeReminders = registerPlugin<{
  testDelivery(): Promise<{ batterySaving: boolean; restricted: boolean }>;
  configure(input: { items: DailyReminder[]; progress?: ReminderProgress }): Promise<void>;
  syncProgress(input: ReminderProgress): Promise<void>;
  addListener(
    event: 'action',
    listener: (event: { route: Tab }) => void,
  ): Promise<PluginListenerHandle>;
}>('RacionikaReminders');
