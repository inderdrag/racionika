import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAndroidApi } from './android-config.mjs';
test('принимает корневой HTTPS-домен сервера', () => {
  assert.equal(
    validateAndroidApi(' https://racionika-test.onrender.com/ '),
    'https://racionika-test.onrender.com',
  );
});
test('не позволяет собрать APK без адреса API', () => {
  for (const value of [undefined, '', '  ', 'not a url'])
    assert.throws(() => validateAndroidApi(value));
});
test('отклоняет HTTP и локальный адрес телефона', () => {
  for (const value of [
    'http://api.example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://127.0.0.2',
    'https://192.168.1.10',
    'https://[::1]',
    'https://0.0.0.0',
    'https://app.localhost',
  ])
    assert.throws(() => validateAndroidApi(value));
});
test('отклоняет секреты и нестандартный путь в URL', () => {
  for (const value of [
    'https://user:secret@api.example.com',
    'https://api.example.com/v1',
    'https://api.example.com/?key=secret',
    'https://api.example.com/#secret',
  ])
    assert.throws(() => validateAndroidApi(value));
});
