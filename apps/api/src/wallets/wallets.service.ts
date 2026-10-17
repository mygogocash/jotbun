import { Injectable } from '@nestjs/common';
import {
  ContractValidationError,
  MINOR_AMOUNT_MAX,
  WALLET_CORRECTION_REASONS,
  assertKnownFields,
  bangkokDate,
  isUuid,
  isWalletSnapshot,
  normalizeName,
  parseMinor,
  validateTrackingStart,
} from '@gogospend/contracts';
import type { CommandAck, CommandOutcome, SessionContext, WalletCorrectionReason, WalletDto, WalletSnapshot } from '@gogospend/contracts';

import { CommandExecutor } from '../commands/command-executor';
import type { MutationResult } from '../commands/command-executor';
import type { CommandHeaders } from '../commands/command-headers';
import { CommandRegistry } from '../commands/command-registry';
import { expectVersion, routeId, stateProblem } from '../commands/versioned-entity';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import type { OwnerTx } from '../database/owner-transaction';
import { insertWallet, updateWallet, walletBalances, walletDtos, walletRows } from './wallets.repository';
import type { WalletChange } from './wallets.repository';

const ENTITY = 'wallet';
const COMMANDS: [string, CommandOutcome][] = [['wallet.create', 'created'], ['wallet.update', 'updated'], ['wallet.archive', 'archived'], ['wallet.unarchive', 'unarchived']];
const OPENING = { allowZero: true, allowNegative: false, max: MINOR_AMOUNT_MAX };

const changed = (wallet: WalletSnapshot): MutationResult => ({
  entityId: wallet.id,
  version: wallet.version,
  changes: [{ entity: ENTITY, id: wallet.id, version: wallet.version, state: 'active', snapshot: wallet }],
});

/**
 * Owned THB wallets. Every write is an M1 command on a client-chosen UUID;
 * edits and archive changes need the current version (If-Match). Archiving
 * needs a zero derived balance and keeps the wallet for history.
 */
@Injectable()
export class WalletsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly executor: CommandExecutor,
    registry: CommandRegistry,
  ) {
    registry.defineEntity({ entity: ENTITY, validate: isWalletSnapshot });
    for (const [kind, outcome] of COMMANDS) registry.defineCommand({ kind, entity: ENTITY, outcome, schemaVersions: [1], policy: 'current' });
  }

  list(ctx: SessionContext): Promise<WalletDto[]> {
    return this.db.withOwnerTransaction(ctx, async (tx) => walletDtos(tx, await walletRows(tx)));
  }

  get(ctx: SessionContext, id: string): Promise<WalletDto> {
    const walletId = routeId(id);
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const [wallet] = await walletRows(tx, { id: walletId });
      if (!wallet) throw new ProblemException(404, 'NOT_FOUND');
      return (await walletDtos(tx, [wallet]))[0];
    });
  }

  create(ctx: SessionContext, command: CommandHeaders, body: unknown): Promise<CommandAck> {
    const input = assertKnownFields(body, ['id', 'name', 'opening_minor', 'tracking_start']);
    if (!isUuid(input.id)) throw new ContractValidationError('VALIDATION_FAILED', 'id must be a lower-case UUID.', 'id');
    const payload = {
      id: input.id,
      name: normalizeName(input.name, 'name'),
      opening_minor: parseMinor(input.opening_minor, OPENING, 'opening_minor').toString(),
      tracking_start: validateTrackingStart(input.tracking_start, bangkokDate(new Date())),
    };
    return this.executor.run(ctx, { ...command, kind: 'wallet.create', payload }, async (tx) => {
      const wallet = await insertWallet(tx, payload);
      if (!wallet) throw new ProblemException(409, 'VERSION_CONFLICT', { current: await this.current(tx, payload.id) });
      return changed(wallet);
    });
  }

  update(ctx: SessionContext, command: CommandHeaders, id: string, body: unknown): Promise<CommandAck> {
    const walletId = routeId(id);
    const input = assertKnownFields(body, ['name', 'opening_minor', 'tracking_start', 'correction_reason']);
    const change: WalletChange = {};
    if (input.name !== undefined) change.name = normalizeName(input.name, 'name');
    if (input.opening_minor !== undefined) change.opening_minor = parseMinor(input.opening_minor, OPENING, 'opening_minor').toString();
    if (input.tracking_start !== undefined) change.tracking_start = validateTrackingStart(input.tracking_start, bangkokDate(new Date()));
    if (Object.keys(change).length === 0) throw new ContractValidationError('VALIDATION_FAILED', 'Nothing to change.', 'name');
    let reason: WalletCorrectionReason | undefined;
    if (input.correction_reason !== undefined) {
      if (!WALLET_CORRECTION_REASONS.includes(input.correction_reason as WalletCorrectionReason)) {
        throw new ContractValidationError('VALIDATION_FAILED', 'Unknown correction reason.', 'correction_reason');
      }
      reason = input.correction_reason as WalletCorrectionReason;
    }
    const payload = { id: walletId, ...change, ...(reason ? { correction_reason: reason } : {}) };
    return this.executor.run(ctx, { ...command, kind: 'wallet.update', payload }, async (tx) => {
      const wallet = await this.locked(tx, walletId, command.expectedVersion);
      if (wallet.archived) throw stateProblem('errors.wallet_archived', 'archived');
      const corrected = change.opening_minor !== undefined || change.tracking_start !== undefined;
      return { ...changed(await updateWallet(tx, walletId, change)), audit: corrected && reason ? { correction: reason } : undefined };
    });
  }

  archive(ctx: SessionContext, command: CommandHeaders, id: string, body: unknown): Promise<CommandAck> {
    const walletId = routeId(id);
    assertKnownFields(body ?? {}, []);
    return this.executor.run(ctx, { ...command, kind: 'wallet.archive', payload: { id: walletId } }, async (tx) => {
      const wallet = await this.locked(tx, walletId, command.expectedVersion);
      if (wallet.archived) throw stateProblem('errors.already_archived', 'archived');
      if ((await walletBalances(tx, [walletId])).get(walletId) !== '0') throw stateProblem('errors.wallet_balance_not_zero', 'balance_minor');
      return changed(await updateWallet(tx, walletId, { archived: true }));
    });
  }

  unarchive(ctx: SessionContext, command: CommandHeaders, id: string, body: unknown): Promise<CommandAck> {
    const walletId = routeId(id);
    assertKnownFields(body ?? {}, []);
    return this.executor.run(ctx, { ...command, kind: 'wallet.unarchive', payload: { id: walletId } }, async (tx) => {
      const wallet = await this.locked(tx, walletId, command.expectedVersion);
      if (!wallet.archived) throw stateProblem('errors.not_archived', 'archived');
      return changed(await updateWallet(tx, walletId, { archived: false }));
    });
  }

  private async locked(tx: OwnerTx, id: string, expected: number | undefined): Promise<WalletSnapshot> {
    const [wallet] = await walletRows(tx, { id, forUpdate: true });
    return expectVersion(wallet, expected, async (row) => (await walletDtos(tx, [row]))[0]);
  }

  private async current(tx: OwnerTx, id: string): Promise<WalletDto | undefined> {
    const [wallet] = await walletRows(tx, { id });
    return wallet ? (await walletDtos(tx, [wallet]))[0] : undefined;
  }
}
