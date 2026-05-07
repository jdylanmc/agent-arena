/*---------------------------------------------------------------------------------------------
 *  test/unit/permission/YoloPolicy.test.ts
 *
 *  Unit tests for YoloPolicy. Yolo path always allows and emits the
 *  canonical aa.permission.resolved.v1 event with source=yolo. (US-2.)
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from "vitest";
import { YoloPolicy } from "../../../src/permission/YoloPolicy.js";
import type { CanonicalEvent } from "../../../src/telemetry/event.js";

class FakeEmitter {
    public emitted: CanonicalEvent[] = [];
    emitNew(event: Omit<CanonicalEvent, "ts">): void {
        this.emitted.push({ ts: "2026-05-06T00:00:00Z", ...event } as CanonicalEvent);
    }
}

describe("YoloPolicy", () => {
    let emitter: FakeEmitter;
    let policy: YoloPolicy;

    beforeEach(() => {
        emitter = new FakeEmitter();
        policy = new YoloPolicy(emitter as never);
    });

    it("always returns kind: allow", async () => {
        const decision = await policy.decide({
            agentId: "primary",
            sessionId: "s1",
            correlationId: "c1",
            request: { toolName: "writeFile", summary: "..." } as never,
            invocation: { toolName: "writeFile" } as never,
        });
        expect(decision.kind).toBe("allow");
    });

    it("emits aa.permission.resolved.v1 with source: yolo", async () => {
        await policy.decide({
            agentId: "primary",
            sessionId: "s1",
            correlationId: "c1",
            request: { toolName: "writeFile", summary: "..." } as never,
            invocation: { toolName: "writeFile" } as never,
        });
        expect(emitter.emitted).toHaveLength(1);
        const event = emitter.emitted[0]!;
        expect(event.event).toBe("aa.permission.resolved.v1");
        expect(event.agent_id).toBe("primary");
        expect(event.correlation_id).toBe("c1");
        const payload = event.payload as { decision: string; source: string; toolName: string };
        expect(payload.decision).toBe("allow");
        expect(payload.source).toBe("yolo");
        expect(payload.toolName).toBe("writeFile");
    });

    it("includes reason: yolo in the decision", async () => {
        const decision = await policy.decide({
            agentId: "primary",
            sessionId: "s1",
            correlationId: "c1",
            request: { toolName: "writeFile", summary: "..." } as never,
            invocation: { toolName: "writeFile" } as never,
        });
        expect(decision.kind).toBe("allow");
        if (decision.kind === "allow") {
            expect(decision.reason).toBe("yolo");
        }
    });

    it("falls back to request.toolName if invocation.toolName is missing", async () => {
        await policy.decide({
            agentId: "primary",
            sessionId: "s1",
            correlationId: "c1",
            request: { toolName: "fromRequest", summary: "..." } as never,
            invocation: {} as never,
        });
        const payload = emitter.emitted[0]!.payload as { toolName: string };
        expect(payload.toolName).toBe("fromRequest");
    });
});
