import { useCallback } from 'react';

import { confirmAction } from '@/features/settings/lib/confirm';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

import { useResolveIntent } from '../hooks';
import { reviewPlace } from '../lib/view';
import type { BotMode } from '../types';

/**
 * "Resolve after review" for an entry whose order outcome is uncertain: a person confirms they
 * checked the book first (the server refuses while a position or OCO is still open), and the
 * screens update only on the server's answer. Resolving blocks further entries that day.
 */
export function useResolveFlow() {
  const { mutate, isPending, variables } = useResolveIntent();
  const resolve = useCallback(
    (entry: { intentId: string; tradingSymbol: string; mode: BotMode }) =>
      confirmAction({
        title: `Resolve ${entry.tradingSymbol}?`,
        message: `Have you checked the ${reviewPlace(entry.mode)} and confirmed this position is closed? This marks the entry resolved and blocks further entries today.`,
        confirmLabel: 'Resolve',
        onConfirm: () =>
          mutate(entry.intentId, {
            onSuccess: (note) =>
              toast.success('Entry resolved', note ?? 'No further entries today.'),
            onError: (error) => toast.error('Couldn’t resolve it', getErrorMessage(error)),
          }),
      }),
    [mutate],
  );
  return { resolve, pendingId: isPending ? variables : null };
}
