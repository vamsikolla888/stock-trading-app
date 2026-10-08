import React from 'react';

import { GroupTabs } from '@/components/navigation/GroupTabs';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/** Agents: sub-screens listed in config/navigation.ts. */
export default function AgentsLayout() {
  return <GroupTabs group="agents" />;
}
