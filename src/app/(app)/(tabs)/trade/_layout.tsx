import React from 'react';

import { GroupTabs } from '@/components/navigation/GroupTabs';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/** Trade: sub-screens listed in config/navigation.ts. */
export default function TradeLayout() {
  return <GroupTabs group="trade" />;
}
