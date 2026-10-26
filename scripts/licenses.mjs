// Reproduce offline notices from installed Android/app runtime dependencies only.
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const seen = new Set();
const notices = [];
function locate(name, from) {
  let dir = from;
  while (true) {
    const file = join(dir, 'node_modules', name, 'package.json');
    if (existsSync(file)) return file;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Missing installed dependency: ${name}`);
}
function visit(file) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  seen.add(key);
  const dir = dirname(file);
  if (!pkg.name.startsWith('@racionika/')) {
    const files = readdirSync(dir).filter((name) =>
      /^(licen[sc]e|copying|notice|ofl)([.\-_]|$)/i.test(name),
    );
    const texts = files.map((name) => ({
      file: name,
      text: readFileSync(join(dir, name), 'utf8'),
    }));
    if (!texts.length) throw new Error(`Missing license text for ${key} (${relative(root, dir)})`);
    notices.push({
      name: pkg.name,
      version: pkg.version,
      license: typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license),
      texts,
    });
  }
  for (const name of Object.keys(pkg.dependencies ?? {}).sort()) visit(locate(name, dir));
}
visit(join(root, 'app/package.json'));
notices.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
writeFileSync(join(root, 'app/src/data/licenses.json'), JSON.stringify(notices, null, 2) + '\n');
console.log(`Offline runtime notices: ${notices.length}`);
