/*---------------------------------------------------------------------------------------------
 *  test/unit/state/Agent.test.ts
 *
 *  Adversarial-review I7: covers the Agent keel — status transitions,
 *  transcript accumulation (A1 streaming + A2 final), correlation_id
 *  pass-through (A5), permission shim (A3 per-kind + A4 SDK-shape
 *  result), and the FR-013 model-config wiring (A12).
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi } from "vitest";

// vi.mock is hoisted to the top of the file — variables it references must
// be declared via vi.hoisted() so they're initialized before the mock.
const { FakeVsCodeEventEmitter } = vi.hoisted(() => {
    class FakeVsCodeEventEmitter<T> {
        private listeners: Array<(value: T) => void> = [];
        readonly event = (l: (value: T) => void): { dispose(): void } => {
            this.listeners.push(l);
            return {
                dispose: () => {
                    this.listeners = this.listeners.filter((x) => x !== l);
                },
            };
        };
        fire(value: T): void {
            for (const l of [...this.listeners]) l(value);
        }
        dispose(): void {
            this.listeners = [];
        }
    }
    return { FakeVsCodeEventEmitter };
});

vi.mock("vscode", () => ({
    EventEmitter: FakeVsCodeEventEmitter,
}));

import { Agent } from "../../../src/state/Agent.js";
import type { CanonicalEvent } from "../../../src/telemetry/event.js";
import type {
    PermissionPolicy,
    PolicyResolver,
    PermissionDecision,
} from "../../../src/permission/PermissionPolicy.js";
import type { SdkAdapter, SdkSessionHandle } from "../../../src/sdk/SdkAdapter.js";
import type { YoloChangeEvent, YoloStore } from "../../../src/state/yolo.js";

class FakeEmitter {
    public emitted: CanonicalEvent[] = [];
    emitNew(event: Omit<CanonicalEvent, "ts">): void {
        this.emitted.push({ ts: "2026-05-06T00:00:00Z", ...event } as CanonicalEvent);
    }
    eventsFor(name: string): CanonicalEvent[] {
        return this.emitted.filter((e) => e.event === name);
    }
}

class FakeYoloStore implements Pick<YoloStore, "get" | "set" | "onDidChange"> {
    private state = new Map<string, boolean>();
    private listeners: Array<(e: YoloChangeEvent) => void> = [];
    get(agentId: string): boolean {
        return this.state.get(agentId) ?? false;
    }
    async set(agentId: string, enabled: boolean): Promise<void> {
        this.state.set(agentId, enabled);
        for (const l of [...this.listeners]) l({ agentId, enabled });
    }
    readonly onDidChange = (l: (e: YoloChangeEvent) => void): { dispose(): void } => {
        this.listeners.push(l);
        return {
            dispose: () => {
                this.listeners = this.listeners.filter((x) => x !== l);
            },
        };
    };
}

class CapturingPolicy implements PermissionPolicy {
    public decisions: Array<{ kind: string; decision: PermissionDecision }> = [];
    constructor(private readonly next: PermissionDecision) {}
    async decide(ctx: {
        request: { kind?: unknown };
    }): Promise<PermissionDecision> {
        const kind =
            typeof ctx.request?.kind === "string" ? (ctx.request.kind as string) : "unknown";
        this.decisions.push({ kind, decision: this.next });
        return this.next;
    }
}

class FakeResolver implements PolicyResolver {
    constructor(private readonly policy: PermissionPolicy) {}
    forAgent(): PermissionPolicy {
        return this.policy;
    }
}

interface FakeHandle {
    sessionId: string;
    send: (opts: { prompt: string }) => Promise<void>;
    on: (
        type: string,
        handler: (event: { type: string; data?: Record<string, unknown> }) => void,
    ) => { dispose(): void };
    abortCurrentTurn: () => Promise<void>;
    disconnect: () => Promise<void>;
}

class FakeAdapter implements SdkAdapter {
    public lastCreateOpts: Record<string, unknown> | undefined;
    public createCallCount = 0;
    /** When set, createSession throws on calls where opts.model === this string,
     *  simulating the SDK's "Model is not available" rejection. */
    public rejectModel: string | undefined;
    public lastPermissionRequest: unknown;
    public lastPermissionResult: unknown;
    public sessions: Array<{ handle: FakeHandle; emit: (e: unknown) => void }> = [];

    async start(): Promise<void> {}
    async stop(): Promise<void> {}

    async createSession(opts: unknown): Promise<SdkSessionHandle> {
        this.createCallCount += 1;
        const optsModel = (opts as { model?: string }).model;
        if (this.rejectModel !== undefined && optsModel === this.rejectModel) {
            throw new Error(`Model "${this.rejectModel}" is not available.`);
        }
        this.lastCreateOpts = opts as Record<string, unknown>;
        const listeners = new Map<string, Array<(e: unknown) => void>>();
        const handle: FakeHandle = {
            sessionId: ((opts as { sessionId?: string }).sessionId ?? "fake"),
            async send() {},
            on: (type, handler) => {
                let bucket = listeners.get(type);
                if (!bucket) {
                    bucket = [];
                    listeners.set(type, bucket);
                }
                bucket.push(handler as (e: unknown) => void);
                return { dispose: () => {} };
            },
            async abortCurrentTurn() {},
            async disconnect() {},
        };
        const emit = (event: unknown): void => {
            const type = (event as { type?: string }).type ?? "";
            const bucket = listeners.get(type);
            if (!bucket) return;
            for (const l of [...bucket]) l(event);
        };
        this.sessions.push({ handle, emit });

        // Drive the permission shim if the test wants to.
        const shim = (opts as { onPermissionRequest?: unknown }).onPermissionRequest;
        if (typeof shim === "function") {
            (this as { _shim?: typeof shim })._shim = shim as never;
        }
        return handle as unknown as SdkSessionHandle;
    }
    async resumeSession(): Promise<SdkSessionHandle> {
        throw new Error("not used");
    }
    async listSessions(): Promise<ReadonlyArray<{ sessionId: string; createdAt: string }>> {
        return [];
    }
    async deleteSession(): Promise<void> {}

    /** Drive the permission shim with a request and capture the result. */
    async drivePermission(request: unknown): Promise<unknown> {
        const shim = (this as { _shim?: (req: unknown, inv: { sessionId: string }) => Promise<unknown> })
            ._shim;
        if (!shim) throw new Error("no shim wired (createSession not called)");
        this.lastPermissionRequest = request;
        const res = await shim(request, { sessionId: "fake" });
        this.lastPermissionResult = res;
        return res;
    }
}

