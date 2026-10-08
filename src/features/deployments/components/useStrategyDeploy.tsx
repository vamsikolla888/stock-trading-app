import React, { useCallback, useMemo, useState } from 'react';

import { useDeploymentList } from '../hooks';
import { engineOf, normalizeStockRows } from '../lib/normalize';
import { deployTabLabel, modesOf, runningOf } from '../lib/view';
import type {
  DeployMode,
  Deployment,
  DeployPlatformKey,
  DeployStockRow,
  DeployTarget,
  UniverseKey,
  VariantKey,
} from '../types';
import { DeploymentTab } from './DeploymentTab';
import { DeploySheet } from './DeploySheet';
import { ModeBadges } from './parts';

export type StrategyDeployTarget =
  { kind: 'strategy'; strategyId: string } | { kind: 'platform'; key: DeployPlatformKey };

export interface StrategyDeployOptions {
  /** Intraday (`bb-midband-5m`): the page's current universe and rule variant, to prefill the
   *  sheet as the web's DeployDrawer does. */
  universe?: UniverseKey | null;
  variant?: VariantKey | null;
  /** Intraday: the page's backtested stock rows for that variant (`symbol`, `trades`, `winRate`,
   *  `avgReturnPct`, `verdict` …) — the picker's list. Swing targets read theirs from the server. */
  stocks?: readonly unknown[] | null;
  /** The strategy's name, for the sheet's subtitle when the server doesn't send it. */
  strategyName?: string | null;
  /** After a deploy or a settings save — e.g. switch the page to its Deployment tab. */
  onDeployed?: (deployment: Deployment) => void;
  /** Off while the page has nothing to deploy (a missing strategy). Default on. */
  enabled?: boolean;
}

export interface StrategyDeploy {
  /** The deployments have loaded — the Deploy button can open the sheet. */
  ready: boolean;
  /** Active or paused deployments (at most one per mode). */
  running: Deployment[];
  /** The modes running now, paper first. */
  modes: DeployMode[];
  /** "Deployment", "Deployment · paper", "Deployment · live" or "Deployment · both". */
  tabLabel: string;
  /** Opens the deploy sheet in a mode (paper is the default the pages use). */
  openDeploy: (mode: DeployMode) => void;
  /** The Deployment tab's content. */
  tab: React.ReactNode;
  /** The deploy sheet — render it anywhere on the page (it is a modal). */
  sheet: React.ReactNode;
  /** PAPER / LIVE chips for the page header (nothing when not deployed). */
  badges: React.ReactNode;
  /** Re-read the deployments (pull to refresh). */
  refresh: () => Promise<unknown>;
}

/**
 * Everything a strategy page needs to offer deployment — a user's own strategy and both platform
 * strategies share it, so the pages cannot drift (the web's useSwingDeploy, plus the intraday
 * page's deploy wiring). Swing targets use the swing-deployment API; the intraday key its own.
 */
export function useStrategyDeploy(
  target: StrategyDeployTarget,
  options: StrategyDeployOptions = {},
): StrategyDeploy {
  const targetKey = target.kind === 'strategy' ? `s:${target.strategyId}` : `p:${target.key}`;
  // A stable target, whatever object literal the page passes on each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo<DeployTarget>(() => target, [targetKey]);
  const engine = engineOf(stable);
  const list = useDeploymentList(stable, options.enabled ?? true);
  const [sheetMode, setSheetMode] = useState<DeployMode>('paper');
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  const deployments = list.data?.deployments;
  const running = useMemo(() => runningOf(deployments ?? []), [deployments]);
  const modes = useMemo(() => modesOf(running), [running]);
  const { refetch } = list;
  const { onDeployed } = options;

  const pageStocks = options.stocks;
  const stocks = useMemo<DeployStockRow[]>(
    () =>
      engine === 'swing'
        ? (list.data?.strategy?.stocks ?? [])
        : normalizeStockRows(pageStocks ?? []),
    [engine, list.data?.strategy?.stocks, pageStocks],
  );

  const openDeploy = useCallback(
    (mode: DeployMode) => {
      setSheetMode(mode);
      setNonce((n) => n + 1);
      setOpen(true);
      // Live readiness (Safe Mode, the switch, a fresh backtest) is read again as it opens.
      void refetch();
    },
    [refetch],
  );

  const close = useCallback(() => setOpen(false), []);
  const deployed = useCallback(
    (d: Deployment) => {
      setOpen(false);
      onDeployed?.(d);
    },
    [onDeployed],
  );

  const tab = <DeploymentTab target={stable} query={list} onDeploy={openDeploy} />;
  const sheet = list.data ? (
    <DeploySheet
      key={nonce}
      visible={open}
      onClose={close}
      target={stable}
      list={list.data}
      initialMode={sheetMode}
      stocks={stocks}
      variant={options.variant}
      universe={options.universe}
      strategyName={options.strategyName}
      onDeployed={deployed}
    />
  ) : null;

  return {
    ready: Boolean(list.data),
    running,
    modes,
    tabLabel: deployTabLabel(running),
    openDeploy,
    tab,
    sheet,
    badges: <ModeBadges deployments={running} />,
    refresh: refetch,
  };
}
