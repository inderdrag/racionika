import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rows: [[], [], [], [], []] as unknown[][], fail: false }));
vi.mock('./db', () => {
  const table = (index: number) => ({
    toArray: async () => structuredClone(mock.rows[index]),
    bulkGet: async (ids: string[]) =>
      ids.map((id) => mock.rows[index].find((x) => (x as { id: string }).id === id)),
    bulkPut: async (rows: { id: string }[]) => {
      if (mock.fail) throw new Error('disk full');
      for (const row of rows) {
        const i = mock.rows[index].findIndex((x) => (x as { id: string }).id === row.id);
        if (i < 0) mock.rows[index].push(row);
        else mock.rows[index][i] = row;
      }
    },
  });
  return {
    db: {
      foodEntries: table(0),
      waterLogs: table(1),
      chatMessages: table(2),
      weightLogs: table(3),
      favoriteDishes: table(4),
      transaction: async (_mode: unknown, _tables: unknown, fn: () => unknown) => fn(),
    },
  };
});
import { exportBackup, readBackup, parseBackup, mergeBackup } from './backup';
const profile = {
  version: 1,
  name: 'Тест',
  sex: 'male',
  age: 30,
  height: 180,
  weight: 80,
  activity: '1.2',
  goal: 'maintain',
  targetWeight: 80,
  pace: 0.5,
  individualCare: false,
  updatedAt: '2026-10-24T12:00:00Z',
};
let store: Map<string, string>;
beforeEach(() => {
  mock.rows = [[], [], [], [], []];
  mock.fail = false;
  store = new Map([['racionika.profile', JSON.stringify(profile)]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
});
afterEach(() => vi.unstubAllGlobals());
it('v5 проходит повторную проверку, не содержит токенов или согласия', async () => {
  store.set('racionika.aiConsent', 'v2');
  store.set('token', 'private');
  const backup = await exportBackup();
  expect(backup.schemaVersion).toBe(5);
  expect(backup.integrity?.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(await readBackup(JSON.stringify(backup, null, 2))).toEqual(backup);
  expect(JSON.stringify(backup)).not.toContain('private');
  expect(backup).not.toHaveProperty('consent');
});
it('отклоняет изменённый файл и v5 без контрольной суммы до записи', async () => {
  const backup = await exportBackup();
  backup.profile!.weight = 81;
  await expect(readBackup(JSON.stringify(backup))).rejects.toThrow('сумма');
  await expect(mergeBackup(backup)).rejects.toThrow('сумма');
  delete backup.integrity;
  await expect(readBackup(JSON.stringify(backup))).rejects.toThrow('сумма');
});
it('оставляет профиль и настройки телефона по умолчанию, восстанавливает только явно', async () => {
  const backup = await exportBackup();
  store.set('racionika.profile', JSON.stringify({ ...profile, name: 'Другой' }));
  await mergeBackup(backup);
  expect(JSON.parse(store.get('racionika.profile')!).name).toBe('Другой');
  await mergeBackup(backup, { restoreProfile: true, restoreSettings: true });
  expect(JSON.parse(store.get('racionika.profile')!).name).toBe('Тест');
  expect(store.get('racionika.preferences')).toBeDefined();
  expect(store.has('racionika.aiConsent')).toBe(false);
  expect(store.has('racionika.reminders')).toBe(false);
});
it('конфликт ID: по выбору оставляет существующую запись, повторный импорт идемпотентен', async () => {
  const backup = parseBackup(
    JSON.stringify({
      schemaVersion: 4,
      foodEntries: [],
      waterLogs: [{ id: 'water', day: '2026-10-24', ml: 250, createdAt: '2026-10-24T12:00:00Z' }],
    }),
  );
  mock.rows[1] = [{ ...backup.waterLogs[0], ml: 100 }];
  await mergeBackup(backup, { keepExisting: true });
  expect(mock.rows[1][0]).toMatchObject({ ml: 100 });
  await mergeBackup(backup);
  await mergeBackup(backup);
  expect(mock.rows[1]).toHaveLength(1);
  expect(mock.rows[1][0]).toMatchObject({ ml: 250 });
});
it('дубли внутри файла не принимаются', () => {
  const water = { id: 'same', day: '2026-10-24', ml: 100, createdAt: '2026-10-24T12:00:00Z' };
  expect(() =>
    parseBackup(JSON.stringify({ schemaVersion: 4, foodEntries: [], waterLogs: [water, water] })),
  ).toThrow('ID');
});
it('ошибка БД не изменяет профиль и настройки', async () => {
  const backup = await exportBackup();
  store.set('racionika.profile', 'unchanged');
  mock.fail = true;
  await expect(
    mergeBackup(backup, { restoreProfile: true, restoreSettings: true }),
  ).rejects.toThrow('disk full');
  expect(store.get('racionika.profile')).toBe('unchanged');
});
