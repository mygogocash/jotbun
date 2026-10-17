import type { V1Outcome } from '../api/client.ts';
import type { OutboxCommand, OutboxState } from '../storage/types.ts';

/** What a failed transmission means for its command and for the flush. */
export type SendVerdict = {
  /** The command's next state; 'previous' restores the state before this transmission; 'keep_sending' leaves it for the next session to recover. */
  next: OutboxState | 'previous' | 'keep_sending';
  /** stop: end the flush; continue: go on with the next command. */
  flush: 'stop' | 'continue';
  /** Counts toward the five-failure pause. */
  failure: boolean;
};

const MAYBE_COMMITTED: SendVerdict = { next: 'uncertain', flush: 'stop', failure: true };
const REFUSED: SendVerdict = { next: 'needs_review', flush: 'continue', failure: false };
const NOT_PROCESSED: SendVerdict = { next: 'previous', flush: 'stop', failure: false };

/**
 * A lost response, a 5xx or a garbled answer may follow a commit: the command
 * is uncertain (status is checked before any resend; it is never recreated).
 * A refusal (validation, conflict, missing or deleted reference, unsupported
 * schema, too large) needs review and is not retried. Pacing (429), an
 * upgrade requirement and auth or policy refusals happen before any commit:
 * the command goes back to where it was, still frozen. A session change
 * mid-response leaves it `sending` for the next session to resolve.
 */
export function verdictFor(outcome: V1Outcome): SendVerdict {
  switch (outcome) {
    case 'network':
    case 'unavailable':
    case 'invalid_response':
      return MAYBE_COMMITTED;
    case 'schema_unsupported':
    case 'invalid':
    case 'conflict':
    case 'not_found':
    case 'deleted':
    case 'purged':
    case 'idempotency_mismatch':
    case 'too_large':
      return REFUSED;
    case 'session_changed':
      return { next: 'keep_sending', flush: 'stop', failure: false };
    case 'rate_limited':
    case 'upgrade_required':
    case 'signed_out':
    case 'policy_required':
    case 'unsupported_platform':
      return NOT_PROCESSED;
  }
}

const THIRTY_DAYS_MS = 30 * 86_400_000;

/** A draft older than 30 days (the server keeps receipts and accepts old schemas that long) needs review first. */
export function isStale(command: OutboxCommand, now: number): boolean {
  const created = Date.parse(command.createdAt);
  return Number.isNaN(created) || now - created > THIRTY_DAYS_MS;
}
