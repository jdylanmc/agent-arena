/*---------------------------------------------------------------------------------------------
 *  src/sdk/FakeSdkAdapter.ts
 *
 *  In-memory implementation of the SDK adapter (CD-03 fallback / R-02).
 *
 *  Two production-relevant uses:
 *    1. Unit + integration tests substitute it for the real SDK so CI doesn't
 *       need a Copilot subscription (FR-033).
 *    2. **Demo mode** — when the user has not signed in to Copilot (or the
 *       extension is launched in the Extension Development Host without
 *       credentials), the extension can wire the Fake instead of
 *       CopilotSdkAdapter so the round-trip surface is visible without
 *       external dependencies. Pass `{ autoRespond: ... }` to opt in.
 *
 *  Behavioral surface conforms to the AdapterBehavioralContract from
 *  src/sdk/SdkAdapter.ts.
 *--------------------------------------------------------------------------------------------*/

import type { SdkAdapter, SdkSessionHandle } from "./SdkAdapter.js";

/**
 * Loose event shape used internally by the Fake. Tests assert on the `type`
 * field and the handler-received payload; we don't need full SDK conformance
 * for the test substrate.
 */
export interface FakeSessionEvent {
    type: string;
    [key: string]: unknown;
}

type Listener = (event: FakeSessionEvent) => void | Promise<void>;

interface FakeSessionState {
    sessionId: string;
    createdAt: string;
    listeners: Map<string, Set<Listener>>;
    queuedPrompts: string[];
    isRunning: boolean;
    disconnected: boolean;
}

export interface FakeSdkAdapterOptions {
    /** Force start() to reject. Used to exercise the startupFailure scenario. */
    failStart?: { code: number; message: string };
    /**
     * When set, calling `session.send({ prompt })` triggers an auto-streamed
     * response built by `autoRespond(prompt)`. Used by the demo mode in
     * extension.ts so the round-trip works without external triggers. The
     * function returns the chunks to stream; total response is the
     * concatenation.
     */
    autoRespond?: (prompt: string) => string[];
    /** Delay between auto-response chunks in milliseconds (default 30ms). */
    autoRespondChunkDelayMs?: number;
}

/**
 * The full Fake. Implements the SdkAdapter aggregate (SdkClientLifecycle +
 * SdkSessionRegistry) and produces SdkSessionHandle instances whose `on`
 * subscriptions feed scenario triggers.
 */
export class FakeSdkAdapter implements SdkAdapter {
    private started = false;
    private readonly sessions = new Map<string, FakeSessionState>();
    private readonly opts: FakeSdkAdapterOptions;

    constructor(opts: FakeSdkAdapterOptions = {}) {
        this.opts = opts;
    }

    // ---- SdkClientLifecycle -------------------------------------------------

    async start(_opts?: { copilotHome: string; telemetryFilePath: string }): Promise<void> {
        if (this.opts.failStart) {
            const err = new Error(`fake startup failed: ${this.opts.failStart.message}`);
            (err as Error & { code?: number }).code = this.opts.failStart.code;
            throw err;
        }
        this.started = true;
    }

    async stop(): Promise<void> {
        for (const session of this.sessions.values()) {
            session.disconnected = true;
            session.listeners.clear();
        }
        this.sessions.clear();
        this.started = false;
    }

    // ---- SdkSessionRegistry -------------------------------------------------

    async createSession(opts: {
        sessionId?: string;
        [key: string]: unknown;
    } | unknown): Promise<SdkSessionHandle> {
        if (!this.started) throw new Error("FakeSdkAdapter: start() must be called before createSession()");
        const sessionId =
            (typeof opts === "object" && opts !== null && "sessionId" in opts
                ? (opts as { sessionId?: string }).sessionId
                : undefined) ?? `fake-${this.sessions.size + 1}`;
        const state: FakeSessionState = {
            sessionId,
            createdAt: new Date().toISOString(),
            listeners: new Map(),
            queuedPrompts: [],
            isRunning: false,
            disconnected: false,
        };
        this.sessions.set(sessionId, state);
        return this.makeHandle(state);
    }

    async resumeSession(
        sessionId: string,
        _opts?: unknown,
    ): Promise<SdkSessionHandle> {
        if (!this.started) throw new Error("FakeSdkAdapter: start() must be called before resumeSession()");
        const existing = this.sessions.get(sessionId);
        if (existing) {
            existing.disconnected = false;
            return this.makeHandle(existing);
        }
        // Re-create the session entry as if loaded from disk.
        const state: FakeSessionState = {
            sessionId,
            createdAt: new Date().toISOString(),
            listeners: new Map(),
            queuedPrompts: [],
            isRunning: false,
            disconnected: false,
        };
        this.sessions.set(sessionId, state);
        return this.makeHandle(state);
    }

    async listSessions(): Promise<ReadonlyArray<{ sessionId: string; createdAt: string }>> {
        return Array.from(this.sessions.values()).map((s) => ({
            sessionId: s.sessionId,
            createdAt: s.createdAt,
        }));
    }

    async deleteSession(sessionId: string): Promise<void> {
        this.sessions.delete(sessionId);
    }

    // ---- Scenario triggers (used by tests; also by demo auto-respond) -------

