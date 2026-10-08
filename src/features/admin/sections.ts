import Bot from 'lucide-react-native/icons/bot';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import ChartColumn from 'lucide-react-native/icons/chart-column';
import Database from 'lucide-react-native/icons/database';
import Gauge from 'lucide-react-native/icons/gauge';
import Globe from 'lucide-react-native/icons/globe';
import HeartPulse from 'lucide-react-native/icons/heart-pulse';
import KeyRound from 'lucide-react-native/icons/key-round';
import Power from 'lucide-react-native/icons/power';
import RadioTower from 'lucide-react-native/icons/radio-tower';
import ScrollText from 'lucide-react-native/icons/scroll-text';
import Users from 'lucide-react-native/icons/users';

import type { IconComponent } from '@/components/ui/icon';
import type { IconTone } from '@/components/ui/IconTile';

export type AdminSectionId =
  | 'health'
  | 'analytics'
  | 'logs'
  | 'jobs'
  | 'browser-research'
  | 'ai'
  | 'api-usage'
  | 'fundamentals'
  | 'data'
  | 'users'
  | 'groww-token'
  | 'trading';

export interface AdminSection {
  id: AdminSectionId;
  title: string;
  subtitle: string;
  Icon: IconComponent;
  tone: IconTone;
}

/** The web console's tabs, grouped as on the web (Operations · Intelligence · Control). */
export const ADMIN_SECTION_GROUPS: readonly { title: string; sections: readonly AdminSection[] }[] =
  [
    {
      title: 'Operations',
      sections: [
        {
          id: 'health',
          title: 'Service health',
          subtitle: 'Dependency checks and uptime history',
          Icon: HeartPulse,
          tone: 'green',
        },
        {
          id: 'analytics',
          title: 'Server analytics',
          subtitle: 'Traffic, latency and process vitals',
          Icon: ChartColumn,
          tone: 'blue',
        },
        {
          id: 'logs',
          title: 'Logs',
          subtitle: 'Recent server log lines',
          Icon: ScrollText,
          tone: 'slate',
        },
        {
          id: 'jobs',
          title: 'Jobs & schedules',
          subtitle: 'Crons, queues and job history',
          Icon: CalendarClock,
          tone: 'violet',
        },
        {
          id: 'browser-research',
          title: 'Browser research',
          subtitle: 'Chrome connection and research runs',
          Icon: Globe,
          tone: 'teal',
        },
      ],
    },
    {
      title: 'Intelligence',
      sections: [
        {
          id: 'ai',
          title: 'AI usage',
          subtitle: 'Ollama tokens, OpenAI spend, by model',
          Icon: Bot,
          tone: 'amber',
        },
        {
          id: 'api-usage',
          title: 'Third-party API usage',
          subtitle: 'mStock and Groww calls, rate limits, live feeds',
          Icon: RadioTower,
          tone: 'teal',
        },
        {
          id: 'fundamentals',
          title: 'Fundamental analysis',
          subtitle: 'Weekly batch, queues and failed jobs',
          Icon: Gauge,
          tone: 'green',
        },
        {
          id: 'data',
          title: 'Data sources',
          subtitle: 'Feed freshness and catalog upkeep',
          Icon: Database,
          tone: 'blue',
        },
      ],
    },
    {
      title: 'Control',
      sections: [
        {
          id: 'users',
          title: 'Users & access',
          subtitle: 'Approve sign-ups and assign roles',
          Icon: Users,
          tone: 'green',
        },
        {
          id: 'groww-token',
          title: 'Groww access token',
          subtitle: 'Your own token, behind an emailed code',
          Icon: KeyRound,
          tone: 'amber',
        },
        {
          id: 'trading',
          title: 'Trading controls',
          subtitle: 'Live trading switch and kill switch',
          Icon: Power,
          tone: 'rose',
        },
      ],
    },
  ];

const BY_ID = new Map(
  ADMIN_SECTION_GROUPS.flatMap((group) => group.sections).map((section) => [section.id, section]),
);

/**
 * Sections that were renamed, mapped to where their content went, so an old link (a bookmark, a
 * notification, a deep link) still opens the right screen.
 */
const ALIASES: Readonly<Record<string, AdminSectionId>> = {
  // mStock-only usage became one screen for every third-party API (mStock and Groww).
  'broker-usage': 'api-usage',
};

/** The section a route param names — an alias resolves, case is ignored, anything else is undefined. */
export function adminSection(id: string | undefined): AdminSection | undefined {
  if (!id) return undefined;
  const key = id.toLowerCase();
  const alias = ALIASES[key];
  return BY_ID.get(key as AdminSectionId) ?? (alias ? BY_ID.get(alias) : undefined);
}
