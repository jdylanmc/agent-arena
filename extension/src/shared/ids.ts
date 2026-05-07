/*---------------------------------------------------------------------------------------------
 *  src/shared/ids.ts
 *
 *  Stable id generation helpers. Keeps id format conventions in one place so
 *  agentId, sessionId, etc. are constructed consistently.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from "node:crypto";

/**
 * Mint a session id for the given agent. Format: `aa-{agentId}-{uuid}`.
 * Per CD-02 / R-05, sessions MUST have explicit ids to be resumable.
 */
export function mintSessionId(agentId: string): string {
    return `aa-${agentId}-${randomUUID()}`;
}

/**
 * Mint a correlation id for a new causal chain (a UUID v4).
 */
export function mintCorrelationId(): string {
    return randomUUID();
}

/**
 * Mint a generic message id for a single postMessage envelope.
 */
export function mintMessageId(): string {
    return randomUUID();
}
