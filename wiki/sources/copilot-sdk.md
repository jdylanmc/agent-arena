# `@github/copilot-sdk` — synthesis

A TypeScript SDK that gives Node.js applications programmatic control over
the GitHub Copilot CLI via JSON-RPC. This is the seam Agent Arena uses to
talk to a real Copilot model (`CopilotSdkAdapter` per CD-03 / T035).

- **Package**: [`@github/copilot-sdk`](https://www.npmjs.com/package/@github/copilot-sdk) on npm.
- **Repo**: [`github/copilot-sdk`](https://github.com/github/copilot-sdk).
- **Version inspected**: 0.1.32 (current at time of ingestion).
- **License**: MIT.
- **Engine**: requires Node v24+ (the CLI itself enforces this in `npm-loader.js`).

> Raw doc snapshots: [`wiki/raw/copilot-sdk/`](../raw/copilot-sdk/).

## Architecture overview

The SDK is a thin client that spawns or connects to the bundled
**Copilot CLI** server (`@github/copilot-<platform>-<arch>` — a
prebuilt native binary). Communication is JSON-RPC over either stdio
(default) or TCP. The CLI server is the system of record for sessions,
authentication, and tool execution; the SDK forwards requests and
de-multiplexes streamed events back to the caller.

```
┌──────────────────────┐  spawn          ┌───────────────────────┐
│  CopilotClient (SDK) │ ──────────────▶ │  Copilot CLI server   │
│  (your Node process) │   stdio JSONRPC │  (bundled native bin) │
│                      │                 │  - sessions           │
│  - sessions Map      │ ◀────────────── │  - auth (OAuth/gh)    │
│  - event listeners   │   events stream │  - tool sandbox       │
└──────────────────────┘                 │  - LLM proxy          │
                                         └───────────────────────┘
```

The SDK exposes:

- **`CopilotClient`** — owns the CLI process lifecycle and session registry.
- **`CopilotSession`** — one conversational session. Messages, streaming events, permission requests.
- **Permission handlers** (`approveAll`, `denyAll`, `PermissionHandler`) — synchronous callbacks the SDK invokes when the agent wants to run a tool.
- **Hook handlers** (`SessionHooks`) — intercept lifecycle events for instrumentation.
- **Tool definition** (`defineTool`) — register custom tools the agent can call (Zod schemas accepted).

## Key APIs (v0.1.32)

### `new CopilotClient(options?: CopilotClientOptions)`

Construct a client. Common options:

| Option | Type | Default | Purpose |
|---|---|---|---|
| `cliPath` | `string` | bundled `@github/copilot/index.js` | Path to a CLI binary or JS entry point. |
| `cliArgs` | `string[]` | `[]` | Extra args inserted before SDK-managed args. |
| `cwd` | `string` | `process.cwd()` | Working directory of the spawned CLI. |
| `useStdio` | `boolean` | `true` | Stdio transport vs. TCP. |
| `cliUrl` | `string` | — | Connect to an existing CLI server over TCP (mutually exclusive with `useStdio` / `cliPath`). |
| `logLevel` | `'none'\|'error'\|'warning'\|'info'\|'debug'\|'all'` | `'warning'` | CLI log verbosity. |
| `autoStart` | `boolean` | `true` | Auto-start CLI on first use. |
| `autoRestart` | `boolean` | `true` | Auto-restart on crash. |
| `env` | `Record<string,string>` | `process.env` | Environment passed to the spawned CLI. |
| `githubToken` | `string` | — | Explicit token; takes priority over `useLoggedInUser`. |
| `useLoggedInUser` | `boolean` | `true` (false if `githubToken`) | Use stored OAuth tokens or `gh CLI auth`. |

**Lifecycle**:

```ts
await client.start();              // spawn (or connect to) the CLI
const session = await client.createSession({ ... });
// ...
await session.disconnect();
const errors = await client.stop(); // returns Error[] — non-empty means cleanup partially failed
```

**Sessions**:

```ts
await client.createSession(config: SessionConfig): Promise<CopilotSession>
await client.resumeSession(sessionId, config: ResumeSessionConfig): Promise<CopilotSession>
await client.listSessions(filter?): Promise<SessionMetadata[]>
await client.deleteSession(sessionId): Promise<void>
```

`SessionConfig` requires `onPermissionRequest: PermissionHandler` (no
default — every session MUST have a policy). Common fields:
`sessionId?`, `model?`, `streaming?`, `tools?`, `availableTools?`,
`excludedTools?`, `workingDirectory?`, `systemMessage?`, `provider?` (BYOK), `mcpServers?`, `customAgents?`, `skillDirectories?`, `infiniteSessions?`.

**Auth + models**:

```ts
await client.getAuthStatus(): Promise<GetAuthStatusResponse>;
//  -> { isAuthenticated, authType?: 'user'|'env'|'gh-cli'|'hmac'|'api-key'|'token', login?, host?, statusMessage? }

await client.listModels(): Promise<ModelInfo[]>;
```

### `CopilotSession`

```ts
session.sessionId: string

await session.send(opts: MessageOptions): Promise<string /* messageId */>
await session.sendAndWait(opts, timeout?): Promise<AssistantMessageEvent | undefined>

session.on(eventType, handler): () => void  // returns unsubscribe (NOT a Disposable)

await session.disconnect(): Promise<void>
```

`MessageOptions`: `{ prompt: string, attachments?: [...], mode?: 'enqueue'|'immediate' }`.

**Streaming events** (the ones Agent Arena consumes):

- `assistant.message_delta` — `data.deltaContent` is the incremental chunk; `data.messageId` matches the eventual final message.
- `assistant.message` — the final assembled assistant message (`data.content`).
- `assistant.streaming_delta` — coarser progress (`data.totalResponseSizeBytes`); we don't render this.
- `assistant.turn_start` / `assistant.turn_end` — turn boundaries.
- `session.idle` — agent has finished all in-flight work.
- `session.error` — runtime failure (`data.errorType`, `data.message`).
- `permission.request` (delivered via `onPermissionRequest`, not `on`) — synchronous gate.
- `tool.execution_start` / `tool.execution_partial_result` — tool call telemetry.

### Tool definition

```ts
const myTool = defineTool({
  name: 'compute_score',
  description: 'Score the candidate.',
  parameters: zodSchema,
  handler: async (args, invocation) => 'string-or-ToolResultObject',
});
```

`ToolResultObject`: `{ textResultForLlm, binaryResultsForLlm?, resultType: 'success'|'failure'|'rejected'|'denied', error?, sessionLog?, toolTelemetry? }`.

### Permission handlers

```ts
import { approveAll, denyAll, type PermissionHandler } from '@github/copilot-sdk';

const myPolicy: PermissionHandler = async (request, invocation) => {
  // request.toolName, request.summary, request.permissions
  return { kind: 'approved' };  // or { kind: 'denied', reason }
};
```

The Agent Arena `PermissionPolicy` interface (FR-019) wraps this with a typed `PermissionDecision = { kind: 'allow' | 'deny' | 'ask' }` for forward extensibility.

## Authentication priority order

When `useLoggedInUser: true` (default), the CLI tries auth sources in this order:

1. `githubToken` constructor option (overrides everything).
2. `GH_TOKEN` / `GITHUB_TOKEN` environment variables.
3. `gh CLI auth` (the `gh` binary's stored token).
4. Stored OAuth from a previous `copilot login`.

If none succeeds, `getAuthStatus().isAuthenticated === false` and the next agent action will fail. Agent Arena surfaces this via `selectAdapter`'s `not_authenticated` fallback.

## Observability hooks

- **OpenTelemetry**: the bundled CLI emits OTel spans/events. `TelemetryConfig` is *not* yet exposed on `CopilotClientOptions` in v0.1.32 (deferred); env-var configuration is the current path.
- **`session.on(handler)`** (no event name): receives every event the session emits — useful for custom logging.
- **`SessionHooks`** in `SessionConfig.hooks`: structured callbacks for lifecycle events.

## Known constraints (v0.1.32)

- **Electron host gotcha**: `process.execPath` in VS Code's extension host points at `Code.exe`, not `node`. The SDK's default `getNodeExecPath()` uses `process.execPath` to spawn JS-based CLIs, which fails. **Workaround**: explicitly set `cliPath` to the OS-specific binary (`@github/copilot-<platform>-<arch>/copilot[.exe]`) so the SDK skips the Node fallback. Agent Arena does this in `CopilotSdkAdapter.resolveBundledCliBinary()`.
- **No abort-turn primitive**: there's no `session.abortCurrentTurn()` API in v0.1.32. Use `session.disconnect()` to hard-stop a runaway turn.
- **`session.on()` returns a plain function** — not a `Disposable`. Wrap in `{ dispose: () => unsubscribe() }` if you need VS Code-style disposable semantics.
- **`ResumeSessionConfig.onPermissionRequest` is required** — not optional, so every resumed session must supply a policy.
- **`TelemetryConfig` is not exposed** on `CopilotClientOptions` in v0.1.32. Telemetry-file routing must use env vars or the bundled CLI's CLI flags until the SDK adds it.
- **Pure ESM**: package.json sets `"type": "module"` and the exports map exposes only an `import` condition. CJS callers must use dynamic `import("@github/copilot-sdk")`.

## How Agent Arena uses this SDK

| Concern | File |
|---|---|
| Sole runtime importer | [`extension/src/sdk/CopilotSdkAdapter.ts`](../../extension/src/sdk/CopilotSdkAdapter.ts) |
| Demo-mode substitute | [`extension/src/sdk/FakeSdkAdapter.ts`](../../extension/src/sdk/FakeSdkAdapter.ts) |
| Real-vs-fake selector | [`extension/src/sdk/selectAdapter.ts`](../../extension/src/sdk/selectAdapter.ts) |
| Permission policy seam | [`extension/src/permission/PermissionPolicy.ts`](../../extension/src/permission/PermissionPolicy.ts) |
| ESLint boundary | [`extension/eslint.config.js`](../../extension/eslint.config.js) — `no-restricted-imports` confines the SDK to `CopilotSdkAdapter.ts`. |

## References

- npm: https://www.npmjs.com/package/@github/copilot-sdk
- GitHub: https://github.com/github/copilot-sdk
- Copilot CLI docs: https://docs.github.com/en/copilot/concepts/cli
- Raw snapshots: [`wiki/raw/copilot-sdk/`](../raw/copilot-sdk/)

— copilot(developer:opus-4.7)
