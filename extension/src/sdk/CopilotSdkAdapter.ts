/*---------------------------------------------------------------------------------------------
 *  src/sdk/CopilotSdkAdapter.ts
 *
 *  Production implementation of `SdkAdapter` (CD-03) — the **SOLE permitted
 *  importer of `@github/copilot-sdk` runtime values** per the
 *  `no-restricted-imports` ESLint rule. Wraps `CopilotClient` and
 *  `CopilotSession` to satisfy the contract in `./SdkAdapter.ts`.
 *
 *  This file is the only place the rest of the extension talks to the real
 *  Copilot CLI. Tests + demo mode use `FakeSdkAdapter`. The selector at
 *  `selectAdapter.ts` decides between them based on auth status.
 *--------------------------------------------------------------------------------------------*/

import {
    CopilotClient,
    approveAll,
    type CopilotSession,
    type CopilotClientOptions,
    type GetAuthStatusResponse,
    type ModelInfo,
    type SessionConfig,
    type ResumeSessionConfig,
    type MessageOptions,
    type PermissionHandler,
    type SessionEventType,
    type TypedSessionEventHandler,
} from "@github/copilot-sdk";
import type { SdkAdapter, SdkSessionHandle } from "./SdkAdapter.js";

export class CopilotSdkAdapter implements SdkAdapter {
    private client: CopilotClient | undefined;
    private started = false;

    async start(opts: { copilotHome: string; telemetryFilePath: string }): Promise<void> {
        if (this.started) return;

        // The SDK's CopilotClientOptions (v0.1.8) doesn't expose a `telemetry`
        // or `copilotHome` field — those are configured via env vars to the
        // bundled CLI. We redirect COPILOT_HOME via env so the SDK's session
        // state doesn't pollute the user's `~/.copilot/`. Telemetry-file
        // routing is deferred until the SDK exposes `TelemetryConfig` on
        // CopilotClientOptions; until then we rely on the SDK's default log
        // location and the canonical EI-1 log catches the events that matter
        // (per CD-01 normalization).
        const options: CopilotClientOptions = {
            env: {
                ...process.env,
                COPILOT_HOME: opts.copilotHome,
            },
            useLoggedInUser: true,
            autoStart: false,
            autoRestart: true,
            logLevel: "warning",
        };
        this.client = new CopilotClient(options);
        await this.client.start();
        this.started = true;
        // telemetryFilePath is intentionally unused here — it's still useful
        // for the canonical-log adapter (separately wired in extension.ts).
        void opts.telemetryFilePath;
    }

    async stop(): Promise<void> {
        if (!this.client) return;
        // CopilotClient.stop() returns Error[] (cleanup errors). We emit nothing
        // here; the caller (extension.ts) handles failures.
        await this.client.stop();
        this.client = undefined;
        this.started = false;
    }

    async createSession(
        opts: SessionConfig & { onPermissionRequest: PermissionHandler },
    ): Promise<SdkSessionHandle> {
        const client = this.requireClient();
        const session = await client.createSession(opts);
        return wrapSession(session);
    }

    async resumeSession(
        sessionId: string,
        opts?: ResumeSessionConfig & { onPermissionRequest?: PermissionHandler },
    ): Promise<SdkSessionHandle> {
        const client = this.requireClient();
        // ResumeSessionConfig requires onPermissionRequest. Default to
        // approveAll if the caller didn't supply one (edge case — the
        // PrimaryAgentTerminal always supplies one).
        const cfg: ResumeSessionConfig = {
            onPermissionRequest: opts?.onPermissionRequest ?? approveAll,
            ...(opts ?? {}),
        };
        const session = await client.resumeSession(sessionId, cfg);
        return wrapSession(session);
    }

    async listSessions(): Promise<ReadonlyArray<{ sessionId: string; createdAt: string }>> {
        const client = this.requireClient();
        const list = await client.listSessions();
        return list.map((s) => ({
            sessionId: s.sessionId,
            createdAt: s.startTime instanceof Date ? s.startTime.toISOString() : new Date().toISOString(),
        }));
    }

    async deleteSession(sessionId: string): Promise<void> {
        const client = this.requireClient();
        await client.deleteSession(sessionId);
    }

    // ---- Extra methods (NOT on SdkAdapter; used by selectAdapter) ----------

    /** Returns whether the underlying CLI has authenticated successfully.
     *  Used by `selectAdapter()` to decide between this adapter and the
     *  FakeSdkAdapter demo fallback. */
    async getAuthStatus(): Promise<GetAuthStatusResponse> {
        const client = this.requireClient();
        return client.getAuthStatus();
    }

    /** Lists the models the authenticated user can access. Used at startup
     *  by FR-013 to validate `agentArena.primaryAgent.model` against the
     *  user's entitlement. */
    async listModels(): Promise<ModelInfo[]> {
        const client = this.requireClient();
        return client.listModels();
    }

    private requireClient(): CopilotClient {
        if (!this.client) throw new Error("CopilotSdkAdapter: start() must be called first");
        return this.client;
    }
}

/** Wrap a `CopilotSession` to expose it through our `SdkSessionHandle`
 *  interface. The SDK's `session.on(eventType, handler)` returns an
 *  unsubscribe function; our contract returns a `{ dispose }` disposable. */
function wrapSession(session: CopilotSession): SdkSessionHandle {
    return {
        get sessionId() {
            return session.sessionId;
        },
        async send(opts: MessageOptions & { mode?: "enqueue" }): Promise<void> {
            await session.send(opts);
        },
        on<E extends { type: string }>(
            eventType: string,
            handler: (event: E) => void | Promise<void>,
        ): { dispose(): void } {
            const unsubscribe = session.on(
                eventType as SessionEventType,
                handler as unknown as TypedSessionEventHandler<SessionEventType>,
            );
            return { dispose: () => unsubscribe() };
        },
        async abortCurrentTurn(): Promise<void> {
            // The SDK doesn't expose an abort-turn primitive in v0.1.8.
            // Per R-11b this lands when the SDK ships one; for now this is a
            // no-op so the adapter contract stays satisfied. The terminal's
            // Ctrl+C handler catches this case and disconnects the session
            // if the user really wants to stop a runaway turn.
        },
        async disconnect(): Promise<void> {
            await session.disconnect();
        },
    } as unknown as SdkSessionHandle;
}
