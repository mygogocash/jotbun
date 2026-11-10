// Looks kept on the phone (W7, R64): each wallet's kind, material and Bun
// face, the wallet order and each category's icon. They are the person's
// data, kept per account in the account store (P2-T3) under `looks`,
// `wallet-order` and `category-icons` for the open diary's account, so they
// survive sign-out and go only with a confirmed account deletion. With no
// account (no diary open: the web, opening, locked or signed out) every
// wallet shows its derived look and the setters keep nothing. WalletShell
// mounts the one provider (P2-T18); outside it, looks are derived, no order
// or icon is kept, and nothing changes.
//
// Each change reads its name from the store, changes it and writes it back,
// after the account's first read and after the change before it: two quick
// changes never drop each other, and a change made just before the account
// changes is kept for the account it was made in. A name the store cannot
// read counts as nothing kept and is never written over; a change to it, or a
// write that fails, shows until the app closes.
import type { CategoryDto } from '@gogospend/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { walletAccountStore } from '../store/deviceWalletStore';
import type { KeyValueStore } from '../store/walletStore';
import type { GlyphKey } from './categoryGlyphs';
import { iconFor, parseIcons } from './categoryIcons';
import type { KeptIcons } from './categoryIcons';
import { derivedLook, parseLooks, parseOrder } from './walletLooks';
import type { WalletLook } from './walletLooks';

/** The account store's names: `jotbun.account.<accountId>.looks`, `.wallet-order` and `.category-icons`. */
export const LOOKS_NAME = 'looks';
export const WALLET_ORDER_NAME = 'wallet-order';
export const CATEGORY_ICONS_NAME = 'category-icons';

type KeptLooks = Readonly<Record<string, WalletLook>>;

type Kept = {
  /** The account these were read for. */
  readonly accountId: string | null;
  readonly looks: KeptLooks;
  readonly order: readonly string[];
  readonly icons: KeptIcons;
};

/** One kept name: how its text reads, and where its value sits. */
type Slot<T> = {
  readonly name: string;
  readonly parse: (raw: string | null) => T;
  readonly of: (kept: Kept) => T;
  readonly put: (kept: Kept, value: T) => Kept;
};

const LOOKS: Slot<KeptLooks> = { name: LOOKS_NAME, parse: parseLooks, of: (kept) => kept.looks, put: (kept, looks) => ({ ...kept, looks }) };
const ORDER: Slot<readonly string[]> = { name: WALLET_ORDER_NAME, parse: parseOrder, of: (kept) => kept.order, put: (kept, order) => ({ ...kept, order }) };
const ICONS: Slot<KeptIcons> = { name: CATEGORY_ICONS_NAME, parse: parseIcons, of: (kept) => kept.icons, put: (kept, icons) => ({ ...kept, icons }) };

const nothingKept = (accountId: string | null): Kept => ({ accountId, looks: {}, order: [], icons: {} });

export type WalletLooks = {
  /** The kept look, else the one derived from the id. */
  lookOf(walletId: string): WalletLook;
  /** Keeps a wallet's look for the open account; with none open, keeps nothing. */
  setLook(walletId: string, look: WalletLook): Promise<void>;
  /** The kept wallet order, by id; empty when none is kept. */
  order: readonly string[];
  /** Keeps the wallet order (each id once) for the open account; with none open, keeps nothing. */
  setOrder(ids: readonly string[]): Promise<void>;
};

export type CategoryIcons = {
  /** The kept icon, else the pack's glyph, else the built-in key, else null (the initial). */
  iconOf(category: Pick<CategoryDto, 'id' | 'type' | 'label' | 'builtin_key'>): GlyphKey | null;
  /** Keeps a category's icon for the open account; with none open, keeps nothing. */
  setIcon(categoryId: string, icon: GlyphKey): Promise<void>;
};