function buildAgent(opts: {
    sdk: SdkAdapter;
    emitter: FakeEmitter;
    policy: PermissionPolicy;
    yolo: FakeYoloStore;
    model?: string;
}): Agent {
    const resolver = new FakeResolver(opts.policy);
    const agentOpts: ConstructorParameters<typeof Agent>[0] = {
        id: "primary",
        displayName: "Main Developer",
        sdk: opts.sdk,
        workingDirectory: "/repo",
        bannerSubtitle: "test",
        adapterKind: "fake-demo",
        yoloStore: opts.yolo as unknown as YoloStore,
        policyResolver: resolver,
        emitter: opts.emitter as never,
    };
    if (opts.model !== undefined) agentOpts.model = opts.model;
    return new Agent(agentOpts);
}

describe("Agent — basic shape", () => {
    it("starts in idle status and exposes a snapshot", () => {
        const sdk = new FakeAdapter();
        const emitter = new FakeEmitter();
        const policy = new CapturingPolicy({ kind: "allow" });
        const yolo = new FakeYoloStore();
        const agent = buildAgent({ sdk, emitter, policy, yolo });
        const snap = agent.getSnapshot();
        expect(snap.id).toBe("primary");
        expect(snap.status).toBe("idle");
        expect(snap.transcript).toEqual([]);
        expect(snap.yoloEnabled).toBe(false);
    });
});

