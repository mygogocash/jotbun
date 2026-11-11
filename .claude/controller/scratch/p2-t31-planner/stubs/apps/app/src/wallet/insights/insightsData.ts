import type { RecapProblem } from '@mobile/spend/v1/redesign/insights/recapModel';

export type InsightsTab = 'spending' | 'in_out' | 'calendar';

export type InsightsData = {
  month: string;
  today: string;
  summary: null;
  categories: [];
  records: [];
  drafts: [];
  compare: [];
  refreshSuggested: boolean;
};

export type InsightsLoad =
  | { state: 'loading'; reload?: () => void; refresh?: () => void }
  | { state: 'ready'; data: InsightsData; reload: () => void; refresh: () => void }
  | { state: 'error'; error: unknown; problem: RecapProblem; reload: () => void; refresh: () => void };

export function useInsightsData(_month: string, _today: string): InsightsLoad {
  return { state: 'loading' };
}
