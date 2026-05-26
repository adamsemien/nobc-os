import { describe, it, expect } from 'vitest';
import { ASSET_SORTS, parseAssetQuery, type AssetSort } from '@/lib/dam/search';

describe('parseAssetQuery', () => {
  it('defaults sort to date and view to active', () => {
    const p = parseAssetQuery(new URLSearchParams(''));
    expect(p.sort).toBe('date');
    expect(p.view).toBe('active');
  });

  it('clamps an unknown sort to date', () => {
    expect(parseAssetQuery(new URLSearchParams('sort=bogus')).sort).toBe('date');
  });

  it('parses filters and trims search', () => {
    const p = parseAssetQuery(
      new URLSearchParams(
        'eventId=e1&fileType=PHOTO&isSelect=true&sponsor=Acme&tag=rooftop&q=%20sunset%20&view=trash',
      ),
    );
    expect(p).toMatchObject({
      eventId: 'e1',
      fileType: 'PHOTO',
      isSelect: true,
      sponsor: 'Acme',
      tag: 'rooftop',
      q: 'sunset',
      view: 'trash',
    });
  });

  it('ignores an invalid fileType', () => {
    expect(parseAssetQuery(new URLSearchParams('fileType=GIF')).fileType).toBeUndefined();
  });
});

describe('ASSET_SORTS', () => {
  it('maps every sort key to an ORDER BY fragment', () => {
    const keys: AssetSort[] = ['date', 'event', 'sponsor', 'fileType', 'selects', 'quality', 'manual'];
    for (const key of keys) expect(ASSET_SORTS[key]).toBeTruthy();
  });
});
