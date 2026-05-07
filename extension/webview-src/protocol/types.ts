/*---------------------------------------------------------------------------------------------
 *  src/protocol/types.ts
 *
 *  Per-`type` payload schemas for the webview ↔ extension-host protocol (CD-04).
 *
 *  Each entry in MESSAGE_SCHEMAS maps a string `type` to its Zod payload
 *  schema. Adding a new message type requires:
 *
 *    1. Add the type literal to MessageType.
 *    2. Add its Zod schema to MESSAGE_SCHEMAS.
 *    3. Add the row to wiki/docs/webview-protocol.md.
 *    4. Add a round-trip unit test under test/unit/protocol/.
 *
 *  See:
 *    - specs/20260506-144809-scaffold-application/contracts/webview-protocol.md
 *
 *  Author attribution: copilot(developer:opus-4.7)
 *--------------------------------------------------------------------------------------------*/

import { z } from "zod";

// =============================================================================
// webview → host (inbound to extension host)
// =============================================================================

export const WebviewReadySchema = z.object({});
export const PromptSubmitSchema = z.object({
    promptText: z.string().min(1),
    agentId: z.string().min(1),
});
export const YoloSetSchema = z.object({
    enabled: z.boolean(),
    agentId: z.string().min(1),
});

// =============================================================================
// host → webview (outbound to webview)
// =============================================================================

export const AssistantDeltaSchema = z.object({
    chunk: z.string(),
    sessionId: z.string().min(1),
    turnId: z.string().min(1),
});
export const AssistantMessageFinalSchema = z.object({
    text: z.string(),
    sessionId: z.string().min(1),
    turnId: z.string().min(1),
});
export const SessionStateSchema = z.object({
    status: z.enum(["idle", "running", "queued", "error"]),
    sessionId: z.string().min(1),
    yoloRestoredOnOpen: z.boolean().optional(),
});
export const ErrorMessageSchema = z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    recoverable: z.boolean(),
});
/** Initial bootstrap payload sent by the host immediately after the
 *  webview reports itself ready. Carries everything the React shell needs
 *  to render its banner (cwd, adapter kind/login, yolo state) without a
 *  separate round-trip per field, plus the transcript for replay on
 *  panel re-open (per CD-11 §6). */
export const AgentBootstrapSchema = z.object({
    agentId: z.string().min(1),
    workingDirectory: z.string().min(1),
    adapterKind: z.enum(["copilot", "fake-demo"]),
    adapterLogin: z.string().optional(),
    bannerSubtitle: z.string().min(1),
    yoloEnabled: z.boolean(),
    transcript: z
        .array(
            z.object({
                turnId: z.string().min(1),
                chunks: z.array(z.string()),
                final: z.string().optional(),
            }),
        )
        .optional(),
    currentTurnId: z.string().optional(),
});

// =============================================================================
// type enum + dispatch table
// =============================================================================

/** Inbound (webview → host) message types. */
export const INBOUND_TYPES = [
    "webview.ready",
    "prompt.submit",
    "yolo.set",
] as const;

/** Outbound (host → webview) message types. Permission UI uses VS Code's
 *  modal dialogs (CD-07 §6) — there's no in-webview permission surface
 *  in this scaffold, so `permission.prompt` / `permission.respond` are
 *  intentionally absent. Future specs that introduce a richer permission
 *  surface re-add them here. */
export const OUTBOUND_TYPES = [
    "agent.bootstrap",
    "assistant.delta",
    "assistant.message.final",
    "session.state",
    "error",
] as const;

export type InboundMessageType = (typeof INBOUND_TYPES)[number];
export type OutboundMessageType = (typeof OUTBOUND_TYPES)[number];
export type MessageType = InboundMessageType | OutboundMessageType;

/**
 * The dispatch table: maps every recognized `type` string to its payload Zod
 * schema. The receiver looks up `MESSAGE_SCHEMAS[envelope.type]` and validates
 * `envelope.payload` against it. Types not in this table are unknown and MUST
 * be rejected (CD-04 reject-unknown rule).
 */
export const MESSAGE_SCHEMAS = {
    "webview.ready": WebviewReadySchema,
    "prompt.submit": PromptSubmitSchema,
    "yolo.set": YoloSetSchema,
    "agent.bootstrap": AgentBootstrapSchema,
    "assistant.delta": AssistantDeltaSchema,
    "assistant.message.final": AssistantMessageFinalSchema,
    "session.state": SessionStateSchema,
    "error": ErrorMessageSchema,
} as const satisfies Record<MessageType, z.ZodSchema>;

/** Compile-time guarantee that MESSAGE_SCHEMAS covers every MessageType. */
type _DispatchCoverage = MessageType extends keyof typeof MESSAGE_SCHEMAS ? true : never;
const _coverageCheck: _DispatchCoverage = true;
void _coverageCheck;
