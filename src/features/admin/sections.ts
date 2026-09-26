import Bot from 'lucide-react-native/icons/bot';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import ChartColumn from 'lucide-react-native/icons/chart-column';
import Database from 'lucide-react-native/icons/database';
import Globe from 'lucide-react-native/icons/globe';
import HeartPulse from 'lucide-react-native/icons/heart-pulse';
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
  | 'broker-usage'
  | 'data'
  | 'users'
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
          title: 'AI usage & cost',
          subtitle: 'Spend, tokens and models',
          Icon: Bot,
          tone: 'amber',
        },
        {
          id: 'broker-usage',
          title: 'mStock API usage',
          subtitle: 'Broker calls, sockets and throttling',
          Icon: RadioTower,
          tone: 'teal',
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

export function adminSection(id: string | undefined): AdminSection | undefined {
  return id ? BY_ID.get(id as AdminSectionId) : undefined;
}
