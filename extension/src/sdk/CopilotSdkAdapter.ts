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
 *
 *  The SDK ships as ESM-only (its package.json is `"type": "module"` and
 *  the `exports` map exposes only an `import` condition). Our extension
 *  host bundle is CJS (VS Code's contract for activate()/deactivate()),
 *  so we cannot `require()` it. Dynamic `import()` works in CJS modules
 *  and is preserved by esbuild for externalized packages, so we lazy-load
 *  the SDK on `start()`. Type-only imports below are erased at compile
 *  time and therefore do not require a runtime resolution path.
 *
 *  CLI-binary discovery: the SDK's default `getNodeExecPath()` returns
 *  `process.execPath`, which inside VS Code's extension host points at
 *  the Electron binary (Code.exe), not at `node`. Attempting to spawn
 *  Electron with the bundled `index.js` script fails immediately. To
 *  work around this we explicitly point `cliPath` at the OS-specific
 *  pre-built binary that ships in `@github/copilot-<platform>-<arch>`,
 *  so the SDK spawns the binary directly and skips its Node fallback.
 *
 *  Environment forwarding: we deliberately do NOT spread `process.env`
 *  into the spawned CLI's environment. The extension host's env
 *  contains the user's full shell environment (GH_TOKEN, AWS keys,
 *  arbitrary CI secrets, …) — there's no reason the Copilot CLI needs
 *  any of that. We forward an explicit allowlist of variables the CLI
 *  legitimately needs (PATH, locale, COPILOT_*, OS-standard variables).
 *--------------------------------------------------------------------------------------------*/

import * as path from "node:path";
import { existsSync } from "node:fs";
import type { SdkAdapter, SdkSessionHandle } from "./SdkAdapter.js";
import type * as CopilotSdkModule from "@github/copilot-sdk";
import type {
    CopilotClient,
    CopilotSession,
    CopilotClientOptions,
    GetAuthStatusResponse,
    ModelInfo,
    SessionConfig,
    ResumeSessionConfig,
    MessageOptions,
    PermissionHandler,
    SessionEventType,
    TypedSessionEventHandler,
} from "@github/copilot-sdk";

type SdkModule = typeof CopilotSdkModule;

let cachedSdkModule: SdkModule | undefined;

async function loadSdkModule(): Promise<SdkModule> {
    if (!cachedSdkModule) {
        cachedSdkModule = await import("@github/copilot-sdk");
    }
    return cachedSdkModule;
}

/** Environment variables forwarded to the spawned Copilot CLI. The
 *  allowlist is conservative: PATH for binary lookup, HOME/USERPROFILE
 *  + APPDATA/LOCALAPPDATA + XDG_* for the CLI's per-user state, locale
 *  variables for date/number formatting, OS housekeeping (TEMP/TMP,
 *  PATHEXT, COMSPEC, SYSTEMROOT, OS) so child-process resolution works
 *  on Windows, and an explicit COPILOT_* prefix for any CLI-specific
 *  knobs. Anything else (GH_TOKEN, AWS_*, arbitrary CI secrets) stays
 *  in the extension host.
 *
 *  Exported for testing — no other module should need to read it. */
export const ENV_ALLOWLIST: ReadonlySet<string> = new Set([
    "PATH",
    "HOME",
    "USERPROFILE",
    "USERNAME",
    "USER",
    "LOGNAME",
    "SHELL",
    "LANG",
    "LANGUAGE",
    "LC_ALL",
    "LC_CTYPE",
    "LC_MESSAGES",
    "TZ",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "COMSPEC",
    "PATHEXT",
    "OS",
    "PROCESSOR_ARCHITECTURE",
    "PROCESSOR_IDENTIFIER",
    "NUMBER_OF_PROCESSORS",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "XDG_STATE_HOME",
    "TERM",
    "COLORTERM",
]);

/** Build the env passed to the spawned CLI. Allowlist + COPILOT_* prefix
 *  + any caller-supplied overrides (e.g., COPILOT_HOME). Caller overrides
 *  win over inherited values.
 *
 *  Exported for testing. The first argument is the "base" environment
 *  (production: `process.env`); the second is the overrides. Pure, no
 *  side effects. */
export function buildSpawnedEnv(
    base: Record<string, string | undefined>,
    overrides: Record<string, string | undefined>,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(base)) {
        if (value === undefined) continue;
        if (ENV_ALLOWLIST.has(key) || key.startsWith("COPILOT_")) {
            out[key] = value;
        }
    }
    for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined) out[key] = value;
    }
    return out;
}

export interface CopilotSdkAdapterOptions {
    /** Absolute path to the extension's installation root (typically
     *  `context.extensionUri.fsPath`). Used to locate the bundled
     *  Copilot CLI binary at
     *  `<extensionPath>/node_modules/@github/copilot-<platform>-<arch>/copilot[.exe]`. */
    extensionPath: string;
}