describe("Agent.submitPrompt — A1 streaming flag + A12 model config + A5 correlation_id", () => {
    it("creates the SDK session with streaming: true", async () => {
        const sdk = new FakeAdapter();
        const emitter = new FakeEmitter();
        const policy = new CapturingPolicy({ kind: "allow" });
        const agent = buildAgent({ sdk, emitter, policy, yolo: new FakeYoloStore() });
        await agent.submitPrompt("hello");
        expect(sdk.lastCreateOpts?.["streaming"]).toBe(true);
    });

    it("forwards the configured model into createSession (FR-013 / A12)", async () => {
        const sdk = new FakeAdapter();
        const agent = buildAgent({
            sdk,
            emitter: new FakeEmitter(),
            policy: new CapturingPolicy({ kind: "allow" }),
            yolo: new FakeYoloStore(),
            model: "gpt-5.2-codex",
        });
        await agent.submitPrompt("hi");
        expect(sdk.lastCreateOpts?.["model"]).toBe("gpt-5.2-codex");
    });

    it("omits model when none is configured", async () => {
        const sdk = new FakeAdapter();
        const agent = buildAgent({
            sdk,
            emitter: new FakeEmitter(),
            policy: new CapturingPolicy({ kind: "allow" }),
            yolo: new FakeYoloStore(),
        });
        await agent.submitPrompt("hi");
        expect(sdk.lastCreateOpts && "model" in sdk.lastCreateOpts).toBe(false);
    });

    it("threads the supplied correlation_id through every prompt event (A5 / CD-04)", async () => {
        const sdk = new FakeAdapter();
        const emitter = new FakeEmitter();
        const agent = buildAgent({
            sdk,
            emitter,
            policy: new CapturingPolicy({ kind: "allow" }),
            yolo: new FakeYoloStore(),
        });
        await agent.submitPrompt("hi", "corr-from-envelope");
        const chain = emitter.emitted.filter((e) =>
            e.event.startsWith("aa.agent."),
        );
        expect(chain.length).toBeGreaterThan(0);
        for (const evt of chain) {
            expect(evt.correlation_id).toBe("corr-from-envelope");
        }
    });

    it("retries createSession without model when SDK rejects with 'Model is not available'", async () => {
        const sdk = new FakeAdapter();
        sdk.rejectModel = "gpt-5.2-codex";
        const emitter = new FakeEmitter();
        const agent = buildAgent({
            sdk,
            emitter,
            policy: new CapturingPolicy({ kind: "allow" }),
            yolo: new FakeYoloStore(),
            model: "gpt-5.2-codex",
        });
        await agent.submitPrompt("hi", "c1");
        // Two createSession calls: first with model (rejected), second
        // without model (succeeded).
        expect(sdk.createCallCount).toBe(2);
        expect(sdk.lastCreateOpts && "model" in sdk.lastCreateOpts).toBe(false);
        // The agent should have proceeded — submitPrompt completed.
        const sendStarted = emitter.eventsFor("aa.agent.send.started.v1");
        expect(sendStarted).toHaveLength(1);
        // And a warning emit was logged with the rejected model + fallback marker.
        const warns = emitter.eventsFor("aa.agent.session.ensure_failed.v1");
        expect(warns).toHaveLength(1);
        const wpayload = warns[0]!.payload as { rejectedModel?: string; fallback?: string };
        expect(wpayload.rejectedModel).toBe("gpt-5.2-codex");
        expect(wpayload.fallback).toBe("retry_without_model");
    });

    it("does NOT retry when no model is configured (errors propagate as before)", async () => {
        const sdk = new FakeAdapter();
        // No rejectModel set — but force a different error.
        sdk.rejectModel = "anything";
        const agent = buildAgent({
            sdk,
            emitter: new FakeEmitter(),
            policy: new CapturingPolicy({ kind: "allow" }),
            yolo: new FakeYoloStore(),
            // model is undefined here
        });
        await agent.submitPrompt("hi");
        // Without a configured model, opts.model is undefined, doesn't
        // match rejectModel, so no error — only one create call.
        expect(sdk.createCallCount).toBe(1);
    });

    it("does NOT retry on non-model errors (re-throws)", async () => {
        const sdk = new FakeAdapter();
        const originalCreate = sdk.createSession.bind(sdk);
        let calls = 0;
        sdk.createSession = async (opts) => {
            calls += 1;
            if (calls === 1) throw new Error("authentication failed");
            return originalCreate(opts);
        };
        const emitter = new FakeEmitter();
        const agent = buildAgent({
            sdk,
            emitter,
            policy: new CapturingPolicy({ kind: "allow" }),
            yolo: new FakeYoloStore(),
            model: "gpt-5.2-codex",
        });
        await agent.submitPrompt("hi");
        // Only one create call — error propagated, no retry.
        expect(calls).toBe(1);
        const fails = emitter.eventsFor("aa.agent.session.ensure_failed.v1");
        // The submitPrompt outer catch logs the error, but the payload
        // should NOT carry the fallback marker.
        expect(fails.length).toBeGreaterThan(0);
        const fpayload = fails[0]!.payload as { fallback?: string };
        expect(fpayload.fallback).toBeUndefined();
    });
});

