/*---------------------------------------------------------------------------------------------
 *  src/webview/messageRouter.ts
 *
 *  Validates inbound webview → host envelopes and dispatches them to typed
 *  handlers. Per CD-04 + the reject-unknown rule:
 *    - envelope schema violations → emit aa.webview.message.rejected.v1, drop
 *    - unknown `type` → emit aa.webview.message.rejected.v1, drop
 *    - per-type payload schema violations → emit aa.webview.message.rejected.v1, drop
 *    - valid envelopes → invoke the handler registered for that type
 *
 *  Handlers MUST NOT throw; if they do, the router catches the throw and emits
 *  aa.event_handler.failed.v1 (via the shared EventEmitter).
 *--------------------------------------------------------------------------------------------*/

import type { z } from "zod";
import type { EventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import { validateEnvelope, type MessageEnvelope } from "../protocol/envelope.js";
import { MESSAGE_SCHEMAS, INBOUND_TYPES, type InboundMessageType } from "../protocol/types.js";

export type InboundHandler<T extends InboundMessageType> = (
    payload: z.infer<(typeof MESSAGE_SCHEMAS)[T]>,
    envelope: MessageEnvelope,
) => void | Promise<void>;

type AnyInboundHandler = (
    payload: unknown,
    envelope: MessageEnvelope,
) => void | Promise<void>;

export class MessageRouter {
    private readonly handlers = new Map<InboundMessageType, AnyInboundHandler>();
    private readonly emitter: EventEmitter;
    private readonly agentId: string | null;

    constructor(emitter: EventEmitter, agentId: string | null = null) {
        this.emitter = emitter;
        this.agentId = agentId;
    }

    on<T extends InboundMessageType>(type: T, handler: InboundHandler<T>): void {
        this.handlers.set(type, handler as AnyInboundHandler);
    }

    /**
     * Dispatch one raw message from the webview. Validates envelope, validates
     * payload, then either calls the handler or emits a rejection event.
     */
    async dispatch(raw: unknown): Promise<void> {
        const envelopeResult = validateEnvelope(raw);
        if (!envelopeResult.ok) {
            this.emitter.emitNew({
                level: "warn",
                event: EVENT_NAMES.AA_WEBVIEW_MESSAGE_REJECTED,
                agent_id: this.agentId,
                payload: {
                    reason: envelopeResult.reason,
                    details: envelopeResult.details,
                },
            });
            return;
        }
        const envelope = envelopeResult.envelope;

        if (!INBOUND_TYPES.includes(envelope.type as InboundMessageType)) {
            this.emitter.emitNew({
                level: "warn",
                event: EVENT_NAMES.AA_WEBVIEW_MESSAGE_REJECTED,
                agent_id: this.agentId,
                correlation_id: envelope.correlation_id,
                payload: {
                    reason: "unknown_type",
                    type: envelope.type,
                },
            });
            return;
        }
        const type = envelope.type as InboundMessageType;
        const schema = MESSAGE_SCHEMAS[type];
        const payloadResult = schema.safeParse(envelope.payload);
        if (!payloadResult.success) {
            this.emitter.emitNew({
                level: "warn",
                event: EVENT_NAMES.AA_WEBVIEW_MESSAGE_REJECTED,
                agent_id: this.agentId,
                correlation_id: envelope.correlation_id,
                payload: {
                    reason: "payload_schema_violation",
                    type,
                    details: payloadResult.error.message,
                },
            });
            return;
        }

        this.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_WEBVIEW_MESSAGE_RECEIVED,
            agent_id: this.agentId,
            correlation_id: envelope.correlation_id,
            payload: { type },
        });

        const handler = this.handlers.get(type);
        if (!handler) return;
        try {
            await handler(payloadResult.data, envelope);
        } catch (err: unknown) {
            this.emitter.emitNew({
                level: "error",
                event: EVENT_NAMES.AA_EVENT_HANDLER_FAILED,
                agent_id: this.agentId,
                correlation_id: envelope.correlation_id,
                payload: {
                    failedEvent: type,
                    error: err instanceof Error ? err.message : String(err),
                },
            });
        }
    }
}
