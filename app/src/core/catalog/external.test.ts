import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../platform', () => ({ getPlatform: vi.fn() }));
import { getPlatform } from '../platform';
import { parseExternalProduct, searchExternalFoods, loadExternalFood } from './external';
const product = {
  code: '3017620422003',
  product_name: 'Nutella',
  brands: 'Ferrero',
  nutrition_data_per: '100g',
  nutriments: {
    'energy-kcal_100g': 539,
    proteins_100g: 6.3,
    fat_100g: 30.9,
    carbohydrates_100g: 57.5,
  },
};
const request = vi.fn();
beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true });
  vi.mocked(getPlatform).mockResolvedValue({ http: { request } } as unknown as Awaited<
    ReturnType<typeof getPlatform>
  >);
  request.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('Разбор Open Food Facts', () => {
  it('полные КБЖУ, ID и явно внешний источник', () => {
    const p = parseExternalProduct(product)!;
    expect(p.per100.kcal).toBe(539);
    expect(p.source.provider).toBe('off');
    expect(p.name).toContain('Ferrero');
  });
  it('отсутствующие значения не превращает в нули; отвергает порции и нечисловые значения', () => {
    expect(parseExternalProduct({ ...product, nutrition_data_per: 'serving' })).toBeNull();
    expect(parseExternalProduct({ ...product, nutrition_data_per: '100ml' })).toBeNull();
    expect(
      parseExternalProduct({
        ...product,
        nutriments: { ...product.nutriments, proteins_100g: undefined },
      }),
    ).toBeNull();
    expect(
      parseExternalProduct({ ...product, nutriments: { ...product.nutriments, fat_100g: '30.9' } }),
    ).toBeNull();
    expect(
      parseExternalProduct({
        ...product,
        nutriments: { ...product.nutriments, 'energy-kcal_100g': Infinity },
      }),
    ).toBeNull();
  });
  it('переводит кДж в ккал только по явному полю energy-kj', () => {
    const n = { ...product.nutriments, 'energy-kcal_100g': undefined, 'energy-kj_100g': 418.4 };
    expect(parseExternalProduct({ ...product, nutriments: n })?.per100.kcal).toBeCloseTo(100);
    expect(
      parseExternalProduct({
        ...product,
        nutriments: { ...n, 'energy-kj_100g': undefined, energy_100g: 418.4 },
      }),
    ).toBeNull();
  });
  it('отвергает поддельные ID и невозможную сумму БЖУ', () => {
    expect(parseExternalProduct({ ...product, code: 'https://evil.test' })).toBeNull();
    expect(
      parseExternalProduct({
        ...product,
        nutriments: { ...product.nutriments, proteins_100g: 90 },
      }),
    ).toBeNull();
  });
});
describe('Внешний поиск без ИИ и профиля', () => {
  it('использует фиксированный домен, явный запрос и User-Agent; кэш не повторяет сеть', async () => {
    request.mockResolvedValue({ status: 200, data: { hits: [product] } });
    const signal = new AbortController().signal;
    const result = await searchExternalFoods('сыр проверка один', signal);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('needsDetails', true);
    const [url, options] = request.mock.calls[0];
    expect(new URL(url).origin).toBe('https://search.openfoodfacts.org');
    expect(new URL(url).searchParams.get('q')).toBe('сыр проверка один');
    expect([...new URL(url).searchParams.keys()]).toEqual(['q', 'page_size']);
    expect(options.headers['User-Agent']).toContain('Racionika');
    expect(options.body).toBeUndefined();
    await searchExternalFoods('сыр проверка один', signal);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('штрихкод обращается к карточке, неполные продукты отфильтрованы', async () => {
    vi.setSystemTime(new Date('2026-11-01T13:00:00Z'));
    request.mockResolvedValue({ status: 200, data: { status: 1, product } });
    expect(await searchExternalFoods('3017620422003', new AbortController().signal)).toHaveLength(
      1,
    );
    expect(request.mock.calls[0][0]).toContain('/api/v2/product/3017620422003.json');
  });
  it('выбор результата отдельно проверяет полную карточку и не принимает данные на порцию', async () => {
    vi.setSystemTime(new Date('2026-11-01T13:30:00Z'));
    request.mockResolvedValue({
      status: 200,
      data: { status: 1, product: { ...product, code: '12345678', nutrition_data_per: 'serving' } },
    });
    await expect(loadExternalFood('12345678', new AbortController().signal)).rejects.toThrow(
      'нет полных КБЖУ',
    );
  });
  it('не выполняет сетевой запрос без интернета', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(
      searchExternalFoods('нет сети тест', new AbortController().signal),
    ).rejects.toThrow('Нет интернета');
    expect(request).not.toHaveBeenCalled();
  });
  it('ограничивает частоту, обрабатывает 429 без автоматических повторов', async () => {
    vi.setSystemTime(new Date('2026-11-01T14:00:00Z'));
    request.mockResolvedValue({ status: 429, data: {} });
    await expect(searchExternalFoods('лимит тест', new AbortController().signal)).rejects.toThrow(
      'через минуту',
    );
    await expect(searchExternalFoods('другой тест', new AbortController().signal)).rejects.toThrow(
      'несколько секунд',
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('отмена запрещает применение результата', async () => {
    vi.setSystemTime(new Date('2026-11-01T15:00:00Z'));
    request.mockReturnValue(new Promise(() => {}));
    const c = new AbortController();
    const p = searchExternalFoods('отмена запроса', c.signal);
    await Promise.resolve();
    await Promise.resolve();
    c.abort();
    await expect(p).rejects.toThrow('отменён');
  });
  it('таймаут не оставляет вечную загрузку', async () => {
    vi.setSystemTime(new Date('2026-11-01T16:00:00Z'));
    request.mockReturnValue(new Promise(() => {}));
    const p = searchExternalFoods('долгий запрос', new AbortController().signal);
    const assertion = expect(p).rejects.toThrow('не ответил');
    await vi.advanceTimersByTimeAsync(15001);
    await assertion;
  });
});
