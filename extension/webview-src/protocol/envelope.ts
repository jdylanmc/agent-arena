/*---------------------------------------------------------------------------------------------
 *  src/protocol/envelope.ts
 *
 *  Webview ↔ extension-host message envelope (CD-04).
 *
 *  EVERY message in either direction MUST conform to MessageEnvelopeSchema and
 *  pass runtime validation on both sides. Unknown `type` is rejected and an
 *  `aa.webview.message.rejected.v1` event is emitted (see CD-01).
 *
 *  The Vite build mirrors this file into webview-src/protocol/envelope.ts so
 *  the host and webview share a single validator. A unit test asserts byte
 *  equality between the two locations.
 *
 *  See:
 *    - specs/20260506-144809-scaffold-application/contracts/webview-protocol.md
 *    - specs/20260506-144809-scaffold-application/data-model.md (MessageEnvelope)
 *
 *  Author attribution: copilot(developer:opus-4.7)
 *--------------------------------------------------------------------------------------------*/

import { z } from "zod";

/**
 * Canonical envelope shape for the postMessage boundary.
 *
 * Field semantics:
 *   - protocol_version: integer literal 1 for this scaffold. MAJOR-bumps when
 *     the envelope shape changes (NOT when only the type enum grows).
 *   - message_id: per-message UUID v4 (replay/debug aid).
 *   - correlation_id: UUID v4 minted by the originator of a causal chain
 *     (typically the webview when the user submits a prompt). The host
 *     propagates it into every EI-1 event emitted as a downstream consequence.
 *   - session_id: present once a session has been created or resumed.
 *   - agent_id: present when scoped to a specific agent. Always "primary" in
 *     this scaffold.
 *   - type: from the per-type schema enum in src/protocol/types.ts.
 *   - payload: object; per-type Zod schemas enforced separately on receipt.
 */
export const MessageEnvelopeSchema = z.object({
    protocol_version: z.literal(1),
    message_id: z.string().uuid(),
    correlation_id: z.string().uuid(),
    session_id: z.string().min(1).optional(),
    agent_id: z.string().min(1).optional(),
    type: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
});

export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;

/**
 * Reasons an envelope can be rejected at the receiver. Recorded in the
 * `aa.webview.message.rejected.v1` event payload (CD-01) for audit.
 */
export type EnvelopeRejectionReason =
    | "unsupported_protocol_version"
    | "unknown_type"
    | "payload_schema_violation"
    | "envelope_schema_violation";

/**
 * Result of validating an inbound envelope. Either it parsed cleanly (and the
 * caller can dispatch by type) or it failed and the caller MUST emit a
 * rejection event. Never throws.
 */
export type EnvelopeValidationResult =
    | { ok: true; envelope: MessageEnvelope }
    | { ok: false; reason: EnvelopeRejectionReason; details: string; raw: unknown };

/**
 * Validate an inbound message. This wraps MessageEnvelopeSchema.safeParse to
 * normalize the rejection-reason taxonomy. Per-type payload validation is the
 * caller's responsibility (it depends on the resolved `type` enum from
 * src/protocol/types.ts).
 */
export function validateEnvelope(raw: unknown): EnvelopeValidationResult {
    const parsed = MessageEnvelopeSchema.safeParse(raw);
    if (parsed.success) {
        return { ok: true, envelope: parsed.data };
    }
    // Distinguish "wrong protocol version" from generic schema violation, since
    // it has its own remediation (envelope shape changed in a v2 the host
    // doesn't yet handle).
    const wrongVersion = parsed.error.issues.find(
        (issue) => issue.path.length === 1 && issue.path[0] === "protocol_version",
    );
    if (wrongVersion) {
        return {
            ok: false,
            reason: "unsupported_protocol_version",
            details: wrongVersion.message,
            raw,
        };
    }
    return {
        ok: false,
        reason: "envelope_schema_violation",
        details: parsed.error.message,
        raw,
    };
}
