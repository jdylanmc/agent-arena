/*---------------------------------------------------------------------------------------------
 *  test/unit/permission/PromptUserPolicy.test.ts
 *
 *  Unit tests for PromptUserPolicy. Allow / deny / dismissed paths each
 *  emit the canonical aa.permission.prompted.v1 + aa.permission.resolved.v1
 *  events (US-2). vscode.window.showInformationMessage is stubbed via
 *  vi.mock so the test runs in pure node.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockShow } = vi.hoisted(() => ({
    mockShow: vi.fn<(...args: unknown[]) => Promise<string | undefined>>(),
}));

vi.mock("vscode", () => ({
    window: {
        showInformationMessage: mockShow,
    },
}));

// Import AFTER vi.mock so the policy picks up the stub.
import { PromptUserPolicy } from "../../../src/permission/PromptUserPolicy.js";
import type { CanonicalEvent } from "../../../src/telemetry/event.js";

class FakeEmitter {
    public emitted: CanonicalEvent[] = [];
    emitNew(event: Omit<CanonicalEvent, "ts">): void {
        this.emitted.push({ ts: "2026-05-06T00:00:00Z", ...event } as CanonicalEvent);
    }
}

const ctx = {
    agentId: "primary",
    sessionId: "s1",
    correlationId: "c1",
    request: { toolName: "writeFile", summary: "create scratch.txt" } as never,
    invocation: { toolName: "writeFile" } as never,
};

describe("PromptUserPolicy", () => {
    let emitter: FakeEmitter;
    let policy: PromptUserPolicy;

    beforeEach(() => {
        mockShow.mockReset();
        emitter = new FakeEmitter();
        policy = new PromptUserPolicy(emitter as never);
    });

    it("returns kind: allow when the user clicks Allow", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        const decision = await policy.decide(ctx);
        expect(decision.kind).toBe("allow");
        if (decision.kind === "allow") {
            expect(decision.reason).toBe("modal_allow");
        }
    });

    it("returns kind: deny with reason: modal_deny when the user clicks Deny", async () => {
        mockShow.mockResolvedValueOnce("Deny");
        const decision = await policy.decide(ctx);
        expect(decision.kind).toBe("deny");
        if (decision.kind === "deny") {
            expect(decision.reason).toBe("modal_deny");
        }
    });

    it("returns kind: deny with reason: modal_dismissed when the user dismisses (undefined)", async () => {
        mockShow.mockResolvedValueOnce(undefined);
        const decision = await policy.decide(ctx);
        expect(decision.kind).toBe("deny");
        if (decision.kind === "deny") {
            expect(decision.reason).toBe("modal_dismissed");
        }
    });

    it("emits aa.permission.prompted.v1 BEFORE the user answers", async () => {
        // Capture the event right when the modal opens, before answering.
        let capturedAtPromptTime = 0;
        mockShow.mockImplementationOnce(async () => {
            capturedAtPromptTime = emitter.emitted.length;
            return "Allow";
        });
        await policy.decide(ctx);
        expect(capturedAtPromptTime).toBe(1);
        expect(emitter.emitted[0]!.event).toBe("aa.permission.prompted.v1");
    });

    it("emits aa.permission.resolved.v1 with source: modal AFTER the user answers", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        await policy.decide(ctx);
        expect(emitter.emitted).toHaveLength(2);
        const resolved = emitter.emitted[1]!;
        expect(resolved.event).toBe("aa.permission.resolved.v1");
        const payload = resolved.payload as { decision: string; source: string };
        expect(payload.decision).toBe("allow");
        expect(payload.source).toBe("modal");
    });

    it("logs decision: deny in resolved when the user denies", async () => {
        mockShow.mockResolvedValueOnce("Deny");
        await policy.decide(ctx);
        const resolved = emitter.emitted[1]!;
        const payload = resolved.payload as { decision: string };
        expect(payload.decision).toBe("deny");
    });

    it("propagates the same correlationId from prompted → resolved", async () => {
        mockShow.mockResolvedValueOnce("Allow");
        await policy.decide(ctx);
        expect(emitter.emitted[0]!.correlation_id).toBe("c1");
        expect(emitter.emitted[1]!.correlation_id).toBe("c1");
    });
});
