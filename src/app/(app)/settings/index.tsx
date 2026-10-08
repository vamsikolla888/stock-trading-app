import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { StatTile } from '@/components/dashboard/StatTile';
import { Grid } from '@/components/layout/Grid';
import { useScreenLayout } from '@/components/layout/responsive';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { accountKeys, useSafeMode } from '@/features/account/hooks';
import { derivativesKeys } from '@/features/derivatives/hooks';
import { paperKeys } from '@/features/paper/keys';
import { AccountPanel } from '@/features/settings/components/preferences/AccountPanel';
import {
  AboutPanel,
  AppearancePanel,
} from '@/features/settings/components/preferences/AppearancePanel';
import { ConnectionsPanel } from '@/features/settings/components/preferences/ConnectionsPanel';
import { NotificationsPanel } from '@/features/settings/components/preferences/NotificationsPanel';
import { SafeguardsPanel } from '@/features/settings/components/preferences/SafeguardsPanel';
import {
  FnoWalletPanel,
  PaperWalletPanel,
} from '@/features/settings/components/preferences/WalletPanels';
import { FlashFrame } from '@/features/settings/components/SettingRow';
import {
  glanceTiles,
  INDEX_BOT_CONTROLS,
  liveOrderState,
  prefLayout,
  sectionTarget,
  type PrefPanelId,
} from '@/features/settings/lib/preferences';
import { usePushState } from '@/features/settings/push';
import {
  tradingKeys,
  useBrokerCatalog,
  useBrokerConnections,
  useKillSwitch,
  useLiveTradingSettings,
} from '@/features/trading/hooks';
import { isServerOutdated } from '@/services/api/contract';
import { useTheme } from '@/theme/ThemeProvider';

/** How long a panel stays outlined after a deep link or a glance tile lands on it. */
const FLASH_MS = 2_000;

/**
 * Settings › Preferences (web: Settings → Preferences). Everything about YOUR account on one
 * page: four statuses worth knowing at a glance, then each group of settings as a quiet panel.
 * One column on a phone; a wider window adds columns (lib/preferences.ts PANEL_LAYOUT) instead
 * of stretching one, so a tablet shows every setting at once.
 *
 * `?section=<id>` (old links from the paper screens, F&O and the agent docs) scrolls to that
 * panel and outlines it; `?section=automation` goes to the index bot, which is an agent now.
 */
export default function PreferencesRoute() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const target = useMemo(() => sectionTarget(params.section), [params.section]);
  if (target && 'redirect' in target) return <IndexBotRedirect />;
  return <PreferencesScreen focus={target?.panel ?? null} />;
}

/** The index bot's switch moved to Agents › Index trading › Controls. */
function IndexBotRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(INDEX_BOT_CONTROLS);
  }, [router]);
  return null;
}

function PreferencesScreen({ focus }: { focus: PrefPanelId | null }) {
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const queryClient = useQueryClient();
  const connections = useBrokerConnections();
  const catalog = useBrokerCatalog();
  const live = useLiveTradingSettings();
  const kill = useKillSwitch();
  const safeMode = useSafeMode();
  const push = usePushState();

  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const panelRefs = useRef<Partial<Record<PrefPanelId, View | null>>>({});
  const [flash, setFlash] = useState<PrefPanelId | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /** Scrolls a panel to the top of the window and outlines it for a moment. */
  const show = useCallback((id: PrefPanelId) => {
    const node = panelRefs.current[id];
    const content = contentRef.current;
    if (node && content) {
      node.measureLayout(
        content,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }),
        () => undefined,
      );
    }
    setFlash(id);
  }, []);

  // After the first layout pass, so the panels above the target already have their heights.
  useEffect(() => {
    if (!focus) return undefined;
    const timer = setTimeout(() => show(focus), 350);
    return () => clearTimeout(timer);
  }, [focus, show]);

  useEffect(() => {
    if (!flash) return undefined;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountKeys.all }),
        queryClient.invalidateQueries({ queryKey: tradingKeys.connections }),
        queryClient.invalidateQueries({ queryKey: tradingKeys.liveSettings }),
        queryClient.invalidateQueries({ queryKey: tradingKeys.killSwitch }),
        queryClient.invalidateQueries({ queryKey: paperKeys.profiles }),
        queryClient.invalidateQueries({ queryKey: ['paper', 'wallet'] }),
        queryClient.invalidateQueries({ queryKey: derivativesKeys.wallet() }),
        catalog.isError ? catalog.refetch() : null,
        push.refresh(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // A server that predates Safe Mode has no switch — and nothing it can block an order with.
  const safeUnsupported = !safeMode.data && isServerOutdated(safeMode.error);
  const orders = liveOrderState({
    platformOn: live.data?.enabled,
    killEngaged: kill.data?.engaged,
    safeMode: safeMode.data?.enabled ?? (safeUnsupported ? false : undefined),
  });
  const tiles = glanceTiles({
    connections: connections.data,
    connectionsFailed: connections.isError,
    catalog: catalog.data,
    orders,
    ordersFailed:
      (!live.data && live.isError) ||
      (!kill.data && kill.isError) ||
      (!safeMode.data && safeMode.isError && !safeUnsupported),
    safeMode: {
      enabled: safeMode.data?.enabled,
      failed: safeMode.isError,
      unsupported: safeUnsupported,
    },
    notification: push.word,
    devices: push.devices.data?.devices.length ?? null,
  });

  const panels: Record<PrefPanelId, React.ReactNode> = {
    account: <AccountPanel />,
    safeguards: <SafeguardsPanel />,
    connections: <ConnectionsPanel />,
    paper: <PaperWalletPanel />,
    'fno-wallet': <FnoWalletPanel />,
    notifications: <NotificationsPanel push={push} />,
    appearance: <AppearancePanel />,
    about: <AboutPanel />,
  };
  const columns = prefLayout(layout.columns);
  const gap = layout.compact ? 14 : 16;

  return (
    <GroupScreen fill scroll={false}>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: 20,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        <View ref={contentRef} collapsable={false}>
          <Grid columns={layout.columns === 1 ? 2 : 4} gap={layout.compact ? 10 : 12}>
            {tiles.map((tile) => (
              <StatTile
                key={tile.label}
                label={tile.label}
                value={tile.value}
                sub={tile.sub}
                status={tile.status}
                onPress={() => show(tile.panel)}
              />
            ))}
          </Grid>

          <View className="flex-row items-start" style={{ marginTop: gap + 4, columnGap: gap }}>
            {columns.map((column, index) => (
              <View key={index} className="flex-1" style={{ rowGap: gap }}>
                {column.map((id) => (
                  <FlashFrame
                    key={id}
                    active={flash === id}
                    ref={(node) => {
                      panelRefs.current[id] = node;
                    }}
                  >
                    {panels[id]}
                  </FlashFrame>
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </GroupScreen>
  );
}
