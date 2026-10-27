import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requestPermissions: vi.fn(),
  checkPermissions: vi.fn(),
  checkExactNotificationSetting: vi.fn(),
  createChannel: vi.fn(),
  getAll: vi.fn(),
  cancel: vi.fn(),
  schedule: vi.fn(),
  getPhoto: vi.fn(),
  addListener: vi.fn(),
  exitApp: vi.fn(),
  configure: vi.fn(),
  syncProgress: vi.fn(),
  nativeListener: vi.fn(),
}));
vi.mock('../notifications/native-reminders', () => ({
  NativeReminders: {
    configure: mocks.configure,
    syncProgress: mocks.syncProgress,
    addListener: mocks.nativeListener,
  },
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mocks }));
vi.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: mocks.getPhoto },
  CameraResultType: { DataUrl: 'dataUrl' },
  CameraSource: { Camera: 'CAMERA' },
}));
vi.mock('@capacitor/app', () => ({
  App: { addListener: mocks.addListener, exitApp: mocks.exitApp },
}));
import { nativePlatform } from './native';
const old = {
  id: 10001,
  title: 'Старое',
  body: 'Напоминание',
  schedule: { on: { hour: 8, minute: 0 }, repeats: true },
};
const item = {
  id: 10480,
  title: 'Еда',
  body: 'Время поесть',
  hour: 8,
  minute: 0,
  channel: 'meals' as const,
  route: 'diary' as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requestPermissions.mockResolvedValue({ display: 'granted' });
  mocks.checkPermissions.mockResolvedValue({ display: 'granted' });
  mocks.checkExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' });
  mocks.getAll.mockResolvedValue({ notifications: [old, { id: 5, title: 'Не наше' }] });
  mocks.cancel.mockResolvedValue(undefined);
  mocks.schedule.mockResolvedValue(undefined);
  mocks.configure.mockResolvedValue(undefined);
  mocks.syncProgress.mockResolvedValue(undefined);
  mocks.nativeListener.mockResolvedValue({ remove: vi.fn() });
});
describe('Нативное расписание (подставной Android API)', () => {
  it('при отказе разрешения сохраняет старые будильники', async () => {
    mocks.requestPermissions.mockResolvedValue({ display: 'denied' });
    expect(await nativePlatform.notifications.replaceDaily([item], true)).toEqual({
      granted: false,
      exact: false,
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('заменяет только свои ID и не открывает точные будильники автоматически', async () => {
    await nativePlatform.notifications.replaceDaily([item], false);
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: old.id }] });
    expect(mocks.configure).toHaveBeenCalledWith({ items: [item] });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it('при сбое нативного расписания не удаляет прежние Capacitor-будильники', async () => {
    mocks.configure.mockRejectedValueOnce(new Error('Storage failed'));
    await expect(nativePlatform.notifications.replaceDaily([item], true)).rejects.toThrow(
      'Storage failed',
    );
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('отключает уведомления без нового запроса разрешения', async () => {
    await nativePlatform.notifications.replaceDaily([], false);
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.configure).toHaveBeenCalledWith({ items: [] });
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: old.id }] });
  });
});

describe('Камера Android (подставной API)', () => {
  it('возвращает выбранное фото без отправки в сеть', async () => {
    mocks.getPhoto.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,fixture' });
    expect(await nativePlatform.camera.capture()).toBe('data:image/jpeg;base64,fixture');
    expect(mocks.getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'CAMERA', saveToGallery: false, allowEditing: false }),
    );
  });
  it('не открывает камеру после отмены запроса', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(nativePlatform.camera.capture(controller.signal)).rejects.toThrow();
    expect(mocks.getPhoto).not.toHaveBeenCalled();
  });
  it('не возвращает снимок после закрытия окна запроса', async () => {
    const controller = new AbortController();
    mocks.getPhoto.mockImplementation(async () => {
      controller.abort();
      return { dataUrl: 'data:image/jpeg;base64,fixture' };
    });
    await expect(nativePlatform.camera.capture(controller.signal)).rejects.toThrow();
  });
  it('отмена пользователем не является ошибкой', async () => {
    mocks.getPhoto.mockRejectedValue(new Error('User cancelled photos app'));
    expect(await nativePlatform.camera.capture()).toBeUndefined();
  });
  it('отказ разрешения и сбой камеры не маскируются под отмену', async () => {
    for (const message of ['Camera permission denied', 'Camera not available']) {
      mocks.getPhoto.mockRejectedValue({ message });
      await expect(nativePlatform.camera.capture()).rejects.toThrow('Проверьте разрешения');
    }
  });
});
describe('Системная кнопка Назад (подставной API)', () => {
  it('сначала даёт интерфейсу закрыть диалог, не завершает приложение', async () => {
    const remove = vi.fn();
    mocks.addListener.mockResolvedValue({ remove });
    const handler = vi.fn(() => true);
    const cleanup = await nativePlatform.navigation.listenBack(handler);
    const callback = mocks.addListener.mock.calls[0][1];
    callback({ canGoBack: false });
    expect(handler).toHaveBeenCalledOnce();
    expect(mocks.exitApp).not.toHaveBeenCalled();
    cleanup();
    expect(remove).toHaveBeenCalledOnce();
  });
  it('на корневом экране оставляет штатный выход из приложения', async () => {
    mocks.addListener.mockResolvedValue({ remove: vi.fn() });
    await nativePlatform.navigation.listenBack(() => false);
    mocks.addListener.mock.calls[0][1]({ canGoBack: false });
    expect(mocks.exitApp).toHaveBeenCalledOnce();
  });
});
