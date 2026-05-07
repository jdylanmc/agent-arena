/*---------------------------------------------------------------------------------------------
 *  test/unit/protocol/types.test.ts
 *
 *  Covers task T044/T045 (per-type Zod schemas + dispatch table coverage).
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import {
    INBOUND_TYPES,
    OUTBOUND_TYPES,
    MESSAGE_SCHEMAS,
    type MessageType,
} from "../../../src/protocol/types.js";

describe("MESSAGE_SCHEMAS dispatch table", () => {
    it("covers every inbound type", () => {
        for (const t of INBOUND_TYPES) {
            expect(MESSAGE_SCHEMAS[t]).toBeDefined();
        }
    });

    it("covers every outbound type", () => {
        for (const t of OUTBOUND_TYPES) {
            expect(MESSAGE_SCHEMAS[t]).toBeDefined();
        }
    });

    it("contains exactly the union of INBOUND + OUTBOUND types", () => {
        const expected = new Set<string>([...INBOUND_TYPES, ...OUTBOUND_TYPES]);
        const actual = new Set(Object.keys(MESSAGE_SCHEMAS));
        expect(actual).toEqual(expected);
    });
});

describe("per-type schemas", () => {
    it("prompt.submit requires non-empty promptText", () => {
        expect(
            MESSAGE_SCHEMAS["prompt.submit"].safeParse({ promptText: "", agentId: "primary" }).success,
        ).toBe(false);
        expect(
            MESSAGE_SCHEMAS["prompt.submit"].safeParse({
                promptText: "Reply: pong",
                agentId: "primary",
            }).success,
        ).toBe(true);
    });

    it("yolo.set requires boolean enabled", () => {
        expect(
            MESSAGE_SCHEMAS["yolo.set"].safeParse({ enabled: "yes", agentId: "primary" }).success,
        ).toBe(false);
        expect(
            MESSAGE_SCHEMAS["yolo.set"].safeParse({ enabled: true, agentId: "primary" }).success,
        ).toBe(true);
    });

    it("session.state restricts status to a known enum", () => {
        expect(
            MESSAGE_SCHEMAS["session.state"].safeParse({ status: "running", sessionId: "s1" }).success,
        ).toBe(true);
        expect(
            MESSAGE_SCHEMAS["session.state"].safeParse({ status: "frozen", sessionId: "s1" }).success,
        ).toBe(false);
    });

    it("error requires recoverable boolean", () => {
        expect(
            MESSAGE_SCHEMAS["error"].safeParse({ code: "x", message: "y", recoverable: false }).success,
        ).toBe(true);
        expect(MESSAGE_SCHEMAS["error"].safeParse({ code: "x", message: "y" }).success).toBe(false);
    });

    it("type literal coverage type-level check", () => {
        const allTypes: MessageType[] = [...INBOUND_TYPES, ...OUTBOUND_TYPES];
        for (const t of allTypes) {
            expect(typeof t).toBe("string");
        }
    });
});