    /** Emit one or more streaming deltas followed by a final assistant message.
     *  Event shape mirrors `@github/copilot-sdk` (per CD-07): each event has
     *  `{ id, timestamp, parentId, type, data: {...} }` with the
     *  per-`type` data fields the SDK uses (`deltaContent`, `messageId`,
     *  `content`). The Agent reads `event.data.deltaContent` for streaming
     *  chunks and `event.data.content` for the final message — same code
     *  path for the real CopilotSdkAdapter and this Fake. */
    triggerStreamingResponse(sessionId: string, chunks: string[]): void {
        const state = this.requireSession(sessionId);
        const messageId = `msg-${Date.now()}`;
        for (const chunk of chunks) {
            this.dispatch(state, this.makeEvent("assistant.message_delta", {
                messageId,
                deltaContent: chunk,
            }));
        }
        this.dispatch(state, this.makeEvent("assistant.message", {
            messageId,
            content: chunks.join(""),
        }));
        state.isRunning = false;
        this.dispatch(state, this.makeEvent("session.idle", {}));
        // Drain queued prompts, if any.
        const next = state.queuedPrompts.shift();
        if (next !== undefined) {
            void this.driveAutoRespond(state, next);
        }
    }

    /** Emit a permission request. */
    triggerPermissionRequest(
        sessionId: string,
        request: { toolName: string; summary: string; requestId: string },
        decision: "allow" | "deny",
    ): void {
        const state = this.requireSession(sessionId);
        this.dispatch(state, this.makeEvent("permission.request", {
            requestId: request.requestId,
            toolName: request.toolName,
            summary: request.summary,
            decision,
        }));
    }

    /** Surface a runtime error mid-turn. */
    triggerRuntimeError(sessionId: string, errorMessage: string): void {
        const state = this.requireSession(sessionId);
        this.dispatch(state, this.makeEvent("session.error", {
            errorType: "runtime",
            message: errorMessage,
        }));
    }

    // ---- helpers ------------------------------------------------------------

    private requireSession(sessionId: string): FakeSessionState {
        const state = this.sessions.get(sessionId);
        if (!state) throw new Error(`FakeSdkAdapter: no such session ${sessionId}`);
        if (state.disconnected) throw new Error(`FakeSdkAdapter: session ${sessionId} is disconnected`);
        return state;
    }

    /** Build an SDK-shaped event envelope around the per-type data. Keeps
     *  the Fake's event shape isomorphic to the real SDK so consumers can
     *  switch adapters without refactoring their handlers. */
    private makeEvent(type: string, data: Record<string, unknown>): FakeSessionEvent {
        return {
            id: `evt-${this.eventCounter++}`,
            timestamp: new Date().toISOString(),
            parentId: null,
            type,
            data,
        };
    }

    private eventCounter = 0;

    private dispatch(state: FakeSessionState, event: FakeSessionEvent): void {
        const listeners = state.listeners.get(event.type);
        if (!listeners) return;
        for (const listener of [...listeners]) {
            void listener(event);
        }
    }

    /**
     * Demo-mode auto-respond. Emits user.message → message_delta chunks →
     * assistant.message → session.idle. Each chunk is delayed slightly so the
     * UI sees genuine streaming, not a single large blob.
     */
    private async driveAutoRespond(state: FakeSessionState, prompt: string): Promise<void> {
        if (!this.opts.autoRespond) return;
        const chunks = this.opts.autoRespond(prompt);
        const delay = this.opts.autoRespondChunkDelayMs ?? 30;
        const messageId = `msg-${Date.now()}`;
        // session.state already moved to running in send(); emit running event.
        this.dispatch(state, this.makeEvent("session.running", {}));
        for (const chunk of chunks) {
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
            if (state.disconnected) return;
            this.dispatch(state, this.makeEvent("assistant.message_delta", {
                messageId,
                deltaContent: chunk,
            }));
        }
        this.dispatch(state, this.makeEvent("assistant.message", {
            messageId,
            content: chunks.join(""),
        }));
        state.isRunning = false;
        this.dispatch(state, this.makeEvent("session.idle", {}));
        // Drain queued prompts.
        const next = state.queuedPrompts.shift();
        if (next !== undefined) {
            state.isRunning = true;
            void this.driveAutoRespond(state, next);
        }
    }

    private makeHandle(state: FakeSessionState): SdkSessionHandle {
        const dispatch = this.dispatch.bind(this);
        const driveAutoRespond = this.driveAutoRespond.bind(this);
        const makeEvent = this.makeEvent.bind(this);
        const opts = this.opts;
        return {
            get sessionId() {
                return state.sessionId;
            },
            async send(sendOpts: { prompt?: string; mode?: "enqueue" }): Promise<void> {
                if (state.disconnected) throw new Error("session disconnected");
                const prompt = sendOpts.prompt ?? "";
                if (state.isRunning && sendOpts.mode === "enqueue") {
                    state.queuedPrompts.push(prompt);
                    dispatch(state, makeEvent("session.prompt_queued", {
                        queueDepth: state.queuedPrompts.length,
                    }));
                    return;
                }
                state.isRunning = true;
                dispatch(state, makeEvent("user.message", { content: prompt }));
                if (opts.autoRespond) {
                    void driveAutoRespond(state, prompt);
                }
            },
            on<E extends FakeSessionEvent>(
                eventType: string,
                handler: (event: E) => void | Promise<void>,
            ): { dispose(): void } {
                let bucket = state.listeners.get(eventType);
                if (!bucket) {
                    bucket = new Set();
                    state.listeners.set(eventType, bucket);
                }
                const wrapped: Listener = (e) => handler(e as E);
                bucket.add(wrapped);
                return {
                    dispose: () => {
                        bucket?.delete(wrapped);
                    },
                };
            },
            async abortCurrentTurn(): Promise<void> {
                state.isRunning = false;
                dispatch(state, makeEvent("session.aborted", {}));
            },
            async disconnect(): Promise<void> {
                state.disconnected = true;
                state.listeners.clear();
            },
        } as unknown as SdkSessionHandle;
    }
}

