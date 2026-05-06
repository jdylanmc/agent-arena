/*---------------------------------------------------------------------------------------------
 *  test/unit/protocol/envelope.test.ts
 *
 *  Covers tasks T022 (failing test) → T023 (impl).
 *  Validates the CD-04 webview envelope shape and validateEnvelope's rejection
 *  taxonomy.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
    MessageEnvelopeSchema,
    validateEnvelope,
    type MessageEnvelope,
} from "../../../src/protocol/envelope.js";

const validEnvelope = (overrides: Partial<MessageEnvelope> = {}): MessageEnvelope => ({
    protocol_version: 1,
    message_id: randomUUID(),
    correlation_id: randomUUID(),
    type: "webview.ready",
    payload: {},
    ...overrides,
});

describe("MessageEnvelopeSchema", () => {
    it("accepts a minimal valid envelope", () => {
        const env = validEnvelope();
        const result = MessageEnvelopeSchema.safeParse(env);
        expect(result.success).toBe(true);
    });

    it("accepts an envelope with optional session_id and agent_id", () => {
        const env = validEnvelope({
            session_id: "aa-primary-01HXY",
            agent_id: "primary",
        });
        expect(MessageEnvelopeSchema.safeParse(env).success).toBe(true);
    });

    it("rejects protocol_version != 1", () => {
        const result = MessageEnvelopeSchema.safeParse({ ...validEnvelope(), protocol_version: 2 });
        expect(result.success).toBe(false);
    });

    it("rejects a non-UUID message_id", () => {
        const result = MessageEnvelopeSchema.safeParse({
            ...validEnvelope(),
            message_id: "not-a-uuid",
        });
        expect(result.success).toBe(false);
    });

    it("rejects a non-UUID correlation_id", () => {
        const result = MessageEnvelopeSchema.safeParse({
            ...validEnvelope(),
            correlation_id: "not-a-uuid",
        });
        expect(result.success).toBe(false);
    });

    it("rejects an empty type string", () => {
        const result = MessageEnvelopeSchema.safeParse({ ...validEnvelope(), type: "" });
        expect(result.success).toBe(false);
    });

    it("rejects payload that is not an object", () => {
        const result = MessageEnvelopeSchema.safeParse({
            ...validEnvelope(),
            payload: "not an object" as unknown as Record<string, unknown>,
        });
        expect(result.success).toBe(false);
    });
});

describe("validateEnvelope", () => {
    it("returns ok=true for a valid envelope", () => {
        const env = validEnvelope();
        const result = validateEnvelope(env);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.envelope.message_id).toBe(env.message_id);
        }
    });

    it("returns reason=unsupported_protocol_version for protocol_version=2", () => {
        const env = { ...validEnvelope(), protocol_version: 2 };
        const result = validateEnvelope(env);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe("unsupported_protocol_version");
        }
    });

    it("returns reason=envelope_schema_violation for malformed envelope", () => {
        const result = validateEnvelope({ random: "garbage" });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe("envelope_schema_violation");
        }
    });

    it("never throws on garbage input", () => {
        expect(() => validateEnvelope(null)).not.toThrow();
        expect(() => validateEnvelope(undefined)).not.toThrow();
        expect(() => validateEnvelope(42)).not.toThrow();
        expect(() => validateEnvelope([])).not.toThrow();
    });
});
