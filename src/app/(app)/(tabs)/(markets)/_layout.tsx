import React from 'react';

import { GroupTabs } from '@/components/navigation/GroupTabs';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/** Markets: sub-screens listed in config/navigation.ts. */
export default function MarketsLayout() {
  return <GroupTabs group="(markets)" />;
}