describe("Agent — transcript accumulation (A1+A2)", () => {
    it("records streaming chunks then assembles the final text", async () => {
        const sdk = new FakeAdapter();
        const agent = buildAgent({
            sdk,
            emitter: new FakeEmitter(),
            policy: new CapturingPolicy({ kind: "allow" }),
            yolo: new FakeYoloStore(),
        });
        const finals: Array<{ turnId: string; text: string }> = [];
        const deltas: string[] = [];
        agent.onAssistantDelta((e) => deltas.push(e.chunk));
        agent.onAssistantFinal((e) => finals.push(e));

        await agent.submitPrompt("hi", "c1");
        const session = sdk.sessions[0]!;
        session.emit({ type: "assistant.message_delta", data: { deltaContent: "hel" } });
        session.emit({ type: "assistant.message_delta", data: { deltaContent: "lo" } });
        session.emit({ type: "assistant.message", data: { content: "hello" } });

        expect(deltas).toEqual(["hel", "lo"]);
        expect(finals).toHaveLength(1);
        expect(finals[0]!.text).toBe("hello");

        const snap = agent.getSnapshot();
        expect(snap.transcript).toHaveLength(1);
        const turn = snap.transcript[0]!;
        expect(turn.chunks).toEqual(["hel", "lo"]);
        expect(turn.final).toBe("hello");
    });

    it("does NOT subscribe to assistant.streaming_delta (A6 — that event has no content)", async () => {
        const sdk = new FakeAdapter();
        const agent = buildAgent({
            sdk,
            emitter: new FakeEmitter(),
            policy: new CapturingPolicy({ kind: "allow" }),
            yolo: new FakeYoloStore(),
        });
        const deltas: string[] = [];
        agent.onAssistantDelta((e) => deltas.push(e.chunk));
        await agent.submitPrompt("hi", "c1");
        const session = sdk.sessions[0]!;
        session.emit({
            type: "assistant.streaming_delta",
            data: { totalResponseSizeBytes: 42 },
        });
        // No subscriber means no delta gets fired (also no crash).
        expect(deltas).toEqual([]);
    });
});

