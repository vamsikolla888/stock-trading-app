import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { Panel } from '@/components/dashboard/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePaperFnoWallet } from '@/features/derivatives/hooks';
import { useActivePaperProfile, usePaperWallet } from '@/features/paper/hooks';
import { FigureStrip, PanelLink } from '@/features/settings/components/SettingRow';
import { walletFigures, walletNote } from '@/features/settings/lib/preferences';
import { formatINR } from '@/lib/utils/formatters';
import { isServerOutdated } from '@/services/api/contract';

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mt-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
      {children}
    </Text>
  );
}

function WalletSkeleton() {
  return <Skeleton height={62} className="rounded-field" />;
}

/**
 * Preferences › Paper wallet (web: PaperWalletSettings) — what the cash paper account holds, for
 * the profile the paper screen last used. Changing it lives on the paper screen's Funds tab,
 * where its effect on cash is spelled out before saving; this is the summary and the way there.
 */
export function PaperWalletPanel() {
  const router = useRouter();
  const { profiles, active, profileId } = useActivePaperProfile();
  // Wait for the profile list so the wallet is read once, for the right profile.
  const ready = profiles.data !== undefined || profiles.isError;
  const wallet = usePaperWallet(profileId, ready);
  const data = wallet.data;
  if (!data && isServerOutdated(wallet.error)) return null;
  const note = data ? walletNote(data) : null;
  const named = (profiles.data?.length ?? 0) > 1 && active ? active.name : null;

  return (
    <Panel
      title="Paper wallet"
      meta={named ? `${named} profile` : 'delivery + intraday, one balance'}
      right={
        <PanelLink
          label="Manage"
          accessibilityLabel="Manage the paper wallet"
          onPress={() => router.navigate({ pathname: '/trade/paper', params: { tab: 'funds' } })}
        />
      }
    >
      {!ready || wallet.isPending ? (
        <WalletSkeleton />
      ) : !data ? (
        <InlineError
          what="the paper wallet"
          error={wallet.error}
          onRetry={() => void wallet.refetch()}
        />
      ) : (
        <View>
          <FigureStrip items={walletFigures(data)} />
          {note ? <Note>{note}</Note> : null}
        </View>
      )}
    </Panel>
  );
}

/**
 * Preferences › F&O paper wallet (web: FnoWalletSettings) — the options/futures sandbox's own
 * pool, separate from the cash paper wallet so an F&O experiment never touches the book it is
 * judged against. Changed on F&O › Paper.
 */
export function FnoWalletPanel() {
  const router = useRouter();
  const wallet = usePaperFnoWallet();
  const data = wallet.data;
  if (!data && isServerOutdated(wallet.error)) return null;
  const note = data ? walletNote(data) : null;
  const margin = data && Number.isFinite(data.marginBlocked) ? data.marginBlocked : 0;

  return (
    <Panel
      title="F&O paper wallet"
      meta="separate pool"
      right={
        <PanelLink
          label="Manage"
          accessibilityLabel="Manage the F&O paper wallet"
          onPress={() => router.navigate('/fno/paper')}
        />
      }
    >
      {wallet.isPending ? (
        <WalletSkeleton />
      ) : !data ? (
        <InlineError
          what="the F&O paper wallet"
          error={wallet.error}
          onRetry={() => void wallet.refetch()}
        />
      ) : (
        <View>
          <FigureStrip items={walletFigures(data)} />
          {margin > 0 ? (
            <Note>{formatINR(margin, 0)} is set aside as margin for open positions.</Note>
          ) : null}
          {note ? <Note>{note}</Note> : null}
        </View>
      )}
    </Panel>
  );
}
