// The Wallets screen's two send rules (the list's unarchive and the form's
// create, update and archive), merged into one hook that the Bun Wallet
// screens share. Every write is one immutable command under `useCommandKeys`,
// with the version that was read: a definite answer settles its key; an
// unconfirmed one keeps the command and its key, and a resend sends exactly
// that again (also when the retry is refused before processing). A create
// whose wallet already exists under its id was saved by an earlier attempt.
// A version conflict, a wallet gone, or one archived or unarchived elsewhere
// is a conflict. The caller keeps its own state and follow-ups, maps the
// outcome onto them, and holds its presses while a command is out: one
// command at a time.
//
// Analytics (R61, W27): a create's acknowledgement, or its own wallet met
// again, sends one wallet_added with the look it was given; nothing else does.
import type { CreateWalletRequest, UpdateWalletRequest, WalletDto } from '@gogospend/contracts';
import { useRef, useState } from 'react';

import { trackWalletAdded } from '@mobile/analytics/events';
import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { walletConflict, walletRefusal } from '@mobile/spend/v1/redesign/planning/walletsModel';
import type { WalletFieldErrors } from '@mobile/spend/v1/redesign/planning/walletsModel';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { isOwnCreate, refusedBeforeProcessing, saveProblem, useCommandKeys } from '../../v1/parts';

export type WalletCommand =
  | { kind: 'create'; slot: string; input: CreateWalletRequest }
  | { kind: 'update'; slot: string; id: string; version: number; changes: UpdateWalletRequest }
  | { kind: 'archive' | 'unarchive'; slot: string; id: string; version: number };
/** 1D-T1's trackWalletAdded inputs. */
export type WalletTrack = { walletType: string | null; material: string; bunFace: string };
export type WalletOutcome =
  | { kind: 'done' }
  | { kind: 'unconfirmed'; message: string; blocked: boolean }
  | { kind: 'conflict'; current: WalletDto | null }
  | { kind: 'refused'; message: string | null; fields: WalletFieldErrors; needsReason: boolean; archiveRefused: boolean; blocked: boolean };

/** What the key covers: a create's request, an update's version and changes, otherwise the version. */
const payloadOf = (command: WalletCommand): unknown =>
  command.kind === 'create' ? command.input : command.kind === 'update' ? { version: command.version, changes: command.changes } : { version: command.version };

export function useWalletCommand(): { sending: boolean; send(command: WalletCommand, track?: WalletTrack): Promise<WalletOutcome>; resend(): Promise<WalletOutcome | null> } {
  const resources = useSpendV1();
  const tc = useCopy();
  const keys = useCommandKeys();
  const [sending, setSending] = useState(false);
  // The command whose outcome is unknown, with the track of its first attempt: resend sends exactly this.
  const pending = useRef<{ command: WalletCommand; track: WalletTrack | undefined } | null>(null);

  async function send(command: WalletCommand, track?: WalletTrack): Promise<WalletOutcome> {
    const key = keys.keyFor(command.slot, payloadOf(command));
    setSending(true);
    try {
      if (command.kind === 'create') await resources.createWallet(command.input, key);
      else if (command.kind === 'update') await resources.updateWallet(command.id, command.version, command.changes, key);
      else if (command.kind === 'archive') await resources.archiveWallet(command.id, command.version, key);
      else await resources.unarchiveWallet(command.id, command.version, key);
      keys.settle(command.slot);
      pending.current = null;
      if (command.kind === 'create') trackWalletAdded(track ?? {});
      return { kind: 'done' };
    } catch (error) {
      // This wallet's id already exists: an earlier attempt of this create committed.
      if (command.kind === 'create' && isOwnCreate(error, command.input.id)) {
        keys.settle(command.slot);
        pending.current = null;
        trackWalletAdded(track ?? {});
        return { kind: 'done' };
      }
      const problem = saveProblem(error, tc);
      // Once unconfirmed, it stays frozen with its key until that command's outcome is known: a refusal before
      // processing (signed out, terms, an update, a changed session) says nothing about it.
      const stillUnknown = problem.unconfirmed || (pending.current !== null && refusedBeforeProcessing(error));
      if (stillUnknown) {
        pending.current = { command, track };
        return { kind: 'unconfirmed', message: problem.message, blocked: problem.blocked };
      }
      keys.settle(command.slot);
      pending.current = null;
      const refusal = walletRefusal(error, tc);
      const found = command.kind === 'create' ? null : walletConflict(error, command.id);
      const gone = error instanceof V1Error && error.outcome === 'not_found';
      if (found || gone || refusal.changedElsewhere) return { kind: 'conflict', current: found?.current ?? null };
      return {
        kind: 'refused',
        message: problem.message,
        fields: refusal.fields,
        needsReason: refusal.needsReason,
        archiveRefused: refusal.archiveRefused,
        blocked: problem.blocked,
      };
    } finally {
      setSending(false);
    }
  }

  /** Try again: exactly the command whose outcome is unknown, under its key and with its first track; null when none is. */
  async function resend(): Promise<WalletOutcome | null> {
    const unknown = pending.current;
    if (!unknown) return null;
    return send(unknown.command, unknown.track);
  }

  return { sending, send, resend };
}
