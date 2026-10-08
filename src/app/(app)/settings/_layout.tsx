import React from 'react';

import { GroupTabs } from '@/components/navigation/GroupTabs';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/** Settings: sub-screens listed in config/navigation.ts. */
export default function SettingsLayout() {
  return <GroupTabs group="settings" />;
}
