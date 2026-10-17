// F6b: authenticated ingestion of provider security events. A verified event
// is recorded once (its id), and a credential change newer than the
// account's last one ends every session signed in with the old credentials,
// raises reauth_after and queues F6a's grant revocation behind a hold.
import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';

import { ProblemException } from '../common/api-problem.filter';
import { PG_POOL } from '../database/database.service';
import { SecurityEventRejected, verifySecurityEvent } from './auth0-event-verifier';
import type { EventVerifierConfig, RejectionCode } from './auth0-event-verifier';

export const EVENT_VERIFIER_CONFIG = Symbol('EVENT_VERIFIER_CONFIG');

export type SignedEnvelope = { rawBody: Buffer | undefined; signature: string | undefined };

type Recorded = 'applied' | 'superseded' | 'no_account' | 'duplicate' | 'conflict';

function refusal(code: RejectionCode): ProblemException {
  if (code === 'too_large') return new ProblemException(413, 'COMMAND_TOO_LARGE');
  // Unauthenticated: nothing about the body is trusted or echoed.
  if (code === 'signature_invalid' || code === 'timestamp_out_of_range') return new ProblemException(401, 'UNAUTHENTICATED');
  return new ProblemException(422, 'VALIDATION_FAILED');
}

@Injectable()
export class SecurityEventService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(EVENT_VERIFIER_CONFIG) private readonly config: EventVerifierConfig | null,
    private readonly newId: () => string = randomUUID,
  ) {}

  /**
   * Verifies the envelope, then records the event exactly once. Superseded
   * (older than the account's last change) and unknown-principal events are
   * accepted as applied: the provider has nothing to retry. Reusing an event
   * id for different content is refused.
   */
  async handleSecurityEvent(envelope: SignedEnvelope): Promise<'applied' | 'duplicate'> {
    if (!this.config) throw new ProblemException(404, 'NOT_FOUND');
    let event;
    try {
      event = verifySecurityEvent(envelope.rawBody ?? Buffer.alloc(0), envelope.signature, this.config);
    } catch (error) {
      if (error instanceof SecurityEventRejected) throw refusal(error.code);
      throw error;
    }
    const { rows } = await this.pool.query<{ outcome: Recorded }>(
      'SELECT gogospend_record_security_event($1, $2, $3, $4, $5, $6) AS outcome',
      [event.id, event.type, event.issuer, event.subject, event.occurredAt, this.newId()],
    );
    const outcome = rows[0]?.outcome;
    if (outcome === 'duplicate') return 'duplicate';
    if (outcome === 'conflict') throw new ProblemException(409, 'IDEMPOTENCY_MISMATCH');
    return 'applied';
  }
}
