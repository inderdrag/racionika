import { describe, expect, it } from 'vitest';
import { improveUsdaName } from './localization';
describe('русские названия с проверкой исходного описания', () => {
  it('исправляет буквальные переводы фарша, корн-дога и голени', () => {
    expect(improveUsdaName('Говядина, земля, сырая', 'Beef, ground, raw')).toBe(
      'Говядина, фарш, сырая',
    );
    expect(improveUsdaName('Кукурузная собака', 'Corn dog')).toBe('Корн-дог');
    expect(improveUsdaName('Куриная барабанная палочка', 'Chicken drumstick')).toBe(
      'Куриная голень',
    );
    expect(improveUsdaName('Куриные самородки', 'Chicken nuggets')).toBe('Куриные наггетсы');
    expect(improveUsdaName('Специи, гвоздика, земля', 'Spices, cloves, ground')).toBe(
      'Гвоздика молотая',
    );
    expect(improveUsdaName('Специи, все специи, земля', 'Spices, allspice, ground')).toBe(
      'Перец душистый молотый',
    );
    expect(improveUsdaName('Кофе, земля', 'Coffee, ground')).not.toContain('фарш');
  });
  it('не меняет название без подтверждения источника и не выдаёт cottage cheese за творог', () => {
    expect(improveUsdaName('Сыр, творог, с фруктами', 'Cottage cheese with fruit')).toBe(
      'Зернёный сыр (cottage cheese), с фруктами',
    );
    expect(improveUsdaName('Творог 5%', 'Tvorog 5%')).toBe('Творог 5%');
    expect(improveUsdaName('Черноглазый горох', 'Blackeyed peas')).toBe('Черноглазый горох');
    expect(improveUsdaName('Кукурузная собака', 'Other food')).toBe('Кукурузная собака');
  });
});
