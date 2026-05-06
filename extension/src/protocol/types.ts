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
export const PermissionRespondSchema = z.object({
    requestId: z.string().min(1),
    decision: z.enum(["allow", "deny"]),
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
export const PermissionPromptSchema = z.object({
    requestId: z.string().min(1),
    toolName: z.string().min(1),
    summary: z.string().min(1),
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

// =============================================================================
// type enum + dispatch table
// =============================================================================

/** Inbound (webview → host) message types. */
export const INBOUND_TYPES = [
    "webview.ready",
    "prompt.submit",
    "yolo.set",
    "permission.respond",
] as const;

/** Outbound (host → webview) message types. */
export const OUTBOUND_TYPES = [
    "assistant.delta",
    "assistant.message.final",
    "permission.prompt",
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
    "permission.respond": PermissionRespondSchema,
    "assistant.delta": AssistantDeltaSchema,
    "assistant.message.final": AssistantMessageFinalSchema,
    "permission.prompt": PermissionPromptSchema,
    "session.state": SessionStateSchema,
    "error": ErrorMessageSchema,
} as const satisfies Record<MessageType, z.ZodSchema>;

/** Compile-time guarantee that MESSAGE_SCHEMAS covers every MessageType. */
type _DispatchCoverage = MessageType extends keyof typeof MESSAGE_SCHEMAS ? true : never;
const _coverageCheck: _DispatchCoverage = true;
void _coverageCheck;
