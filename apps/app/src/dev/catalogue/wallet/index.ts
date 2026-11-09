// The Bun Wallet's catalogue sections (plan P2, development only), last in the
// catalogue's list (registry.tsx). Each wallet task with sections adds one
// spread of its own list here, in plan order. Ids start with `bw-` and titles
// with `Bun Wallet: ` (R72); walletHarness.render.test.tsx holds them to that.
import type { CatalogueSection } from '../registry';
import { WALLET_KIT_SECTIONS } from './kitSections';

export const WALLET_SECTIONS: readonly CatalogueSection[] = [
  ...WALLET_KIT_SECTIONS,
];