type LooksContextValue = {
  readonly kept: Kept;
  readonly setLook: WalletLooks['setLook'];
  readonly setOrder: WalletLooks['setOrder'];
  readonly setIcon: CategoryIcons['setIcon'];
};

const keepNothing = () => Promise.resolve();

/** Outside the provider: derived looks, no order, no kept icons, and the setters keep nothing. */
const OUTSIDE: LooksContextValue = { kept: nothingKept(null), setLook: keepNothing, setOrder: keepNothing, setIcon: keepNothing };

const LooksContext = createContext<LooksContextValue>(OUTSIDE);

/** A name's text (null when absent), or null in place of the whole answer when the store cannot read it. */
const readName = (store: KeyValueStore, name: string) => store.get(name).then((raw) => ({ raw }), () => null);

export function WalletLooksProvider({ children }: { children: ReactNode }) {
  const { accountId } = useDiaryView();
  const [state, setState] = useState<Kept>(() => nothingKept(accountId));
  // Every read and every change runs after the one before it.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback((step: () => Promise<void>) => {
    const run = queue.current.then(step);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  useEffect(() => {
    setState((now) => (now.accountId === accountId ? now : nothingKept(accountId)));
    if (accountId === null) return;
    const store = walletAccountStore(accountId);
    void enqueue(async () => {
      const [looks, order, icons] = await Promise.all([LOOKS, ORDER, ICONS].map((slot) => readName(store, slot.name)));
      const read: Kept = { accountId, looks: parseLooks(looks?.raw ?? null), order: parseOrder(order?.raw ?? null), icons: parseIcons(icons?.raw ?? null) };
      setState((now) => (now.accountId === accountId ? read : now));
    });
  }, [accountId, enqueue]);

  const keep = useCallback(<T,>(slot: Slot<T>, change: (value: T) => T): Promise<void> => {
    if (accountId === null) return Promise.resolve();
    const store = walletAccountStore(accountId);
    return enqueue(async () => {
      const stored = await readName(store, slot.name);
      const value = stored === null ? null : change(slot.parse(stored.raw));
      setState((now) => (now.accountId === accountId ? slot.put(now, value ?? change(slot.of(now))) : now));
      if (value !== null) await store.set(slot.name, JSON.stringify(value)).catch(() => undefined);
    });
  }, [accountId, enqueue]);

  const setLook = useCallback((walletId: string, look: WalletLook) => keep(LOOKS, (looks) => ({ ...looks, [walletId]: look })), [keep]);
  const setOrder = useCallback((ids: readonly string[]) => keep(ORDER, () => [...new Set(ids)]), [keep]);
  const setIcon = useCallback((categoryId: string, icon: GlyphKey) => keep(ICONS, (icons) => ({ ...icons, [categoryId]: icon })), [keep]);

  // Right after the account changes, nothing of the last account's shows, even for one render.
  const kept = useMemo(() => (state.accountId === accountId ? state : nothingKept(accountId)), [state, accountId]);
  const value = useMemo<LooksContextValue>(() => ({ kept, setLook, setOrder, setIcon }), [kept, setLook, setOrder, setIcon]);
  return <LooksContext.Provider value={value}>{children}</LooksContext.Provider>;
}

/** Wallet looks and order as the nearest provider keeps them; outside one, derived looks and no order. */
export function useWalletLooks(): WalletLooks {
  const { kept, setLook, setOrder } = useContext(LooksContext);
  return useMemo(() => ({
    lookOf: (walletId: string) => kept.looks[walletId] ?? derivedLook(walletId),
    setLook,
    order: kept.order,
    setOrder,
  }), [kept, setLook, setOrder]);
}

/** Category icons as the nearest provider keeps them; outside one, none are kept. */
export function useCategoryIcons(): CategoryIcons {
  const { kept, setIcon } = useContext(LooksContext);
  const { icons } = kept;
  return useMemo(() => ({ iconOf: (category) => iconFor(category, icons), setIcon }), [icons, setIcon]);
}
