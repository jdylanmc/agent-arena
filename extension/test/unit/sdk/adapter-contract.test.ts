/*---------------------------------------------------------------------------------------------
 *  test/unit/sdk/adapter-contract.test.ts
 *
 *  Covers task T030 (failing test) → T031/T032 (impl).
 *
 *  Exercises every entry of REQUIRED_BEHAVIORAL_CONTRACT against the
 *  FakeSdkAdapter. The same test suite will also be run against
 *  CopilotSdkAdapter once it lands (with mocked CLI process), so production
 *  and test adapters provably implement the same contract (LSP per SOLID).
 *--------------------------------------------------------------------------------------------*/

// The FakeSession's `on` is loosely typed for testing convenience — we cast
// through `unknown` when calling it from test code with our broader
// `FakeSessionEvent` shape. The real `SdkSessionHandle.on` is strict (takes
// SDK SessionEvent / SessionLifecycleEvent / AssistantMessageEvent unions);
// the Fake's behavior is what matters for these tests, not the type
// conformance of the dispatcher.
type FakeSessionApi = {
    sessionId: string;
    send(opts: { prompt?: string; mode?: "enqueue" }): Promise<void>;
    on<E extends FakeSessionEvent>(
        eventType: string,
        handler: (event: E) => void | Promise<void>,
    ): { dispose(): void };
    abortCurrentTurn(): Promise<void>;
    disconnect(): Promise<void>;
};

import { describe, it, expect } from "vitest";
import { FakeSdkAdapter, type FakeSessionEvent } from "../../../src/sdk/FakeSdkAdapter.js";
import {
    REQUIRED_BEHAVIORAL_CONTRACT,
    type SdkSessionHandle,
} from "../../../src/sdk/SdkAdapter.js";

const asFake = (h: SdkSessionHandle): FakeSessionApi => h as unknown as FakeSessionApi;

describe("REQUIRED_BEHAVIORAL_CONTRACT", () => {
    it("declares every behavior the contract requires", () => {
        expect(REQUIRED_BEHAVIORAL_CONTRACT.streamingDeltas).toBe(true);
        expect(REQUIRED_BEHAVIORAL_CONTRACT.permissionAllowPath).toBe(true);
        expect(REQUIRED_BEHAVIORAL_CONTRACT.permissionDenyPath).toBe(true);
        expect(REQUIRED_BEHAVIORAL_CONTRACT.queuedPrompts).toBe(true);
        expect(REQUIRED_BEHAVIORAL_CONTRACT.resumeAndList).toBe(true);
        expect(REQUIRED_BEHAVIORAL_CONTRACT.startupFailure).toBe(true);
        expect(REQUIRED_BEHAVIORAL_CONTRACT.runtimeError).toBe(true);
    });
});

describe("FakeSdkAdapter — streamingDeltas", () => {
    it("emits assistant.message_delta events followed by assistant.message", async () => {
        const fake = new FakeSdkAdapter();
        await fake.start();
        const session = await fake.createSession({ sessionId: "s1" });
        const deltas: string[] = [];
        let final = "";
        asFake(session).on<FakeSessionEvent>("assistant.message_delta", (e) => {
            deltas.push(String((e["data"] as { deltaContent?: string })?.deltaContent ?? ""));
        });
        asFake(session).on<FakeSessionEvent>("assistant.message", (e) => {
            final = String((e["data"] as { content?: string })?.content ?? "");
        });
        await session.send({ prompt: "Reply: pong" } as never);
        fake.triggerStreamingResponse("s1", ["po", "ng"]);
        expect(deltas).toEqual(["po", "ng"]);
        expect(final).toBe("pong");
    });
});

