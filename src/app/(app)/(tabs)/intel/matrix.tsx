import React from 'react';

import { InlineEmpty } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';

// PORT-PENDING: replaced by the mobile port of the web screen.
export default function StrategyMatrixScreen() {
  return (
    <GroupScreen>
      <InlineEmpty title="Strategy matrix" message="This screen is being built." />
    </GroupScreen>
  );
}
