/*---------------------------------------------------------------------------------------------
 *  src/sdk/selectAdapter.ts
 *
 *  Decides at runtime whether to use the production `CopilotSdkAdapter` or
 *  the in-memory `FakeSdkAdapter` demo fallback. The choice depends on
 *  whether the user is signed in to GitHub Copilot.
 *
 *  Selection algorithm:
 *    1. Construct + start CopilotSdkAdapter.
 *    2. Call getAuthStatus().
 *    3. If isAuthenticated === true → use CopilotSdkAdapter.
 *    4. Otherwise → stop CopilotSdkAdapter; fall back to FakeSdkAdapter.
 *    5. If anything throws during steps 1-3 (CLI binary missing, sandbox
 *       restriction, etc.) → fall back to FakeSdkAdapter.
 *
 *  Emits `aa.sdk.adapter.selected.v1` describing the chosen adapter and
 *  reason. All paths produce a started, ready-to-use SdkAdapter.
 *--------------------------------------------------------------------------------------------*/

import type { EventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";
import { CopilotSdkAdapter } from "./CopilotSdkAdapter.js";
import { FakeSdkAdapter } from "./FakeSdkAdapter.js";
import type { SdkAdapter } from "./SdkAdapter.js";

export interface AdapterSelection {
    adapter: SdkAdapter;
    kind: "copilot" | "fake-demo";
    /** Present when kind === "copilot". */
    auth?: {
        authType?: string;
        login?: string;
    };
    /** Present when kind === "fake-demo". One of:
     *    - "not_authenticated"    — CLI started but auth failed
     *    - "start_failed"         — CLI failed to start
     *    - "fake_forced"          — caller asked to force demo mode */
    fallbackReason?: "not_authenticated" | "start_failed" | "fake_forced";
}

export interface SelectAdapterOptions {
    emitter: EventEmitter;
    extensionPath: string;
    copilotHome: string;
    telemetryFilePath: string;
    fakeAutoRespond: (prompt: string) => string[];
    fakeAutoRespondChunkDelayMs?: number;
    /** Force demo mode regardless of auth. Used by tests / debug. */
    forceFake?: boolean;
}

export async function selectAdapter(opts: SelectAdapterOptions): Promise<AdapterSelection> {
    if (opts.forceFake) {
        const fake = await startFake(opts);
        opts.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_SDK_ADAPTER_SELECTED,
            agent_id: null,
            payload: { kind: "fake-demo", reason: "fake_forced" },
        });
        return { adapter: fake, kind: "fake-demo", fallbackReason: "fake_forced" };
    }

    const real = new CopilotSdkAdapter({ extensionPath: opts.extensionPath });
    try {
        await real.start({
            copilotHome: opts.copilotHome,
            telemetryFilePath: opts.telemetryFilePath,
        });
        const status = await real.getAuthStatus();
        if (status.isAuthenticated) {
            opts.emitter.emitNew({
                level: "info",
                event: EVENT_NAMES.AA_SDK_ADAPTER_SELECTED,
                agent_id: null,
                payload: {
                    kind: "copilot",
                    authType: status.authType,
                    login: status.login,
                },
            });
            const auth: { authType?: string; login?: string } = {};
            if (status.authType !== undefined) auth.authType = status.authType;
            if (status.login !== undefined) auth.login = status.login;
            return {
                adapter: real,
                kind: "copilot",
                auth,
            };
        }
        // CLI started but auth not present — stop and fall through.
        await real.stop();
        opts.emitter.emitNew({
            level: "warn",
            event: EVENT_NAMES.AA_SDK_ADAPTER_SELECTED,
            agent_id: null,
            payload: {
                kind: "fake-demo",
                reason: "not_authenticated",
                statusMessage: status.statusMessage,
            },
        });
        const fake = await startFake(opts);
        return { adapter: fake, kind: "fake-demo", fallbackReason: "not_authenticated" };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        opts.emitter.emitNew({
            level: "warn",
            event: EVENT_NAMES.AA_SDK_ADAPTER_SELECTED,
            agent_id: null,
            payload: { kind: "fake-demo", reason: "start_failed", error: message },
        });
        // Best-effort cleanup if the partial start left a process running.
        try {
            await real.stop();
        } catch {
            /* ignore */
        }
        const fake = await startFake(opts);
        return { adapter: fake, kind: "fake-demo", fallbackReason: "start_failed" };
    }
}

async function startFake(opts: SelectAdapterOptions): Promise<FakeSdkAdapter> {
    const fake = new FakeSdkAdapter({
        autoRespond: opts.fakeAutoRespond,
        autoRespondChunkDelayMs: opts.fakeAutoRespondChunkDelayMs ?? 25,
    });
    await fake.start({
        copilotHome: opts.copilotHome,
        telemetryFilePath: opts.telemetryFilePath,
    });
    return fake;
}
