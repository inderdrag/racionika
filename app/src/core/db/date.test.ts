import { expect, it } from 'vitest';
import { localDay } from './index';
it('строит локальную дату, не UTC', () =>
  expect(localDay(new Date(2026, 9, 24, 0, 15))).toBe('2026-10-24'));
