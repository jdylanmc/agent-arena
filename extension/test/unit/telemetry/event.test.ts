/*---------------------------------------------------------------------------------------------
 *  test/unit/telemetry/event.test.ts
 *
 *  Covers EI-1 canonical envelope schema + makeEvent helper. Pairs with
 *  task T026 (normalizer) + the broader EI-1 binding.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
    CanonicalEventSchema,
    EVENT_NAME_PATTERN,
    LOG_LEVELS,
    makeEvent,
} from "../../../src/telemetry/event.js";

describe("EVENT_NAME_PATTERN", () => {
    it("accepts aa.* event names with .v1 suffix", () => {
        expect(EVENT_NAME_PATTERN.test("aa.extension.activate.v1")).toBe(true);
        expect(EVENT_NAME_PATTERN.test("aa.harness.session.unrecoverable.v1")).toBe(true);
    });

    it("accepts copilot.* event names with .v1 suffix", () => {
        expect(EVENT_NAME_PATTERN.test("copilot.session.created.v1")).toBe(true);
        expect(EVENT_NAME_PATTERN.test("copilot.session.assistant_message_delta.v1")).toBe(true);
    });

    it("accepts .v2, .v10 etc. version suffixes", () => {
        expect(EVENT_NAME_PATTERN.test("aa.extension.activate.v2")).toBe(true);
        expect(EVENT_NAME_PATTERN.test("aa.extension.activate.v10")).toBe(true);
    });

    it("rejects names without a version suffix", () => {
        expect(EVENT_NAME_PATTERN.test("aa.extension.activate")).toBe(false);
        expect(EVENT_NAME_PATTERN.test("copilot.session.created")).toBe(false);
    });

    it("rejects names outside the aa|copilot namespace", () => {
        expect(EVENT_NAME_PATTERN.test("custom.event.v1")).toBe(false);
        expect(EVENT_NAME_PATTERN.test("session.created.v1")).toBe(false);
    });

    it("rejects names with uppercase characters", () => {
        expect(EVENT_NAME_PATTERN.test("aa.Extension.activate.v1")).toBe(false);
    });

    it("rejects names with hyphens (must use underscores)", () => {
        expect(EVENT_NAME_PATTERN.test("aa.extension.assistant-message.v1")).toBe(false);
    });
});

describe("CanonicalEventSchema", () => {
    const validEvent = () => ({
        ts: "2026-05-06T20:35:12.345Z",
        level: "info" as const,
        event: "aa.extension.activate.v1",
        agent_id: "copilot(developer:opus-4.7)",
        correlation_id: randomUUID(),
        payload: {},
    });

    it("accepts a minimal valid event", () => {
        expect(CanonicalEventSchema.safeParse(validEvent()).success).toBe(true);
    });

    it("accepts every level in LOG_LEVELS", () => {
        for (const level of LOG_LEVELS) {
            const ev = { ...validEvent(), level };
            expect(CanonicalEventSchema.safeParse(ev).success).toBe(true);
        }
    });

    it("rejects an event whose name does not match EVENT_NAME_PATTERN", () => {
        const ev = { ...validEvent(), event: "extension.activate" };
        expect(CanonicalEventSchema.safeParse(ev).success).toBe(false);
    });

    it("accepts agent_id=null (non-attributable events)", () => {
        const ev = { ...validEvent(), agent_id: null };
        expect(CanonicalEventSchema.safeParse(ev).success).toBe(true);
    });

    it("rejects a non-ISO ts", () => {
        const ev = { ...validEvent(), ts: "yesterday" };
        expect(CanonicalEventSchema.safeParse(ev).success).toBe(false);
    });

    it("rejects a non-UUID correlation_id", () => {
        const ev = { ...validEvent(), correlation_id: "not-a-uuid" };
        expect(CanonicalEventSchema.safeParse(ev).success).toBe(false);
    });
});

describe("makeEvent", () => {
    it("populates ts with current ISO timestamp", () => {
        const before = Date.now();
        const ev = makeEvent({
            level: "info",
            event: "aa.extension.activate.v1",
            agent_id: "copilot(developer:opus-4.7)",
            correlation_id: randomUUID(),
            payload: {},
        });
        const after = Date.now();
        const eventTime = new Date(ev.ts).getTime();
        expect(eventTime).toBeGreaterThanOrEqual(before);
        expect(eventTime).toBeLessThanOrEqual(after);
        expect(ev.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("preserves payload structure", () => {
        const ev = makeEvent({
            level: "info",
            event: "aa.yolo.toggled.v1",
            agent_id: "copilot(developer:opus-4.7)",
            correlation_id: randomUUID(),
            payload: { agentId: "primary", enabled: true },
        });
        expect(ev.payload.agentId).toBe("primary");
        expect(ev.payload.enabled).toBe(true);
    });
});
