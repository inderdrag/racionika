import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Capacitor CLI currently uses xcode 3.x. Its uuid override must preserve v4/CJS.
const appRequire = createRequire(new URL('../app/package.json', import.meta.url));
const cliRequire = createRequire(appRequire.resolve('@capacitor/cli/package.json'));
test('Capacitor xcode UUID generation remains compatible with patched uuid', () => {
  const xcode = cliRequire('xcode');
  const project = xcode.project('unused-smoke-project.pbxproj');
  project.hash = { project: { objects: {} } };
  const values = Array.from({ length: 100 }, () => project.generateUuid());
  for (const value of values) assert.match(value, /^[A-F0-9]{24}$/);
  assert.equal(new Set(values).size, values.length);
});
