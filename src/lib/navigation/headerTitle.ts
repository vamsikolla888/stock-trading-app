import { appConfig } from '@/config/app';

/** Groups whose app bar names the group instead of the app. */
const GROUP_TITLES: Readonly<Record<string, string>> = {
  trade: 'Trade',
  fno: 'F&O',
  agents: 'Agents',
};

const GROUP_SEGMENTS = ['(markets)', 'trade', 'fno', 'intel', 'agents', 'settings'] as const;

/**
 * Map the active group or route segments to the header title shown after the logo.
 *
 * - Trade -> "Trade", F&O -> "F&O", Agents -> "Agents"
 * - Markets, Intelligence (and anything unknown) -> the app's name
 */
export function getHeaderTitle(group?: string, segments?: string[]): string {
  const targetGroup = group || GROUP_SEGMENTS.find((segment) => segments?.includes(segment));
  return (targetGroup && GROUP_TITLES[targetGroup]) || appConfig.name;
}