export class CopilotSdkAdapter implements SdkAdapter {
    private client: CopilotClient | undefined;
    private started = false;
    private readonly extensionPath: string;

    constructor(opts: CopilotSdkAdapterOptions) {
        this.extensionPath = opts.extensionPath;
    }

    async start(opts: { copilotHome: string; telemetryFilePath: string }): Promise<void> {
        if (this.started) return;

        const sdk = await loadSdkModule();
        const cliPath = this.resolveBundledCliBinary();

        // The SDK's CopilotClientOptions (v0.1.32) doesn't expose a
        // `telemetry` or `copilotHome` field — those are configured via
        // env vars to the bundled CLI. We redirect COPILOT_HOME via env
        // so the SDK's session state doesn't pollute the user's
        // `~/.copilot/`. Telemetry-file routing is deferred until the SDK
        // exposes `TelemetryConfig` on CopilotClientOptions; until then
        // we rely on the SDK's default log location and the canonical
        // EI-1 log catches the events that matter (per CD-01).
        const options: CopilotClientOptions = {
            cliPath,
            env: buildSpawnedEnv(process.env, { COPILOT_HOME: opts.copilotHome }),
            useLoggedInUser: true,
            autoStart: false,
            autoRestart: true,
            logLevel: "warning",
        };
        this.client = new sdk.CopilotClient(options);
        await this.client.start();
        this.started = true;
        // telemetryFilePath is intentionally unused here — it's still
        // useful for the canonical-log adapter (separately wired in
        // extension.ts).
        void opts.telemetryFilePath;
    }

    async stop(): Promise<void> {
        if (!this.client) return;
        // CopilotClient.stop() returns Error[] (cleanup errors). We emit
        // nothing here; the caller (extension.ts) handles failures.
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
        const sdk = await loadSdkModule();
        // ResumeSessionConfig requires onPermissionRequest. Spread the
        // caller's opts FIRST so a missing key falls through to our
        // default (sdk.approveAll). The previous order put the default
        // BEFORE the spread, which meant a caller-supplied
        // `onPermissionRequest: undefined` would clobber the default.
        const cfg: ResumeSessionConfig = {
            ...(opts ?? {}),
            onPermissionRequest: opts?.onPermissionRequest ?? sdk.approveAll,
        };
        const session = await client.resumeSession(sessionId, cfg);
        return wrapSession(session);
    }

    async listSessions(): Promise<ReadonlyArray<{ sessionId: string; createdAt: string }>> {
        const client = this.requireClient();
        const list = await client.listSessions();
        return list.map((s) => ({
            sessionId: s.sessionId,
            createdAt:
                s.startTime instanceof Date ? s.startTime.toISOString() : new Date().toISOString(),
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

    /** Compute the absolute path of the OS-specific Copilot CLI binary
     *  bundled with the npm package. The binary lives under
     *  `node_modules/@github/copilot-<platform>-<arch>/copilot[.exe]`
     *  inside the extension's install directory. We bypass Node's CJS
     *  resolver because the package's exports map only exposes
     *  `./copilot.exe` (not subpath-resolvable for non-JS files). */
    private resolveBundledCliBinary(): string {
        const platform = process.platform;
        const arch = process.arch;
        const ext = platform === "win32" ? ".exe" : "";
        const binPath = path.join(
            this.extensionPath,
            "node_modules",
            "@github",
            `copilot-${platform}-${arch}`,
            `copilot${ext}`,
        );
        if (!existsSync(binPath)) {
            throw new Error(
                `Bundled Copilot CLI binary not found at ${binPath}. ` +
                    `Ensure @github/copilot is installed for the extension's host platform (${platform}-${arch}).`,
            );
        }
        return binPath;
    }
}

/** Wrap a `CopilotSession` to expose it through our `SdkSessionHandle`
 *  interface. The SDK's `session.on(eventType, handler)` returns an
 *  unsubscribe function; our contract returns a `{ dispose }` disposable.
 *  The SDK's strict event-typed handler is bridged through
 *  `as unknown as` because consumers of `SdkSessionMessaging.on` don't
 *  know the SDK's discriminated event union (per the boundary in
 *  `SdkAdapter.ts`); each consumer narrows by reading `event.type`. */
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
            // The SDK doesn't expose an abort-turn primitive in v0.1.32.
            // Per R-11b this lands when the SDK ships one; for now this is
            // a no-op so the adapter contract stays satisfied.
        },
        async disconnect(): Promise<void> {
            await session.disconnect();
        },
    } as unknown as SdkSessionHandle;
}
