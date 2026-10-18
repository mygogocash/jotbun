import { Injectable } from '@nestjs/common';
import type { CommandOutcome } from '@gogospend/contracts';

export type CommandDefinition = {
  /** e.g. `wallet.create`; matches the receipt's kind constraint. */
  kind: string;
  /** The primary entity whose id/version the acknowledgement reports. */
  entity: string;
  outcome: CommandOutcome;
  /**
   * Accepted `X-GoGoSpend-Command-Schema` values. Keep a version for at least
   * 30 days after the last client emitting it drops below the minimum
   * (master plan); a replay of a committed command never needs it.
   */
  schemaVersions: readonly number[];
  /** `current`: writes need the current required policies; `exempt`: export/deletion/logout. */
  policy: 'current' | 'exempt';
};

export type EntityDefinition = {
  entity: string;
  /** Validates a change snapshot against the entity's persisted DTO. */
  validate(snapshot: unknown): boolean;
};

const KIND = /^[a-z][a-z0-9_.]{0,63}$/;
const ENTITY = /^[a-z][a-z0-9_]{0,63}$/;

/** Command kinds and entities, registered by their domain modules at startup. */
@Injectable()
export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();
  private readonly entities = new Map<string, EntityDefinition>();

  defineEntity(definition: EntityDefinition): void {
    if (!ENTITY.test(definition.entity) || this.entities.has(definition.entity)) throw new Error(`Invalid or duplicate entity: ${definition.entity}`);
    this.entities.set(definition.entity, definition);
  }

  defineCommand(definition: CommandDefinition): void {
    if (!KIND.test(definition.kind) || this.commands.has(definition.kind)) throw new Error(`Invalid or duplicate command kind: ${definition.kind}`);
    if (!this.entities.has(definition.entity)) throw new Error(`Command ${definition.kind} names an undefined entity.`);
    if (definition.schemaVersions.length === 0 || !definition.schemaVersions.every((v) => Number.isInteger(v) && v >= 1 && v <= 10_000)) {
      throw new Error(`Command ${definition.kind} needs schema versions 1-10000.`);
    }
    this.commands.set(definition.kind, { ...definition, schemaVersions: [...definition.schemaVersions] });
  }

  command(kind: string): CommandDefinition {
    const definition = this.commands.get(kind);
    if (!definition) throw new Error(`Unregistered command kind: ${kind}`);
    return definition;
  }

  entity(name: string): EntityDefinition | undefined {
    return this.entities.get(name);
  }

  /** Every registered entity (sync's DTO map must cover exactly these). */
  entityNames(): string[] {
    return [...this.entities.keys()];
  }

  /**
   * Every command kind with the schema versions it accepts: the release
   * package's command-schema compatibility table (P6b, docs/operations/release.md).
   */
  commandSchemas(): Record<string, number[]> {
    return Object.fromEntries([...this.commands].sort(([a], [b]) => a.localeCompare(b)).map(([kind, definition]) => [kind, [...definition.schemaVersions]]));
  }
}
