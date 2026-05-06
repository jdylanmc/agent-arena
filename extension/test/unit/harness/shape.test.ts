/*---------------------------------------------------------------------------------------------
 *  test/unit/harness/shape.test.ts
 *
 *  Covers task T047 → T048: AgentArenaHarness round-trip via JSON
 *  serialization with deterministic ordering per EI-2 "Diffable" clause.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import {
    EMPTY_HARNESS,
    serializeHarness,
    type AgentArenaHarness,
} from "../../../src/harness/shape.js";

const harness = (overrides: Partial<AgentArenaHarness> = {}): AgentArenaHarness => ({
    harness_version: "1.0.0",
    agents: [{ id: "primary", kind: "primary", yoloMode: false }],
    activeSessionId: null,
    sessions: [],
    ...overrides,
});

describe("EMPTY_HARNESS", () => {
    it("is frozen", () => {
        expect(Object.isFrozen(EMPTY_HARNESS)).toBe(true);
    });

    it("has no agents and no sessions", () => {
        expect(EMPTY_HARNESS.agents).toHaveLength(0);
        expect(EMPTY_HARNESS.sessions).toHaveLength(0);
        expect(EMPTY_HARNESS.activeSessionId).toBeNull();
    });

    it("has harness_version 1.0.0", () => {
        expect(EMPTY_HARNESS.harness_version).toBe("1.0.0");
    });
});

describe("serializeHarness", () => {
    it("produces parseable JSON", () => {
        const out = serializeHarness(harness());
        expect(() => JSON.parse(out)).not.toThrow();
    });

    it("ends with a trailing newline", () => {
        const out = serializeHarness(harness());
        expect(out.endsWith("\n")).toBe(true);
    });

    it("uses 2-space indentation", () => {
        const out = serializeHarness(harness());
        const lines = out.split("\n");
        const firstIndented = lines.find((l) => l.startsWith(" "));
        expect(firstIndented).toMatch(/^ {2}/);
    });

    it("sorts agents by id ascending (stable)", () => {
        const h = harness({
            agents: [
                { id: "z-late", kind: "primary", yoloMode: true },
                { id: "a-early", kind: "primary", yoloMode: false },
            ],
        });
        const out = JSON.parse(serializeHarness(h)) as AgentArenaHarness;
        expect(out.agents.map((a) => a.id)).toEqual(["a-early", "z-late"]);
    });

    it("sorts sessions by session_id ascending", () => {
        const h = harness({
            sessions: [
                {
                    session_id: "aa-primary-zzz",
                    agent_id: "primary",
                    session_dir_path: "session-state/aa-primary-zzz/",
                    content_hash: "0".repeat(64),
                    manifest: { files: [] },
                },
                {
                    session_id: "aa-primary-aaa",
                    agent_id: "primary",
                    session_dir_path: "session-state/aa-primary-aaa/",
                    content_hash: "0".repeat(64),
                    manifest: { files: [] },
                },
            ],
        });
        const out = JSON.parse(serializeHarness(h)) as AgentArenaHarness;
        expect(out.sessions.map((s) => s.session_id)).toEqual([
            "aa-primary-aaa",
            "aa-primary-zzz",
        ]);
    });

    it("sorts manifest.files by name ascending within each session", () => {
        const h = harness({
            sessions: [
                {
                    session_id: "aa-primary-x",
                    agent_id: "primary",
                    session_dir_path: "session-state/aa-primary-x/",
                    content_hash: "0".repeat(64),
                    manifest: {
                        files: [
                            { name: "checkpoints/002.json", size: 100, sha256: "0".repeat(64) },
                            { name: "checkpoints/001.json", size: 100, sha256: "0".repeat(64) },
                            { name: "plan.md", size: 50, sha256: "0".repeat(64) },
                        ],
                    },
                },
            ],
        });
        const out = JSON.parse(serializeHarness(h)) as AgentArenaHarness;
        expect(out.sessions[0]?.manifest.files.map((f) => f.name)).toEqual([
            "checkpoints/001.json",
            "checkpoints/002.json",
            "plan.md",
        ]);
    });

    it("is deterministic: same input → same output bytes", () => {
        const h = harness();
        expect(serializeHarness(h)).toBe(serializeHarness(h));
    });

    it("does not mutate the input", () => {
        const h = harness({
            agents: [
                { id: "z-late", kind: "primary", yoloMode: true },
                { id: "a-early", kind: "primary", yoloMode: false },
            ],
        });
        const before = h.agents.map((a) => a.id);
        serializeHarness(h);
        const after = h.agents.map((a) => a.id);
        expect(after).toEqual(before);
    });

    it("round-trips an empty harness", () => {
        const out = serializeHarness(EMPTY_HARNESS);
        const parsed = JSON.parse(out) as AgentArenaHarness;
        expect(parsed.harness_version).toBe(EMPTY_HARNESS.harness_version);
        expect(parsed.agents).toEqual([]);
        expect(parsed.sessions).toEqual([]);
        expect(parsed.activeSessionId).toBeNull();
    });
});
