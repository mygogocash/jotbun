import { trackClientEvent } from "@mobile/analytics/bus";

export function trackSpendImportStarted(mapper = "unknown"): void {
  trackClientEvent("spend_import_started", { mapper });
}

export function trackSpendTxAdded(source = "manual"): void {
  trackClientEvent("spend_tx_added", { source });
}
