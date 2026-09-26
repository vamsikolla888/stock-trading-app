import React from 'react';

import { InlineEmpty } from '@/components/common/InlineError';
import { StackScreen } from '@/components/navigation/StackScreen';

// PORT-PENDING: replaced by the mobile port of the web screen.
export default function PaperOptionChainScreen() {
  return (
    <StackScreen title="Paper option chain">
      <InlineEmpty title="Paper option chain" message="This screen is being built." />
    </StackScreen>
  );
}
