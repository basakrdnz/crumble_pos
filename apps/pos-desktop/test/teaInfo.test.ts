import { describe, expect, it } from 'vitest';
import { DEFAULT_HERBAL_TEAS, getHerbalTeas, isHerbalTeaProduct, setHerbalTeas } from '../src/db/teaInfo';
import { testContext } from './helpers';

describe('bitki çayı bilgisi', () => {
  it('starts with the six teas and keeps edits', () => {
    const ctx = testContext();
    expect(getHerbalTeas(ctx).map((t) => t.name)).toEqual(DEFAULT_HERBAL_TEAS.map((t) => t.name));
    setHerbalTeas(ctx, [{ name: ' Calm Tea ', ingredients: 'Lavanta' }, { name: '  ', ingredients: 'boş satır' }]);
    expect(getHerbalTeas(ctx)).toEqual([{ name: 'Calm Tea', ingredients: 'Lavanta' }]);
  });

  it('shows the "i" only on the Bitki Çayı tiles', () => {
    expect(isHerbalTeaProduct('Bitki Çayı (Küçük)')).toBe(true);
    expect(isHerbalTeaProduct('BİTKİ ÇAYI (Büyük)')).toBe(true);
    expect(isHerbalTeaProduct('Bardak Çay')).toBe(false);
  });
});
