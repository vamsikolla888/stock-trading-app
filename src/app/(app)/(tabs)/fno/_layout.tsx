import React from 'react';

import { GroupTabs } from '@/components/navigation/GroupTabs';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/** F&O: sub-screens listed in config/navigation.ts. */
export default function FnoLayout() {
  return <GroupTabs group="fno" />;
}
