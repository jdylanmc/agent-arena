/*---------------------------------------------------------------------------------------------
 *  contracts/sdk-adapter.ts
 *
 *  CD-03 fallback (per research.md R-02): the SDK does NOT ship a consumer-facing
 *  test harness, so we introduce this adapter boundary. The extension host imports
 *  ONLY from this module's `SdkAdapter` interface; `CopilotClient` and
 *  `CopilotSession` from `@github/copilot-sdk` are imported solely by
 *  `CopilotSdkAdapter` (the production implementation). Tests substitute a
 *  `FakeSdkAdapter` exercising every behavior enumerated below.
 *
 *  This file is the AUTHORITATIVE shape — the implementation under
 *  `extension/src/sdk/SdkAdapter.ts` MUST import these types directly (or
 *  the build copies them in; the spec dir is the source of truth either way).
 *
 *  Author attribution: copilot(developer:opus-4.7)
 *  Binds: CD-03, FR-010, FR-012, FR-014, FR-015, FR-016, FR-033
 *--------------------------------------------------------------------------------------------*/

import type {
    AssistantMessageEvent,
    MessageOptions,
    PermissionHandler,
    ResumeSessionConfig,
    SessionConfig,
    SessionEvent,
    SessionLifecycleEvent,
} from "@github/copilot-sdk";

/**
 * SOLID note (pre-emptive ISP segregation, anticipating SOLID SNAKE review):
 * The SDK seam is split into TWO single-responsibility interfaces:
 *
 *   - `SdkClientLifecycle`  — start/stop the underlying CopilotClient
 *   - `SdkSessionRegistry`  — create/resume/list/delete sessions
 *
 * Consumers depend ONLY on the interface they need. The harness's `saveHarness`
 * (which only enumerates sessions) imports `SdkSessionRegistry`, NOT `SdkAdapter`.
 * The activation code (which needs both lifecycle and registry) imports
 * `SdkAdapter`, the aggregate.
 *
 * This satisfies ISP (Interface Segregation Principle) and SRP (Single
 * Responsibility Principle): each segregated interface has one reason to change.
 *
 * Production: `CopilotSdkAdapter` (wraps `CopilotClient` + `CopilotSession`)
 *   implements `SdkAdapter` (and therefore both segregated interfaces).
 * Test:        `FakeSdkAdapter` (in-memory; satisfies the behavioral contract below)
 *   implements `SdkAdapter`.
 *
 * EVERY production code path that talks to the SDK MUST go through one of these
 * interfaces. No direct `import` of `CopilotClient` outside of
 * `CopilotSdkAdapter.ts`. The project's ESLint config enforces this with a
 * `no-restricted-imports` rule.
 */

/**
 * Owns the lifecycle of the underlying CopilotClient. Single responsibility:
 * starting and stopping the SDK process. Knows nothing about sessions.
 */
export interface SdkClientLifecycle {
    /**
     * Start the underlying CopilotClient. Idempotent — calling twice is a no-op
     * after the first successful start.
     *
     * `copilotHome` is redirected to a path under `context.globalStorageUri`
     * (FR-011). `telemetryFilePath` is `${context.logUri}/agent-arena.sdk-otel.jsonl`
     * — the SDK writes raw OTel here; the extension's normalizer tails it
     * into the canonical EI-1 log per CD-01 / research R-04.
     *
     * Throws on:
     *   - missing platform CLI binary
     *   - sandbox restriction preventing process spawn
     *   - storage path not writable
     */
    start(opts: { copilotHome: string; telemetryFilePath: string }): Promise<void>;

    /**
     * Stop the underlying CopilotClient. Disposes all sessions. Safe to call on
     * an unstarted adapter.
     */
    stop(): Promise<void>;
}

/**
 * Owns session creation, lookup, and deletion. Single responsibility: managing
 * the catalog of SDK sessions. Knows nothing about client startup/shutdown.
 */
export interface SdkSessionRegistry {
    /**
     * Create a new session with our minted session_id (per session-persistence
     * docs R-05 — without an explicit sessionId, the session is non-resumable).
     *
     * `onPermissionRequest` is the SDK-side hook; in production this is the shim
     * from `extension/src/permission/handler.ts` which delegates to the active
     * `PermissionPolicy` (FR-019 / R-06).
     */
    createSession(
        opts: SessionConfig & { onPermissionRequest: PermissionHandler },
    ): Promise<SdkSessionHandle>;

    /**
     * Resume an existing session by id. If the session directory is missing or
     * the SDK cannot rehydrate it, throws — the caller's harness `loadHarness`
     * is responsible for emitting `aa.harness.session.unrecoverable.v1`
     * (CD-02 + R-05).
     */
    resumeSession(
        sessionId: string,
        opts?: ResumeSessionConfig & { onPermissionRequest?: PermissionHandler },
    ): Promise<SdkSessionHandle>;

    /**
     * Enumerate sessions known to the SDK at the redirected `copilotHome`.
     * Used by the harness `saveHarness` to know which sessions to manifest.
     */
    listSessions(): Promise<ReadonlyArray<{ sessionId: string; createdAt: string }>>;

