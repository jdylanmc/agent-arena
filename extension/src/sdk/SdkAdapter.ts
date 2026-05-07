/*---------------------------------------------------------------------------------------------
 *  src/sdk/SdkAdapter.ts
 *
 *  CD-03 fallback / R-02 — the seam between the extension and the Copilot SDK.
 *  This file MIRRORS the typed interfaces from
 *  `specs/20260506-144809-scaffold-application/contracts/sdk-adapter.ts`.
 *  Production: CopilotSdkAdapter (wraps CopilotClient + CopilotSession).
 *  Test:        FakeSdkAdapter under test/unit/sdk/.
 *
 *  ISP-segregated per pre-emptive SOLID review (commit 61b44cf): consumers
 *  depend on the narrowest interface that satisfies their needs.
 *--------------------------------------------------------------------------------------------*/

import type {
    MessageOptions,
    PermissionHandler,
    ResumeSessionConfig,
    SessionConfig,
} from "@github/copilot-sdk";

/** Owns the lifecycle of the underlying CopilotClient. */
export interface SdkClientLifecycle {
    start(opts: { copilotHome: string; telemetryFilePath: string }): Promise<void>;
    stop(): Promise<void>;
}

/** Owns session creation, lookup, and deletion. */
export interface SdkSessionRegistry {
    createSession(
        opts: SessionConfig & { onPermissionRequest: PermissionHandler },
    ): Promise<SdkSessionHandle>;

    resumeSession(
        sessionId: string,
        opts?: ResumeSessionConfig & { onPermissionRequest?: PermissionHandler },
    ): Promise<SdkSessionHandle>;

    listSessions(): Promise<ReadonlyArray<{ sessionId: string; createdAt: string }>>;
    deleteSession(sessionId: string): Promise<void>;
}

/** Aggregate; activation code may import this. */
export interface SdkAdapter extends SdkClientLifecycle, SdkSessionRegistry {}

/** Identity + connection state of one SDK session. */
export interface SdkSessionLifecycle {
    readonly sessionId: string;
    disconnect(): Promise<void>;
}

/** Messaging plane for one SDK session.
 *
 *  The `on<E>` signature uses a relaxed `{ type: string }` bound rather
 *  than the SDK's full event union. Two reasons:
 *    - Consumers (Agent and any future per-agent surfaces) MUST NOT
 *      import `@github/copilot-sdk` runtime types per the
 *      no-restricted-imports rule, so they can't supply a SessionEvent
 *      narrowing type argument.
 *    - The wrapping in CopilotSdkAdapter / FakeSdkAdapter already
 *      bridges the strict SDK shape into our adapter contract; the
 *      consumer's job is to read `event.data.<field>` as needed.
 *  This is more — not less — ISP-conformant: consumers depend only on
 *  the property they actually read (`type`), not the full SDK union.
 */
export interface SdkSessionMessaging {
    send(opts: MessageOptions & { mode?: "enqueue" }): Promise<void>;

    on<E extends { type: string }>(
        eventType: string,
        handler: (event: E) => void | Promise<void>,
    ): { dispose(): void };

    abortCurrentTurn(): Promise<void>;
}

/** Aggregate per-session handle. */
export interface SdkSessionHandle extends SdkSessionLifecycle, SdkSessionMessaging {}

/**
 * Behavioral surface that BOTH the production adapter AND the FakeSdkAdapter
 * MUST exercise. The unit test under test/unit/sdk/adapter-contract.test.ts
 * runs an identical scenario suite against both adapters; passing the suite
 * is a gate condition for /speckit.implement landing.
 */
export interface AdapterBehavioralContract {
    readonly streamingDeltas: true;
    readonly permissionAllowPath: true;
    readonly permissionDenyPath: true;
    readonly queuedPrompts: true;
    readonly resumeAndList: true;
    readonly startupFailure: true;
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
