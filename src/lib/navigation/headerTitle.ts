import { appConfig } from '@/config/app';

/**
 * Map the active group or route segments to the header title shown after the logo.
 *
 * - Trade -> "Trade"
 * - F&O -> "F&O"
 * - Markets, Intelligence, Settings (and anything unknown) -> the app's name
 */
export function getHeaderTitle(group?: string, segments?: string[]): string {
  const targetGroup =
    group ||
    (segments?.includes('(markets)')
      ? '(markets)'
      : segments?.includes('trade')
        ? 'trade'
        : segments?.includes('fno')
          ? 'fno'
          : segments?.includes('intel')
            ? 'intel'
            : segments?.includes('settings')
              ? 'settings'
              : undefined);

  if (targetGroup === 'trade') return 'Trade';
  if (targetGroup === 'fno') return 'F&O';
  return appConfig.name;
}
