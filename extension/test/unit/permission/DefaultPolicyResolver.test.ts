/*---------------------------------------------------------------------------------------------
 *  test/unit/permission/DefaultPolicyResolver.test.ts
 *
 *  Unit tests for DefaultPolicyResolver — the toggle plumbing between
 *  YoloPolicy and PromptUserPolicy. Critical US-2 invariant: the
 *  resolver consults getYolo() on EVERY forAgent call, so a yolo
 *  toggle takes effect on the next tool invocation without restarting
 *  the session (FR-018).
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({
    window: {
        showInformationMessage: vi.fn(),
    },
}));

import { DefaultPolicyResolver } from "../../../src/permission/DefaultPolicyResolver.js";
import { YoloPolicy } from "../../../src/permission/YoloPolicy.js";
import { PromptUserPolicy } from "../../../src/permission/PromptUserPolicy.js";

class FakeEmitter {
    public emitted: unknown[] = [];
    emitNew(event: unknown): void {
        this.emitted.push(event);
    }
}

describe("DefaultPolicyResolver", () => {
    it("returns YoloPolicy when getYolo(agentId) is true", () => {
        const resolver = new DefaultPolicyResolver({
            emitter: new FakeEmitter() as never,
            getYolo: () => true,
        });
        const policy = resolver.forAgent("primary");
        expect(policy).toBeInstanceOf(YoloPolicy);
    });

    it("returns PromptUserPolicy when getYolo(agentId) is false", () => {
        const resolver = new DefaultPolicyResolver({
            emitter: new FakeEmitter() as never,
            getYolo: () => false,
        });
        const policy = resolver.forAgent("primary");
        expect(policy).toBeInstanceOf(PromptUserPolicy);
    });

    it("re-consults getYolo on every forAgent call (FR-018 — toggle without restart)", () => {
        let yolo = false;
        const resolver = new DefaultPolicyResolver({
            emitter: new FakeEmitter() as never,
            getYolo: () => yolo,
        });

        // First call: yolo off → PromptUserPolicy.
        expect(resolver.forAgent("primary")).toBeInstanceOf(PromptUserPolicy);

        // Toggle on.
        yolo = true;
        expect(resolver.forAgent("primary")).toBeInstanceOf(YoloPolicy);

        // Toggle off again.
        yolo = false;
        expect(resolver.forAgent("primary")).toBeInstanceOf(PromptUserPolicy);
    });

    it("passes the agentId through to getYolo", () => {
        const seenAgentIds: string[] = [];
        const resolver = new DefaultPolicyResolver({
            emitter: new FakeEmitter() as never,
            getYolo: (agentId: string) => {
                seenAgentIds.push(agentId);
                return false;
            },
        });
        resolver.forAgent("primary");
        resolver.forAgent("background-1");
        expect(seenAgentIds).toEqual(["primary", "background-1"]);
    });
});