describe("FakeSdkAdapter — permission allow/deny", () => {
    it("delivers permission requests with the chosen decision marker (allow)", async () => {
        const fake = new FakeSdkAdapter();
        await fake.start();
        const session = await fake.createSession({ sessionId: "s2" });
        let received: FakeSessionEvent | undefined;
        asFake(session).on<FakeSessionEvent>("permission.request", (e) => {
            received = e;
        });
        fake.triggerPermissionRequest(
            "s2",
            { toolName: "writeFile", summary: "create scratch.txt", requestId: "r1" },
            "allow",
        );
        const data = received?.["data"] as { decision?: string; toolName?: string } | undefined;
        expect(data?.decision).toBe("allow");
        expect(data?.toolName).toBe("writeFile");
    });

    it("delivers permission requests with the chosen decision marker (deny)", async () => {
        const fake = new FakeSdkAdapter();
        await fake.start();
        const session = await fake.createSession({ sessionId: "s3" });
        let received: FakeSessionEvent | undefined;
        asFake(session).on<FakeSessionEvent>("permission.request", (e) => {
            received = e;
        });
        fake.triggerPermissionRequest(
            "s3",
            { toolName: "writeFile", summary: "create scratch.txt", requestId: "r2" },
            "deny",
        );
        const data = received?.["data"] as { decision?: string } | undefined;
        expect(data?.decision).toBe("deny");
    });
});

describe("FakeSdkAdapter — queued prompts", () => {
    it("emits session.prompt_queued when sending during a running turn with mode=enqueue", async () => {
        const fake = new FakeSdkAdapter();
        await fake.start();
        const session = await fake.createSession({ sessionId: "s4" });
        let queued = 0;
        asFake(session).on<FakeSessionEvent>("session.prompt_queued", (e) => {
            const data = e["data"] as { queueDepth?: number } | undefined;
            queued = Number(data?.queueDepth ?? e["queueDepth"]);
        });
        await session.send({ prompt: "first" } as never);
        await session.send({ prompt: "second", mode: "enqueue" } as never);
        expect(queued).toBe(1);
    });
});

describe("FakeSdkAdapter — resume + list", () => {
    it("listSessions reflects created sessions; resumeSession rehydrates", async () => {
        const fake = new FakeSdkAdapter();
        await fake.start();
        const a = await fake.createSession({ sessionId: "alpha" });
        const b = await fake.createSession({ sessionId: "beta" });
        const list = await fake.listSessions();
        expect(list.map((s) => s.sessionId).sort()).toEqual(["alpha", "beta"]);
        await a.disconnect();
        const a2 = await fake.resumeSession("alpha");
        expect(a2.sessionId).toBe("alpha");
        // Resume after disconnect should be re-usable for sending.
        await expect(a2.send({ prompt: "again" } as never)).resolves.toBeUndefined();
        // Cleanup
        await b.disconnect();
    });

    it("deleteSession removes the session", async () => {
        const fake = new FakeSdkAdapter();
        await fake.start();
        await fake.createSession({ sessionId: "to-delete" });
        await fake.deleteSession("to-delete");
        const list = await fake.listSessions();
        expect(list.find((s) => s.sessionId === "to-delete")).toBeUndefined();
    });
});

describe("FakeSdkAdapter — startup failure", () => {
    it("start() rejects with a structured error including exit code", async () => {
        const fake = new FakeSdkAdapter({
            failStart: { code: 127, message: "cli binary not found" },
        });
        await expect(fake.start()).rejects.toThrow(/cli binary not found/);
        await fake
            .start()
            .catch((err: unknown) => {
                expect((err as { code?: number })["code"]).toBe(127);
            });
    });

    it("createSession throws when not started", async () => {
        const fake = new FakeSdkAdapter();
        await expect(fake.createSession({ sessionId: "no-start" })).rejects.toThrow(/start\(\)/);
    });
});

describe("FakeSdkAdapter — runtime error", () => {
    it("emits session.error events that subscribers receive", async () => {
        const fake = new FakeSdkAdapter();
        await fake.start();
        const session = await fake.createSession({ sessionId: "s-err" });
        let received = "";
        asFake(session).on<FakeSessionEvent>("session.error", (e) => {
            const data = e["data"] as { message?: string } | undefined;
            received = String(data?.message ?? "");
        });
        fake.triggerRuntimeError("s-err", "model unavailable");
        expect(received).toBe("model unavailable");
    });
});
