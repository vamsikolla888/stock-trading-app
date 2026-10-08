import { HOLDER_TONE, holderColor, type HolderKey } from '@/features/company/lib/insights';
import { holderPalette } from '@/theme/tokens';

const KEYS: HolderKey[] = [
  'promoters',
  'foreignInstitutions',
  'mutualFunds',
  'otherDomestic',
  'domesticInstitutions',
  'retail',
];

describe('shareholding colours', () => {
  it('gives each category Groww’s hue, per theme (web tokens.css --holder-*)', () => {
    expect(holderColor('promoters', false)).toBe('#826dbd');
    expect(holderColor('foreignInstitutions', false)).toBe('#49a9e0');
    expect(holderColor('mutualFunds', false)).toBe('#c53b74');
    expect(holderColor('domesticInstitutions', false)).toBe('#90be76');
    expect(holderColor('retail', false)).toBe('#fb9511');
    expect(holderColor('promoters', true)).toBe('#8069bf');
    expect(holderColor('foreignInstitutions', true)).toBe('#1ba2d6');
    expect(holderColor('domesticInstitutions', true)).toBe('#82a15d');
    expect(holderColor('retail', true)).toBe('#b96408');
  });

  it('follows the category, not its position: both ways of splitting DII share olive', () => {
    expect(HOLDER_TONE.otherDomestic).toBe('dii');
    expect(HOLDER_TONE.domesticInstitutions).toBe('dii');
    expect(holderColor('otherDomestic', true)).toBe(holderColor('domesticInstitutions', true));
  });

  it('keeps the rows a quarter is shown in on distinct colours', () => {
    const detailed: HolderKey[] = [
      'promoters',
      'foreignInstitutions',
      'mutualFunds',
      'otherDomestic',
      'retail',
    ];
    const simple: HolderKey[] = [
      'promoters',
      'foreignInstitutions',
      'domesticInstitutions',
      'retail',
    ];
    for (const dark of [false, true]) {
      expect(new Set(detailed.map((k) => holderColor(k, dark))).size).toBe(detailed.length);
      expect(new Set(simple.map((k) => holderColor(k, dark))).size).toBe(simple.length);
    }
  });

  it('maps every category to a defined theme colour', () => {
    for (const key of KEYS) {
      expect(holderPalette.light[HOLDER_TONE[key]]).toMatch(/^#[0-9a-f]{6}$/);
      expect(holderPalette.dark[HOLDER_TONE[key]]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
