import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requestPermissions: vi.fn(),
  checkPermissions: vi.fn(),
  checkExactNotificationSetting: vi.fn(),
  createChannel: vi.fn(),
  getAll: vi.fn(),
  cancel: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: mocks }));
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
    expect(mocks.schedule.mock.calls[0][0].notifications[0]).toMatchObject({
      id: item.id,
      isExactNotification: false,
      extra: { route: 'diary' },
      schedule: { on: { hour: 8, minute: 0 }, repeats: true, allowWhileIdle: true },
    });
  });
  it('восстанавливает предыдущее расписание при ошибке записи нового', async () => {
    mocks.schedule.mockRejectedValueOnce(new Error('Android error'));
    await expect(nativePlatform.notifications.replaceDaily([item], true)).rejects.toThrow(
      'восстановлено',
    );
    expect(mocks.schedule).toHaveBeenLastCalledWith({ notifications: [old] });
  });
  it('отключает уведомления без нового запроса разрешения', async () => {
    await nativePlatform.notifications.replaceDaily([], false);
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: old.id }] });
  });
});