    /**
     * Permanently delete a session and its on-disk state. Irreversible.
     * Only used by the harness when explicitly cleaning up.
     */
    deleteSession(sessionId: string): Promise<void>;
}

/**
 * Aggregate convenience interface for callers (extension activation code) that
 * legitimately need both lifecycle and registry surfaces. Consumers that only
 * need ONE of the two MUST import the segregated interface, not this aggregate
 * (ISP). ESLint enforces this with `no-restricted-imports`.
 */
export interface SdkAdapter extends SdkClientLifecycle, SdkSessionRegistry {}

/**
 * SOLID note (pre-emptive ISP segregation): the per-session API is also split
 * into two single-responsibility interfaces:
 *
 *   - `SdkSessionLifecycle` — identity + connection state (sessionId, disconnect)
 *   - `SdkSessionMessaging` — the messaging plane (send, subscribe, abort turn)
 *
 * Consumers that only show session identity in UI (e.g. webview status panes)
 * import `SdkSessionLifecycle`. Consumers that route prompts and stream events
 * import `SdkSessionMessaging`. The webview view provider, which needs both,
 * imports `SdkSessionHandle` (the aggregate).
 */

/**
 * Identity + connection state of one SDK session. Single responsibility:
 * tracking which session this is and whether it's still connected. Knows
 * nothing about sending or receiving messages.
 */
export interface SdkSessionLifecycle {
    readonly sessionId: string;

    /**
     * Disconnect from this session. In-memory only — on-disk state preserved
     * for future resume (per CD-02 / R-05). Use
     * `SdkSessionRegistry.deleteSession(sessionId)` to permanently remove
     * session state on disk.
     */
    disconnect(): Promise<void>;
}

/**
 * Messaging plane for one SDK session. Single responsibility: sending prompts
 * to the agent, subscribing to assistant events, and aborting in-flight turns.
 */
export interface SdkSessionMessaging {
    /**
     * Send a prompt to the agent.
     *
     * `mode: "enqueue"` (default for FR-015) queues the prompt if a turn is
     * already running; the SDK processes it after the current turn completes.
     */
    send(opts: MessageOptions & { mode?: "enqueue" }): Promise<void>;

    /**
     * Subscribe to a session event. The SDK distinguishes:
     *
     *   - `SessionEvent` — assistant messages, message deltas, tool calls
     *     (research R-03)
     *   - `SessionLifecycleEvent` — created, idle, ended
     *
     * The handler's return value is awaited; throwing inside the handler does
     * not break the event pump but IS surfaced via `aa.event_handler.failed.v1`.
     *
     * Returns a disposable.
     */
    on<E extends SessionEvent | SessionLifecycleEvent | AssistantMessageEvent>(
        eventType: E extends { type: infer T } ? T : never,
        handler: (event: E) => void | Promise<void>,
    ): { dispose(): void };

    /**
     * Abort the current turn. Idempotent if no turn is running.
     *
     * Implementation detail (research R-11b): exact SDK method name to be
     * verified at /speckit.implement time; the adapter contract is stable
     * regardless of which underlying SDK call we use.
     */
    abortCurrentTurn(): Promise<void>;
}

/**
 * Aggregate per-session handle for callers that legitimately need both
 * lifecycle and messaging. Consumers that only need one MUST import the
 * segregated interface (ISP). The session goes through these states:
 *   created → idle → resumed → idle → ... → ended (per spec.md Key Entities).
 */
export interface SdkSessionHandle extends SdkSessionLifecycle, SdkSessionMessaging {}

/**
 * Behavioral surface that BOTH the production adapter AND the FakeSdkAdapter
 * MUST exercise. The CD-03 + FR-033 + reviewer-finding-#11 contract.
 *
 * The unit test under `extension/test/unit/sdk/adapter-contract.test.ts` runs
 * an identical scenario suite against both adapters; passing the suite is a
 * gate condition for /speckit.implement landing.
 */
export interface AdapterBehavioralContract {
    /** Streaming deltas: at least one `assistant.message_delta` event per turn before the final message. */
    readonly streamingDeltas: true;

    /** Permission allow path: `onPermissionRequest` returns approved → tool runs → success event flows. */
    readonly permissionAllowPath: true;

    /** Permission deny path: `onPermissionRequest` returns denied → tool does not run → assistant acknowledges denial. */
    readonly permissionDenyPath: true;

    /** Queued prompts: send during running turn with `mode: "enqueue"` → second prompt processed after first completes. */
    readonly queuedPrompts: true;

    /** Resume / list: createSession → disconnect → listSessions includes id → resumeSession restores conversation. */
    readonly resumeAndList: true;

    /** Startup failure: `start()` rejects with structured error including underlying exit code. */
    readonly startupFailure: true;

    /** Runtime error: SDK emits a runtime error event mid-turn → adapter surfaces it as a typed event handler. */
    readonly runtimeError: true;
}

export const REQUIRED_BEHAVIORAL_CONTRACT: AdapterBehavioralContract = {
    streamingDeltas: true,
    permissionAllowPath: true,
    permissionDenyPath: true,
    queuedPrompts: true,
    resumeAndList: true,
    startupFailure: true,
    runtimeError: true,
};
