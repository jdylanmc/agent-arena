/*---------------------------------------------------------------------------------------------
 *  test/unit/sdk/FakeSdkAdapter.ts
 *
 *  In-memory test double for the SDK adapter (CD-03 fallback / R-02).
 *
 *  The production adapter (CopilotSdkAdapter) wraps the real CopilotClient.
 *  The Fake substitutes for it in tests, exercising the full
 *  AdapterBehavioralContract from src/sdk/SdkAdapter.ts:
 *
 *    - streamingDeltas
 *    - permissionAllowPath
 *    - permissionDenyPath
 *    - queuedPrompts
 *    - resumeAndList
 *    - startupFailure
 *    - runtimeError
 *
 *  Scenarios are triggered by calling `triggerXxx()` methods on the Fake;
 *  the Fake then dispatches synthetic events to every subscriber registered
 *  via `session.on(eventType, handler)`. This keeps tests deterministic — no
 *  timers, no I/O.
 *--------------------------------------------------------------------------------------------*/

import type { SdkAdapter, SdkSessionHandle } from "../../../src/sdk/SdkAdapter.js";

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

    async start(): Promise<void> {
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

    // ---- Scenario triggers --------------------------------------------------

    /** Emit one or more streaming deltas followed by a final assistant message. */
    triggerStreamingResponse(sessionId: string, chunks: string[]): void {
        const state = this.requireSession(sessionId);
        const turnId = `turn-${Date.now()}`;
        for (const chunk of chunks) {
            this.dispatch(state, {
                type: "assistant.message_delta",
                sessionId,
                turnId,
                chunk,
            });
        }
        this.dispatch(state, {
            type: "assistant.message",
            sessionId,
            turnId,
            text: chunks.join(""),
        });
        state.isRunning = false;
        this.dispatch(state, { type: "session.idle", sessionId });
    }

    /** Emit a permission request. The handler is invoked with the request and
     *  returns either `{ kind: "approved" }` (caller of `triggerPermissionRequest`
     *  passes `decision: "allow"`) or `{ kind: "denied", reason }`. */
    triggerPermissionRequest(
        sessionId: string,
        request: { toolName: string; summary: string; requestId: string },
        decision: "allow" | "deny",
    ): void {
        const state = this.requireSession(sessionId);
        this.dispatch(state, {
            type: "permission.request",
            sessionId,
            requestId: request.requestId,
            toolName: request.toolName,
            summary: request.summary,
            decision,
        });
    }

    /** Surface a runtime error mid-turn. */
    triggerRuntimeError(sessionId: string, errorMessage: string): void {
        const state = this.requireSession(sessionId);
        this.dispatch(state, {
            type: "session.error",
            sessionId,
            error: errorMessage,
        });
    }

    // ---- helpers ------------------------------------------------------------

    private requireSession(sessionId: string): FakeSessionState {
        const state = this.sessions.get(sessionId);
        if (!state) throw new Error(`FakeSdkAdapter: no such session ${sessionId}`);
        if (state.disconnected) throw new Error(`FakeSdkAdapter: session ${sessionId} is disconnected`);
        return state;
    }

    private dispatch(state: FakeSessionState, event: FakeSessionEvent): void {
        const listeners = state.listeners.get(event.type);
        if (!listeners) return;
        for (const listener of [...listeners]) {
            void listener(event);
        }
    }

    private makeHandle(state: FakeSessionState): SdkSessionHandle {
        const dispatch = this.dispatch.bind(this);
        return {
            get sessionId() {
                return state.sessionId;
            },
            async send(opts: { prompt?: string; mode?: "enqueue" }): Promise<void> {
                if (state.disconnected) throw new Error("session disconnected");
                const prompt = opts.prompt ?? "";
                if (state.isRunning && opts.mode === "enqueue") {
                    state.queuedPrompts.push(prompt);
                    dispatch(state, {
                        type: "session.prompt_queued",
                        sessionId: state.sessionId,
                        queueDepth: state.queuedPrompts.length,
                    });
                    return;
                }
                state.isRunning = true;
                dispatch(state, {
                    type: "user.message",
                    sessionId: state.sessionId,
                    prompt,
                });
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
                dispatch(state, { type: "session.aborted", sessionId: state.sessionId });
            },
            async disconnect(): Promise<void> {
                state.disconnected = true;
                state.listeners.clear();
            },
        } as unknown as SdkSessionHandle;
    }
}
