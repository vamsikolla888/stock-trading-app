import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { indexLogo, indexLogoKey, type IndexLogoKey } from '../lib/indexLogo';

const LOGOS = join(__dirname, '../../../assets/images/index-logos');
const KEYS: IndexLogoKey[] = [
  'NIFTY',
  'BANKNIFTY',
  'FINNIFTY',
  'MIDCPNIFTY',
  'SENSEX',
  'BANKEX',
  'NSE',
  'BSE',
];

describe('indexLogoKey', () => {
  it('gives the six indices Groww draws an icon for their own logo', () => {
    for (const u of ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX']) {
      expect(indexLogoKey(u)).toBe(u);
      expect(indexLogoKey(u.toLowerCase(), 'NFO')).toBe(u);
    }
  });

  it('gives any other index its exchange’s mark: NSE by default, BSE for a BSE index', () => {
    expect(indexLogoKey('NIFTYNXT50')).toBe('NSE');
    expect(indexLogoKey('NIFTYFPI', 'NFO')).toBe('NSE');
    expect(indexLogoKey('SENSEX50')).toBe('BSE');
    expect(indexLogoKey('SOMEBSEINDEX', 'BFO')).toBe('BSE');
    expect(indexLogoKey('BSE100')).toBe('BSE');
    expect(indexLogoKey('OTHER', 'BSE')).toBe('BSE');
    expect(indexLogoKey('OTHER', null)).toBe('NSE');
  });
});

describe('the bundled logos', () => {
  it('every key it can name resolves to a bundled image', () => {
    for (const key of KEYS) {
      expect(indexLogo(key)).toBeTruthy();
      expect(existsSync(join(LOGOS, `${key}.png`))).toBe(true);
    }
  });

  it('ships real PNG files', () => {
    for (const key of KEYS) {
      const bytes = readFileSync(join(LOGOS, `${key}.png`));
      expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
    }
  });
});
