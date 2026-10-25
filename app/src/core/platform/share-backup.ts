import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
const folder = 'racionika-exports';
const retention = 24 * 60 * 60 * 1000;
export async function shareBackup(name: string, value: unknown) {
  // Android's share callback can resolve before the receiver reads the file.
  // Keep a unique private cache copy; never delete it immediately after Share.share.
  const stem = name
    .replace(/\.json$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80);
  const path = `${folder}/${stem}-${crypto.randomUUID()}.json`;
  const file = await Filesystem.writeFile({
    path,
    data: JSON.stringify(value, null, 2),
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  try {
    const { files } = await Filesystem.readdir({ path: folder, directory: Directory.Cache });
    for (const item of files) {
      if (
        item.type === 'file' &&
        /^[a-zA-Z0-9_-]+\.json$/.test(item.name) &&
        `${folder}/${item.name}` !== path &&
        item.mtime > 0 &&
        item.mtime < Date.now() - retention
      ) {
        await Filesystem.deleteFile({ path: `${folder}/${item.name}`, directory: Directory.Cache });
      }
    }
  } catch {
    /* Cache cleanup must not prevent a user from saving their backup. */
  }
  await Share.share({ url: file.uri });
}
