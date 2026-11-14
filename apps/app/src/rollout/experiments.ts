// The experiments (plan P6B-T14, B25), pure but for the installed controller.
// Each is a multivariate remote flag; anything but a listed variant reads as
// 'control', so a person without flags sees today's screen. Reading a variant
// is the exposure (PostHog's `$feature_flag_called`), made only after yes, so
// P6B-T16 reads each once per showing. Judged on activation and logging days,
// never spending (default pending owner Q11).
import { getAnalytics } from '../analytics/bus.ts';

export type ExperimentKey = 'budget_question' | 'save_celebration' | 'reminder_time';

export const EXPERIMENTS: Readonly<Record<ExperimentKey, { flag: string; variants: readonly ['control', string] }>> = {
  budget_question: { flag: 'exp-budget-question', variants: ['control', 'no_presets'] },
  save_celebration: { flag: 'exp-save-celebration', variants: ['control', 'still'] },
  reminder_time: { flag: 'exp-reminder-time', variants: ['control', 'later'] },
};

/** A listed variant of this experiment, else 'control'. */
export function variantOf(key: ExperimentKey, value: boolean | string | undefined): string {
  return typeof value === 'string' && EXPERIMENTS[key].variants.includes(value) ? value : 'control';
}

/** The variant from the installed controller's flag: one read, which is the exposure. */
export function readExperiment(key: ExperimentKey): string {
  return variantOf(key, getAnalytics()?.flag(EXPERIMENTS[key].flag));
}
