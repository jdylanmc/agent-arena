/*---------------------------------------------------------------------------------------------
 *  src/telemetry/event.ts
 *
 *  Canonical EI-1 event envelope (CD-01).
 *
 *  Every event — both SDK-originated (normalized from OTel) and
 *  extension-originated (`aa.*` namespace) — MUST conform to the
 *  CanonicalEvent shape. Single canonical JSONL log at
 *  `${context.logUri}/agent-arena.events.jsonl`.
 *
 *  See:
 *    - constitution.md lines 480-505 (EI-1)
 *    - specs/20260506-144809-scaffold-application/data-model.md (CanonicalEvent)
 *    - CD-01: snap to SDK names + .v1 suffix; aa.* for extension-only events;
 *             SDK detail under payload.sdk.
 *
 *  Author attribution: copilot(developer:opus-4.7)
 *--------------------------------------------------------------------------------------------*/

import { z } from "zod";

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Stable, namespaced + versioned event identifier. Two namespaces:
 *   - `copilot.<sdk-name>.v1` — SDK-originated events (CD-01 SDK-name-first)
 *   - `aa.<area>.<event>.v1` — extension-only events (no SDK counterpart)
 *
 * The catalog of valid identifiers lives in eventNames.ts (Object.freeze).
 * Identifiers MUST match `^(aa|copilot)\.[a-z._]+\.v[0-9]+$`.
 */
export const EVENT_NAME_PATTERN = /^(aa|copilot)\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.v[0-9]+$/;

/**
 * The canonical envelope. EVERY entry in the JSONL log conforms to this.
 *
 * Validation at write time is intentionally light (CanonicalEventSchema below)
 * so the EventEmitter does not become a bottleneck. The deputy and
 * SOLID SNAKE statically verify event identifier conformance via the
 * eventNames.ts catalog.
 */
export interface CanonicalEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
    /** ISO-8601 UTC, millisecond precision. e.g. "2026-05-06T20:35:12.345Z". */
    ts: string;

    /** Severity. Lowercase. */
    level: LogLevel;

    /** Stable, namespaced + versioned event identifier. See EVENT_NAME_PATTERN. */
    event: string;

    /** Canonical Principle II identity if attributable. Null otherwise. */
    agent_id: string | null;

    /** Trace ID propagating through this causal chain. UUID v4 from the
     *  originating webview envelope, or trace-id portion of an SDK W3C
     *  traceparent. */
    correlation_id: string;

    /** Event-typed payload. Free-form prose lives in payload.message. SDK
     *  detail (when normalized from OTel) preserved verbatim under payload.sdk. */
    payload: TPayload & {
        message?: string;
        sdk?: unknown;
    };
}

/**
 * Runtime schema. Used for validating events that arrive from untrusted
 * sources (e.g. on test ingestion). The EventEmitter does NOT validate every
 * write against this schema (hot path); instead it relies on the type system
 * + the eventNames.ts catalog gate.
 */
export const CanonicalEventSchema = z.object({
    ts: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    level: z.enum(LOG_LEVELS),
    event: z.string().regex(EVENT_NAME_PATTERN),
    agent_id: z.string().min(1).nullable(),
    correlation_id: z.string().uuid(),
    payload: z.record(z.string(), z.unknown()),
});

/**
 * Compose an event with the current timestamp. Pure helper so callers don't
 * have to duplicate `new Date().toISOString()` everywhere. Does NOT validate;
 * use CanonicalEventSchema.safeParse for that.
 */
export function makeEvent<TPayload extends Record<string, unknown>>(
    args: Omit<CanonicalEvent<TPayload>, "ts">,
): CanonicalEvent<TPayload> {
    return {
        ts: new Date().toISOString(),
        ...args,
    };
}
