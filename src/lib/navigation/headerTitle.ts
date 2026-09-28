/**
 * Map the active group or route segments to the header title shown after the logo.
 *
 * - Markets -> "Stocks"
 * - Trade -> "Trade"
 * - F&O -> "F&O"
 * - Intelligence -> "Stocks"
 * - Settings -> "Stocks"
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

  if (targetGroup === '(markets)' || targetGroup === 'markets') return 'Stocks';
  if (targetGroup === 'trade') return 'Trade';
  if (targetGroup === 'fno') return 'F&O';
  if (targetGroup === 'intel' || targetGroup === 'intelligence') return 'Stocks';
  if (targetGroup === 'settings') return 'Stocks';
  return 'Stocks';
}
