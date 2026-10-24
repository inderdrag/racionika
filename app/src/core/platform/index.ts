import { Capacitor } from '@capacitor/core';
import { webPlatform } from './web';
import type { Platform } from './types';
let current: Promise<Platform> | undefined;
export function getPlatform(): Promise<Platform> {
  current ??= Capacitor.isNativePlatform()
    ? import('./native').then((module) => module.nativePlatform)
    : Promise.resolve(webPlatform);
  return current;
}
