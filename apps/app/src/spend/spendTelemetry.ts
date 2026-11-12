// The legacy spend screens' calls (the dev-only CustomerSpend screens). §7 has
// no such events, and they never reached anyone: the old sink was never set,
// and 1D-T1's allow-list drops their names. So they send nothing (1D-T7); the
// calls stay so the legacy screens keep their shape.
export function trackSpendImportStarted(mapper = "unknown"): void {
  void mapper;
}

export function trackSpendTxAdded(source = "manual"): void {
  void source;
}
