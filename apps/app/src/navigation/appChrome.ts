import { isSpendEnabled } from '@mobile/config/featureFlags';

// Route availability only. The API remains authoritative for Spend entitlement.
export function useMarketSpendEnabled(): boolean { return isSpendEnabled(); }
