/*---------------------------------------------------------------------------------------------
 *  test/unit/telemetry/EventEmitter.test.ts
 *
 *  Covers task T028 → T029: JSONL writer + subscriber dispatch + error
 *  isolation per CD-01 / EI-1.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "../../../src/telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../../../src/telemetry/eventNames.js";
import { makeEvent, type CanonicalEvent } from "../../../src/telemetry/event.js";

let tmpDir: string;

beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), "ae-emitter-"));
});

function newEmitter(silent = false): { emitter: EventEmitter; filePath: string } {
    const filePath = resolve(tmpDir, "agent-arena.events.jsonl");
    return { emitter: new EventEmitter({ filePath, silent }), filePath };
}

function fixtureEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
    return makeEvent({
        level: "info",
        event: EVENT_NAMES.AA_EXTENSION_ACTIVATE,
        agent_id: "copilot(developer:opus-4.7)",
        correlation_id: randomUUID(),
        payload: {},
        ...overrides,
    });
}

describe("EventEmitter — disk writes", () => {
    it("creates the parent directory and writes a JSONL line", () => {
        const filePath = resolve(tmpDir, "nested", "deep", "events.jsonl");
        const emitter = new EventEmitter({ filePath });
        const ev = fixtureEvent();
        emitter.emit(ev);
        expect(existsSync(filePath)).toBe(true);
        const contents = readFileSync(filePath, "utf8");
        expect(contents.endsWith("\n")).toBe(true);
        expect(contents.trim().split("\n")).toHaveLength(1);
        const parsed = JSON.parse(contents.trim()) as CanonicalEvent;
        expect(parsed.event).toBe(ev.event);
        expect(parsed.correlation_id).toBe(ev.correlation_id);
    });

    it("appends multiple events as separate JSONL lines", () => {
        const { emitter, filePath } = newEmitter();
        emitter.emit(fixtureEvent());
        emitter.emit(fixtureEvent());
        emitter.emit(fixtureEvent());
        const lines = readFileSync(filePath, "utf8").trim().split("\n");
        expect(lines).toHaveLength(3);
        for (const line of lines) {
            expect(() => JSON.parse(line)).not.toThrow();
        }
    });

    it("silent mode does not write to disk", () => {
        const { emitter, filePath } = newEmitter(true);
        emitter.emit(fixtureEvent());
        expect(existsSync(filePath)).toBe(false);
    });
});

describe("EventEmitter — subscribers", () => {
    it("notifies registered subscribers of every emitted event", () => {
        const { emitter } = newEmitter(true);
        const received: CanonicalEvent[] = [];
        emitter.subscribe((e) => received.push(e));
        const ev = fixtureEvent();
        emitter.emit(ev);
        expect(received).toHaveLength(1);
        expect(received[0]?.event).toBe(ev.event);
    });

    it("notifies multiple subscribers", () => {
        const { emitter } = newEmitter(true);
        const a: CanonicalEvent[] = [];
        const b: CanonicalEvent[] = [];
        emitter.subscribe((e) => a.push(e));
        emitter.subscribe((e) => b.push(e));
        emitter.emit(fixtureEvent());
        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);
    });

    it("subscribe().dispose() removes the subscriber", () => {
        const { emitter } = newEmitter(true);
        const received: CanonicalEvent[] = [];
        const sub = emitter.subscribe((e) => received.push(e));
        emitter.emit(fixtureEvent());
        sub.dispose();
        emitter.emit(fixtureEvent());
        expect(received).toHaveLength(1);
    });
});

describe("EventEmitter — subscriber error isolation (EI-1 audit-trail)", () => {
    it("re-emits AA_EVENT_HANDLER_FAILED when a subscriber throws", () => {
        const { emitter } = newEmitter(true);
        const observed: CanonicalEvent[] = [];
        // First subscriber throws; second subscriber records every event.
        emitter.subscribe(() => {
            throw new Error("boom");
        });
        emitter.subscribe((e) => observed.push(e));
        emitter.emit(fixtureEvent());
        const failedEvent = observed.find(
            (e) => e.event === EVENT_NAMES.AA_EVENT_HANDLER_FAILED,
        );
        expect(failedEvent).toBeDefined();
        expect(failedEvent?.payload["error"]).toContain("boom");
    });

    it("a throwing subscriber does not prevent disk write", () => {
        const { emitter, filePath } = newEmitter();
        emitter.subscribe(() => {
            throw new Error("boom");
        });
        emitter.emit(fixtureEvent());
        expect(existsSync(filePath)).toBe(true);
        const lines = readFileSync(filePath, "utf8").trim().split("\n");
        // Original event + AA_EVENT_HANDLER_FAILED event
        expect(lines.length).toBeGreaterThanOrEqual(2);
    });
});

describe("EventEmitter.emitNew (convenience)", () => {
    it("builds + emits with provided fields", () => {
        const { emitter } = newEmitter(true);
        const observed: CanonicalEvent[] = [];
        emitter.subscribe((e) => observed.push(e));
        emitter.emitNew({
            level: "warn",
            event: EVENT_NAMES.AA_YOLO_TOGGLED,
            agent_id: "copilot(developer:opus-4.7)",
            payload: { agentId: "primary", enabled: true },
        });
        expect(observed).toHaveLength(1);
        expect(observed[0]?.event).toBe(EVENT_NAMES.AA_YOLO_TOGGLED);
        expect(observed[0]?.payload["agentId"]).toBe("primary");
    });

    it("auto-generates correlation_id when not provided", () => {
        const { emitter } = newEmitter(true);
        const observed: CanonicalEvent[] = [];
        emitter.subscribe((e) => observed.push(e));
        emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_EXTENSION_ACTIVATE,
            agent_id: null,
            payload: {},
        });
        expect(observed[0]?.correlation_id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
    });
});

describe("path safety", () => {
    it("uses the OS-correct path separator for nested paths", () => {
        const filePath = resolve(tmpDir, "a", "b", "c.jsonl");
        const emitter = new EventEmitter({ filePath });
        emitter.emit(fixtureEvent());
        expect(filePath.split(sep).length).toBeGreaterThan(2);
    });
});
