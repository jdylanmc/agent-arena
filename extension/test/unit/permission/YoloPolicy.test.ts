/*---------------------------------------------------------------------------------------------
 *  test/unit/permission/YoloPolicy.test.ts
 *
 *  Unit tests for YoloPolicy. Yolo path always allows and emits the
 *  canonical aa.permission.resolved.v1 event with source=yolo, including
 *  the SDK's `kind` discriminator so the audit trail records what kind
 *  of tool was bypassed.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from "vitest";
import { YoloPolicy } from "../../../src/permission/YoloPolicy.js";
import type { CanonicalEvent } from "../../../src/telemetry/event.js";
import type { PermissionDecisionContext } from "../../../src/permission/PermissionPolicy.js";

class FakeEmitter {
    public emitted: CanonicalEvent[] = [];
    emitNew(event: Omit<CanonicalEvent, "ts">): void {
        this.emitted.push({ ts: "2026-05-06T00:00:00Z", ...event } as CanonicalEvent);
    }
}

function shellCtx(): PermissionDecisionContext {
    return {
        agentId: "primary",
        sessionId: "s1",
        correlationId: "c1",
        request: {
            kind: "shell",
            toolCallId: "tc-1",
            fullCommandText: "echo howdy",
            intention: "echo something",
            commands: [],
            possiblePaths: [],
            possibleUrls: [],
            hasWriteFileRedirection: false,
            canOfferSessionApproval: true,
        } as never,
    };
}

function writeCtx(): PermissionDecisionContext {
    return {
        agentId: "primary",
        sessionId: "s1",
        correlationId: "c1",
        request: {
            kind: "write",
            toolCallId: "tc-2",
            fileName: "scratch.txt",
            intention: "create scratch",
            diff: "+ hello",
        } as never,
    };
}

describe("YoloPolicy", () => {
    let emitter: FakeEmitter;
    let policy: YoloPolicy;

    beforeEach(() => {
        emitter = new FakeEmitter();
        policy = new YoloPolicy(emitter as never);
    });

    it("always returns kind: allow", async () => {
        const decision = await policy.decide(shellCtx());
        expect(decision.kind).toBe("allow");
    });

    it("emits aa.permission.resolved.v1 with source: yolo", async () => {
        await policy.decide(writeCtx());
        expect(emitter.emitted).toHaveLength(1);
        const event = emitter.emitted[0]!;
        expect(event.event).toBe("aa.permission.resolved.v1");
        expect(event.agent_id).toBe("primary");
        expect(event.correlation_id).toBe("c1");
        const payload = event.payload as { decision: string; source: string; kind: string };
        expect(payload.decision).toBe("allow");
        expect(payload.source).toBe("yolo");
        expect(payload.kind).toBe("write");
    });

    it("includes reason: yolo in the decision", async () => {
        const decision = await policy.decide(shellCtx());
        expect(decision.kind).toBe("allow");
        if (decision.kind === "allow") {
            expect(decision.reason).toBe("yolo");
        }
    });

    it("preserves the request kind in the resolved payload (shell)", async () => {
        await policy.decide(shellCtx());
        const payload = emitter.emitted[0]!.payload as { kind: string };
        expect(payload.kind).toBe("shell");
    });
});
