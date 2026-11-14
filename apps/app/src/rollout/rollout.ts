// The rollout layer (plan P6B-T14, B25), pure. Each rollout is a remote flag
// read only after yes; anyone without loaded flags (a no, never asked, signed
// out, offline before any load, or a build with no PostHog key) gets the
// build default. P6B-T15 puts useRollout inside each feature's switch hook.

export type RolloutKey = 'bun_ai' | 'slip_import' | 'travel';

/** §7: each rolls out to 5%, then 25%, then everyone; the owner moves each flag's percentage. */
export const ROLLOUT_FLAGS: Readonly<Record<RolloutKey, string>> = {
  bun_ai: 'rollout-bun-ai',
  slip_import: 'rollout-slip-import',
  travel: 'rollout-travel',
};

/** Without flags, every rollout is off (default pending owner Q10). */
export const ROLLOUT_DEFAULTS: Readonly<Record<RolloutKey, boolean>> = {
  bun_ai: false,
  slip_import: false,
  travel: false,
};

/** undefined (no flags): the default; true, or a variant other than 'control': on; false or 'control': off. */
export function rolloutOn(key: RolloutKey, value: boolean | string | undefined): boolean {
  if (value === undefined) return ROLLOUT_DEFAULTS[key];
  if (typeof value === 'string') return value !== 'control';
  return value === true;
}