describe("Agent permission shim — A3 per-kind + A4 SDK-shape result", () => {
    it("forwards the SDK PermissionRequest verbatim into the policy", async () => {
        const policy = new CapturingPolicy({ kind: "allow" });
        const sdk = new FakeAdapter();
        const agent = buildAgent({
            sdk,
            emitter: new FakeEmitter(),
            policy,
            yolo: new FakeYoloStore(),
        });
        await agent.submitPrompt("hi");
        await sdk.drivePermission({
            kind: "shell",
            toolCallId: "tc-1",
            fullCommandText: "echo howdy",
            intention: "print",
        });
        expect(policy.decisions).toHaveLength(1);
        expect(policy.decisions[0]!.kind).toBe("shell");
        void agent;
    });

    it("maps allow → {kind:'approved'} (SDK union)", async () => {
        const sdk = new FakeAdapter();
        const agent = buildAgent({
            sdk,
            emitter: new FakeEmitter(),
            policy: new CapturingPolicy({ kind: "allow", reason: "ok" }),
            yolo: new FakeYoloStore(),
        });
        await agent.submitPrompt("hi");
        const result = (await sdk.drivePermission({ kind: "shell" })) as { kind: string };
        expect(result.kind).toBe("approved");
        void agent;
    });

    it("maps deny → {kind:'denied-interactively-by-user', feedback}", async () => {
        const sdk = new FakeAdapter();
        const agent = buildAgent({
            sdk,
            emitter: new FakeEmitter(),
            policy: new CapturingPolicy({ kind: "deny", reason: "user_said_no" }),
            yolo: new FakeYoloStore(),
        });
        await agent.submitPrompt("hi");
        const result = (await sdk.drivePermission({ kind: "shell" })) as {
            kind: string;
            feedback?: string;
        };
        expect(result.kind).toBe("denied-interactively-by-user");
        expect(result.feedback).toBe("user_said_no");
        void agent;
    });

    it("maps ask → {kind:'denied-no-approval-rule-and-could-not-request-from-user'}", async () => {
        const sdk = new FakeAdapter();
        const agent = buildAgent({
            sdk,
            emitter: new FakeEmitter(),
            policy: new CapturingPolicy({ kind: "ask" }),
            yolo: new FakeYoloStore(),
        });
        await agent.submitPrompt("hi");
        const result = (await sdk.drivePermission({ kind: "shell" })) as { kind: string };
        expect(result.kind).toBe("denied-no-approval-rule-and-could-not-request-from-user");
        void agent;
    });

    it("emits aa.permission.policy_error.v1 when the policy throws and denies safely", async () => {
        const throwingPolicy: PermissionPolicy = {
            async decide() {
                throw new Error("kaboom");
            },
        };
        const emitter = new FakeEmitter();
        const sdk = new FakeAdapter();
        const agent = buildAgent({
            sdk,
            emitter,
            policy: throwingPolicy,
            yolo: new FakeYoloStore(),
        });
        await agent.submitPrompt("hi", "c1");
        const result = (await sdk.drivePermission({ kind: "shell" })) as { kind: string };
        expect(result.kind).toBe("denied-interactively-by-user");
        expect(emitter.eventsFor("aa.permission.policy_error.v1")).toHaveLength(1);
        void agent;
    });
});

describe("Agent — yolo subscription", () => {
    it("fires snapshot on yolo change and emits aa.yolo.toggled.v1 with source: agent", async () => {
        const yolo = new FakeYoloStore();
        const emitter = new FakeEmitter();
        const sdk = new FakeAdapter();
        const agent = buildAgent({
            sdk,
            emitter,
            policy: new CapturingPolicy({ kind: "allow" }),
            yolo,
        });
        const snapshots: Array<{ yoloEnabled: boolean }> = [];
        agent.onStatusChange((s) => snapshots.push(s));
        await yolo.set("primary", true);
        expect(snapshots.length).toBeGreaterThan(0);
        expect(agent.getSnapshot().yoloEnabled).toBe(true);
        const yoloEvents = emitter.eventsFor("aa.yolo.toggled.v1");
        expect(yoloEvents.length).toBe(1);
        const payload = yoloEvents[0]!.payload as { source: string };
        expect(payload.source).toBe("agent");
    });
});
