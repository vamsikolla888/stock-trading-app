import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appStorage } from '@/lib/storage/appStorage';

import {
  CHART_INTERVALS,
  CHART_TYPES,
  DEFAULT_STUDIES,
  STUDIES,
  type ChartInterval,
  type ChartType,
  type StudyId,
} from './lib/config';

interface ChartPrefsState {
  interval: ChartInterval;
  chartType: ChartType;
  studies: StudyId[];
  setInterval: (interval: ChartInterval) => void;
  setChartType: (chartType: ChartType) => void;
  toggleStudy: (study: StudyId) => void;
  resetStudies: () => void;
}

/**
 * The advanced chart's settings — interval, chart type, studies — remembered across stocks and
 * launches, the way a trading terminal keeps a layout. Values read back from storage are checked,
 * so a study or interval removed in a later version cannot break the chart.
 */
export const useChartPrefs = create<ChartPrefsState>()(
  persist(
    (set) => ({
      interval: '5m',
      chartType: 'candles',
      studies: [...DEFAULT_STUDIES],
      setInterval: (interval) => set({ interval }),
      setChartType: (chartType) => set({ chartType }),
      toggleStudy: (study) =>
        set((state) => ({
          studies: state.studies.includes(study)
            ? state.studies.filter((s) => s !== study)
            : [...state.studies, study],
        })),
      resetStudies: () => set({ studies: [...DEFAULT_STUDIES] }),
    }),
    {
      name: 'chart-prefs',
      storage: createJSONStorage(() => appStorage),
      partialize: ({ interval, chartType, studies }) => ({ interval, chartType, studies }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ChartPrefsState>;
        return {
          ...current,
          interval: CHART_INTERVALS.some((i) => i.key === saved.interval)
            ? (saved.interval as ChartInterval)
            : current.interval,
          chartType: CHART_TYPES.some((t) => t.key === saved.chartType)
            ? (saved.chartType as ChartType)
            : current.chartType,
          studies: Array.isArray(saved.studies)
            ? saved.studies.filter((s): s is StudyId => STUDIES.some((spec) => spec.id === s))
            : current.studies,
        };
      },
    },
  ),
);
