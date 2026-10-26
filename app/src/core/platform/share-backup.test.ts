import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  readdir: vi.fn(),
  deleteFile: vi.fn(),
  share: vi.fn(),
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: mocks,
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }));
import { shareBackup } from './share-backup';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.writeFile.mockResolvedValue({ uri: 'file:///private/cache/export.json' });
  mocks.readdir.mockResolvedValue({ files: [] });
  mocks.share.mockResolvedValue(undefined);
});
it('не удаляет файл сразу после share: получатель Android ещё может читать URI', async () => {
  await shareBackup('racionika-day.json', { schemaVersion: 3 });
  expect(mocks.writeFile.mock.calls[0][0]).toMatchObject({ directory: 'CACHE', recursive: true });
  expect(mocks.share).toHaveBeenCalledWith({ url: 'file:///private/cache/export.json' });
  expect(mocks.deleteFile).not.toHaveBeenCalled();
});
it('каждый экспорт имеет отдельный путь, не перезаписывает незавершённый', async () => {
  await shareBackup('racionika-day.json', {});
  await shareBackup('racionika-day.json', {});
  expect(mocks.writeFile.mock.calls[0][0].path).not.toBe(mocks.writeFile.mock.calls[1][0].path);
});
it('очищает только старые JSON в своём каталоге, не свежую копию', async () => {
  const old = Date.now() - 25 * 60 * 60 * 1000;
  mocks.readdir.mockResolvedValue({
    files: [
      { name: 'racionika-old.json', type: 'file', mtime: old },
      { name: 'racionika-fresh.json', type: 'file', mtime: Date.now() },
      { name: 'other.txt', type: 'file', mtime: old },
    ],
  });
  await shareBackup('racionika-day.json', {});
  expect(mocks.deleteFile).toHaveBeenCalledExactlyOnceWith({
    path: 'racionika-exports/racionika-old.json',
    directory: 'CACHE',
  });
});
it('ошибка очистки кеша не блокирует резервное копирование', async () => {
  mocks.readdir.mockRejectedValue(new Error('unavailable'));
  await shareBackup('racionika-day.json', {});
  expect(mocks.share).toHaveBeenCalledOnce();
});
it('при ошибке записи не сообщает об успешном экспорте', async () => {
  mocks.writeFile.mockRejectedValue(new Error('disk full'));
  await expect(shareBackup('racionika-day.json', {})).rejects.toThrow('disk full');
  expect(mocks.share).not.toHaveBeenCalled();
});
it('сохраняет CSV в отдельном файле UTF-8 и не удаляет его до чтения получателем', async () => {
  const { shareText } = await import('./share-backup');
  await shareText('../report.csv', '\uFEFF"Блюдо";"ккал"\r\n');
  expect(mocks.writeFile.mock.calls[0][0]).toMatchObject({
    data: '\uFEFF"Блюдо";"ккал"\r\n',
    encoding: 'utf8',
  });
  expect(mocks.writeFile.mock.calls[0][0].path).toMatch(/^racionika-exports\/[a-zA-Z0-9_-]+\.csv$/);
  expect(mocks.deleteFile).not.toHaveBeenCalled();
});
