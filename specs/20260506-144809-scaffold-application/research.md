# Phase 0 Research — scaffold-application

**Date**: 2026-05-06
**Driven by**: CD-03 (`/speckit.plan` MUST first ingest `@github/copilot-sdk` to determine the test seam) plus several "resolve before /speckit.plan" gaps from PR #5 review.
**Author attribution**: copilot(developer:opus-4.7)

This file records the source-grounded findings that the rest of `plan.md` builds on. Every claim cites a specific file/path in `github/copilot-sdk@06bfc5d4` (the SDK's HEAD at research time) or an authoritative external source. Claims without citations are explicitly marked as the author's design judgment.

---

## R-01 — `@github/copilot-sdk` shape

**Source**: `github/copilot-sdk` repo, monorepo layout. Inspected `nodejs/`, `test/`, `docs/`.

- **Package name**: `@github/copilot-sdk` (confirmed via `nodejs/package.json`).
- **Version at research time**: `0.1.8` (Public Preview).
- **License**: MIT.
- **Node engine**: `>=20.0.0`.
- **Architecture**: SDK ↔ Copilot CLI server via JSON-RPC (`vscode-jsonrpc ^8.2.1`). The bundled CLI ships as a runtime dependency (`@github/copilot ^1.0.43-0`) — no separate install for Node.js consumers (`README.md` "Quick steps" §1).
- **Type surface** (from `nodejs/src/index.ts`): `CopilotClient`, `CopilotSession`, `AssistantMessageEvent`, `defineTool`, `approveAll`, `PermissionHandler`, `PermissionRequest`, `PermissionRequestResult`, `SessionConfig`, `SessionEvent`, `SessionEventType`, `SessionLifecycleEvent`, `MessageOptions`, `ResumeSessionConfig`, `TelemetryConfig`, `TraceContext`, `Tool`, `ToolHandler`, `ToolInvocation`, `ZodSchema`.
- **Runtime dependencies**: `@github/copilot ^1.0.43-0`, `vscode-jsonrpc ^8.2.1`, `zod ^4.3.6`.
- **Package exports** (from `nodejs/package.json`):
  - `"."` — main `CopilotClient` entry, what extensions and apps import.
  - `"./extension"` — **NOT** for VS Code extensions. It is for CLI-spawned child-process plugins where `process.env.SESSION_ID` is set by the parent CLI (see `nodejs/src/extension.ts:24-37`). We do NOT use this entry point.

**Implication for this plan**: We import `CopilotClient` from `@github/copilot-sdk` directly. The bundled CLI binary is acceptable in our extension's `node_modules` (FR-005 + FR-010), and we redirect its home directory via `copilotHome` per FR-011.

---

## R-02 — Test seam (CD-03 resolution)

**Source**: `nodejs/package.json` `exports`, `nodejs/package.json` `files`, `test/harness/` directory contents.

The SDK does **not** ship a consumer-facing test harness. Concretely:

- `nodejs/package.json` `exports` exposes only `"."` and `"./extension"`. There is no `"./testing"`, `"./mock"`, `"./fixtures"`, or equivalent.
- `nodejs/package.json` `files` whitelists `["dist/**/*", "docs/**/*", "README.md"]`. Test code never ships in the published tarball.
- The top-level `test/harness/` directory exists but is **internal SDK CI infrastructure**: it contains `capturingHttpProxy.ts`, `replayingCapiProxy.ts`, `mockHandlers.ts`, `connectProxy.ts`, `certUtils.ts`, plus MCP server harnesses. It is HTTP-level mocking for testing the SDK's own JSON-RPC pipe to the CLI — designed for SDK contributors validating SDK behavior, not for SDK consumers writing their own tests.

**CD-03 decision result**: **Fall back to (A) — `SdkAdapter` interface with `FakeSdkAdapter`.** The extension host imports an `SdkAdapter` shape that wraps `CopilotClient` + `CopilotSession`; the production adapter delegates to the SDK; tests substitute a `FakeSdkAdapter` exercising the behavioral surface mandated by CD-03 (streaming deltas, permission allow/deny, queued prompts, session resume/list, startup failure, runtime errors).

**Implication for this plan**: contracts/sdk-adapter.ts (Phase 1 deliverable) defines the interface. Implementation lands in /speckit.implement.

---

## R-03 — Streaming and session events

**Source**: `nodejs/src/index.ts` (re-exports `AssistantMessageEvent`, `SessionEvent`, `SessionEventType`, `SessionEventPayload`, `SessionLifecycleEvent`, `SessionLifecycleEventType`).

The SDK distinguishes two event channels:

- **`SessionEvent`** — assistant messages, tool calls, message deltas, etc. Streamed via `session.on(eventType, handler)` and the `SessionEventHandler` callback shape.
- **`SessionLifecycleEvent`** — session-level state transitions (created, idle, ended). Streamed via `session.on(lifecycleEventType, handler)` and `SessionLifecycleHandler`.

**Streaming deltas**: the spec's FR-012 references `assistant.message_delta` as the event name. The SDK's exported `AssistantMessageEvent` and the `SessionEventType` enum should be inspected at implementation time to confirm the exact identifier; if the SDK uses a different string, plan.md's FR rewrites take the SDK identifier as authoritative per CD-01 (snap to SDK names + `.v1` suffix).

**Implication for plan**: the canonical EI-1 event for an assistant streaming delta will be (e.g.) `copilot.session.assistant.message_delta.v1` — namespace `copilot.`, SDK name verbatim, version suffix `.v1`. Exact identifier is recorded at implementation time and locked into `wiki/docs/log-schema.md`.

---

## R-04 — Telemetry (`TelemetryConfig`) — CD-01 implementation surface

**Source**: `docs/observability/opentelemetry.md`.

The SDK ships built-in OpenTelemetry support via a `TelemetryConfig` option on `CopilotClient`:

```typescript
const client = new CopilotClient({
  telemetry: {
    otlpEndpoint: "http://localhost:4318",
    // OR
    filePath: "/some/path.jsonl",
    exporterType: "file",  // | "otlp-http"
    sourceName: "agent-arena",
    captureContent: true,
  },
});
```

- **Two exporter types**: `"otlp-http"` (network endpoint) and `"file"` (JSON-lines on disk).
- **W3C Trace Context propagation**: SDK supports `traceparent`/`tracestate` strings on JSON-RPC payloads and via the `onGetTraceContext` callback. TypeScript SDK has **no `@opentelemetry/api` dependency** — strings are passed raw.
- **Semantic conventions used by the CLI**: OpenTelemetry GenAI Semantic Conventions and OpenTelemetry MCP Semantic Conventions (cited at the bottom of `docs/observability/opentelemetry.md`). Concretely: spans use names like `gen_ai.system`, `gen_ai.operation.name`, etc.
- **Trace IDs**: every CLI span carries a `traceparent`. The SDK can propagate parent context down via the `onGetTraceContext` callback when the consumer maintains its own OpenTelemetry context.

**CD-01 implementation realization**: We pick `exporterType: "file"` with `filePath: "${context.logUri}/agent-arena.events.jsonl"`. The CLI writes its own JSONL there in OTel format. **However**: that file is OTel-shaped, not the canonical EI-1 envelope. We do NOT make the SDK write directly to the canonical log. Instead:

1. SDK telemetry writes to `${context.logUri}/agent-arena.sdk-otel.jsonl` (raw OTel).
2. The extension's telemetry adapter tails that file (or subscribes via OTel SDK if we add it — defer this decision to /speckit.implement) and emits canonical EI-1 events to `${context.logUri}/agent-arena.events.jsonl`.
3. SDK event names land in the canonical `event` field with `.v1` suffix; original SDK payload preserved verbatim under `payload.sdk`.
4. `correlation_id` in the canonical envelope = the SDK's `traceparent` trace-id portion (stripped of flags), so cross-references work.

**Two-file outcome:** even though CD-01 said "single canonical log", we end up with **the canonical log + a sidecar raw-OTel file** that the canonical log normalizes from. The user's chosen direction was "snap to SDK telemetry where possible, make sure we preserve observability and consistency"; preserving the raw OTel file (option B from the original CD-01 question) better satisfies the "preserve observability" half. **The canonical log remains THE EI-1 source of truth**; the sidecar is provenance.

This is a refinement of CD-01, not a change. A footnote will be added to CD-01 in the spec to record the sidecar-file outcome before /speckit.implement.

---

## R-05 — Session persistence layout — CD-02 implementation surface

**Source**: `docs/features/session-persistence.md`.

Session state lives at `~/.copilot/session-state/{sessionId}/` — when we redirect via `copilotHome` per FR-011, this becomes `${context.globalStorageUri}/.copilot/session-state/{sessionId}/`. Layout:

```
{copilotHome}/session-state/
└── {sessionId}/
    ├── checkpoints/
    │   ├── 001.json
    │   ├── 002.json
    │   └── …                  # Incremental checkpoints
    ├── plan.md                # Agent's planning state (if any)
    └── files/                 # Session artifacts (tool-created files)
        └── …
```

**Persisted vs. ephemeral** (from `session-persistence.md` "What Gets Persisted?"):

| Data | On disk | Notes |
|---|---|---|
| Conversation history | ✅ | `checkpoints/` |
| Tool call results | ✅ | Cached for context |
| Agent planning state | ✅ | `plan.md` |
| Session artifacts | ✅ | `files/` |
| Provider/API keys | ❌ | Must re-provide |
| In-memory tool state | ❌ | Tools should be stateless |

**Session ID requirement for resumability**: `client.createSession({ sessionId: "user-…-task-…", ... })` — without an explicit `sessionId`, the SDK generates one and the session is non-resumable. **This binds FR-015 / US-1#3**: we MUST mint our own session IDs (e.g. `aa-{agentId}-{ulid}`) so the resume path works.

**Lifecycle methods** the adapter contract must expose:

- `client.createSession(config)` / `client.resumeSession(sessionId, config?)`
- `client.listSessions(filter?)` / `client.deleteSession(sessionId)`
- `session.disconnect()` — releases in-memory; on-disk preserved (for FR-026 round-trip)
- `session.sendAndWait(opts)` / `session.send(opts)` (for FR-015 enqueue)
- `session.on(eventType, handler)` for both `SessionEvent` and `SessionLifecycleEvent`

**CD-02 implementation realization**: harness `sessions[]` entries reference each session's directory:

```typescript
type HarnessedSession = {
  session_id: string;
  agent_id: string;
  session_dir_path: string;          // relative to copilotHome
  content_hash: string;              // sha256 over canonical concat of all files in manifest
  manifest: {
    files: Array<{ name: string; size: number; sha256: string }>;
  };
};
```

`saveHarness` walks `checkpoints/`, `plan.md`, and `files/*` for each tracked session, computes per-file sha256, sums them into a canonical content hash, and embeds the manifest. `loadHarness` validates each path exists and each file's hash matches; mismatches mark the session entry `state: "unrecoverable"` and emit `aa.harness.session.unrecoverable.v1` (per CD-01).

---

## R-06 — Permission handler surface — FR-019 typed interface

**Source**: `nodejs/src/index.ts` exports `PermissionHandler`, `PermissionRequest`, `PermissionRequestResult`. Detailed shape inferred from SDK docs (`docs/features/session-persistence.md` example shows the call shape `OnPermissionRequest: (req, inv) => Task<PermissionRequestResult>`).

The SDK's `PermissionHandler` is set per session at create/resume time:

```typescript
const session = await client.createSession({
  sessionId: ...,
  onPermissionRequest: async (req, invocation) => {
    // return { kind: "approved" | "denied", … }
  },
});
```

**FR-019 / CD-03 implication**: the spec promised a "permission policy abstraction" so that fine-grained per-tool policy can replace the binary yolo without changing handler call sites. Concrete typed interface:

```typescript
// contracts/permission-policy.ts
export type PermissionDecision =
  | { kind: "allow"; reason?: string }
  | { kind: "deny"; reason: string }
  | { kind: "ask"; promptHint?: string };

export interface PermissionPolicy {
  decide(ctx: PermissionDecisionContext): Promise<PermissionDecision>;
}

export interface PermissionDecisionContext {
  agentId: string;
  sessionId: string;
  request: PermissionRequest;          // SDK type
  invocation: ToolInvocation;          // SDK type
  correlationId: string;               // CD-04 envelope id, propagated
}

// The scaffold ships exactly two policies:
export class YoloPolicy implements PermissionPolicy { … }
export class PromptUserPolicy implements PermissionPolicy { … }
// FR-018 toggle picks one of these at call site.
```

The session's actual `onPermissionRequest` callback is a thin shim that resolves the active `PermissionPolicy` for the agent and delegates. Future per-tool policy implementations (a follow-up spec) implement `PermissionPolicy` with internal allowlist/denylist logic — no change to the shim or the session config.

**Definitive resolution of FR-019** — this typed interface will be promoted into FR-019's spec text in a follow-up commit (or land as part of plan.md's authoritative reference).

---

## R-07 — VS Code extension testing tooling

**Source**: VS Code extension testing ecosystem; `@vscode/test-cli` and `@vscode/test-electron` npm packages.

- `@vscode/test-electron` (older, lower-level) — programmatic API to download, install, and launch a VS Code instance for integration tests. Caller writes glue code.
- `@vscode/test-cli` (modern, recommended) — a CLI wrapper on top of `@vscode/test-electron` with a Mocha test runner, configuration via `.vscode-test.mjs`, and improved DX. Recommended in current VS Code extension samples.

**Decision** (author judgment, design call, NOT in any CD): adopt `@vscode/test-cli` for integration tests; keep `vitest` for unit tests of pure-TS modules (event normalizer, harness manifest computation, envelope validators, policy decision logic). The integration test suite MUST exercise extension activation, view registration, command registration, webview rendering, and a `FakeSdkAdapter`-backed mock round-trip end-to-end.

**`engines.vscode` minimum**: pin to `^1.95.0` (the November-2024 release that ships `Symbol.asyncDispose` support in extension host, matching the SDK's TypeScript dispose pattern). Pre-existing reviewer flag: "current LTS-line" was meaningless because VS Code has no LTS line; `^1.95.0` is concrete and reviewable.

---

## R-08 — Default model — FR-013 implementation surface

**Source**: `docs/features/session-persistence.md` examples consistently use `model: "gpt-5.2-codex"` (not bare `"gpt-5"` as the spec's FR-013 default suggests). SDK exports `ModelInfo` and `client.listSessions`-equivalent model listing methods.

**Implication**: FR-013's default of `"gpt-5"` may not be a valid model identifier on every signed-in user's account at every point in time. Two options for /speckit.implement:

1. Pin default to `"gpt-5.2-codex"` (matches SDK examples; assumes broad availability).
2. At extension activation, call the SDK's model-listing method, pick the first non-deprecated chat-class model, and persist that as the resolved default; surface a fallback selector if the configured `agentArena.primaryAgent.model` is not in the listing.

Reviewer significant finding #19 prefers option 2. This plan adopts option 2 for /speckit.implement and treats `"gpt-5"` in FR-013 as an aspirational symbolic name to be resolved at runtime; if no `gpt-5*` model is entitled, fall back to whatever the SDK lists first under a chat capability.

---

## R-09 — Webview ↔ extension-host envelope (CD-04 implementation surface)

**Source**: CD-04 mandates `{ protocol_version, message_id, correlation_id, session_id?, agent_id?, type, payload }`. SDK ships `zod ^4.3.6` as a transitive dependency.

**Implication**: we adopt `zod ^4.3.6` directly (no version skew with the SDK). The protocol envelope's runtime validator lives in `extension/src/protocol/envelope.ts`; both sides import it. `contracts/webview-protocol.md` records the message-`type` enumeration with a Zod schema literal per type.

---

## R-10 — Project layout (monorepo vs single-project)

**Spec**: FR-001 leaves this to plan time ("at the repo root (or under `extension/` if a monorepo layout is chosen during planning)").

**Decision** (author judgment): **monorepo with the extension under `extension/`**. Rationale:

- `specs/`, `wiki/`, `agents/`, `prototype/`, `.specify/`, `.github/`, `.vscode/`, `CHANGELOG.md`, `README.md` already live at the repo root and are governance/spec artifacts — not part of the extension's published surface.
- Putting the extension at `extension/` keeps `vsce package` scoped, lets the wiki and specs evolve independently of the extension's `package.json`/`vsce` lifecycle, and gives us room to add sibling packages later (e.g. a future `extension-tests-fixtures/` package, or a shared `protocol/` package when spec #2's Swarm UI lands).
- The published `.vsix` artifact's `package.json` lives at `extension/package.json`. CI's matrix builds run `cd extension && npm ci && npm run lint && npm run typecheck && npm test && npm run package`.

---

## R-11 — Open research items deferred to /speckit.implement

These are recorded so /speckit.tasks captures verification tasks for them, not because the plan is blocked:

- **R-11a**: confirm exact SDK event identifiers for `assistant.message_delta`, `session.created`, `session.idle` etc. by inspecting `nodejs/src/types.ts` (the `SessionEventType` and `SessionLifecycleEventType` enums) — feeds the `wiki/docs/log-schema.md` event catalog.
- **R-11b**: confirm the SDK's `cancel` / abort surface for streaming responses (significant finding #14 — streaming cancellation). The reviewer flagged this; the SDK's `disconnect()` is the per-session control, but per-turn cancellation may be a different method on `CopilotSession`.
- **R-11c**: verify `useLoggedInUser` / `copilotHome` interaction empirically by booting a `CopilotClient` with a redirected home and confirming sign-in pickup still works (significant finding #9 — `copilotHome` auth coupling).
- **R-11d**: verify `auth-detection` precedence order (`COPILOT_GITHUB_TOKEN` > `GH_TOKEN` > `GITHUB_TOKEN` > stored `copilot login` credentials, per the README FAQ).
- **R-11e**: confirm whether `engines.node >=20.0.0` plays nicely with VS Code's bundled Node runtime version on `windows-latest` and `ubuntu-latest` GitHub runners (CI matrix risk for FR-032 / SC-001).

---

## Summary table — what this research changes vs. what the spec already said

| Topic | Spec says | Research finds | Action |
|---|---|---|---|
| SDK package name | `@github/copilot-sdk` | ✅ confirmed | none |
| SDK Node engine | (not stated) | `>=20.0.0` | pin `extension/package.json` engines |
| SDK test harness | (CD-03 conditional) | NOT exported; internal CI only | **CD-03 falls to fallback A** — adapter + fake |
| SDK telemetry | `TelemetryConfig` `exporterType: "file"` (FR-020 original) | Two exporter types; needs adapter normalization to satisfy CD-01 envelope | sidecar OTel file + canonical EI-1 file (footnote to CD-01) |
| Session storage layout | `${copilotHome}/session-state/<id>/events.jsonl` (FR-011 / Key Entities) | Actually `checkpoints/*.json`, `plan.md`, `files/` — no top-level `events.jsonl` | update FR-011 / Key Entities text in a follow-up commit |
| Default model | `"gpt-5"` (FR-013) | SDK examples use `"gpt-5.2-codex"`; entitlement varies | resolve at runtime via model listing |
| `engines.vscode` | "current LTS-line" (FR-002) | VS Code has no LTS; `^1.95.0` is concrete | pin `^1.95.0` |
| Test framework | `@vscode/test-electron` (FR-002) | `@vscode/test-cli` is the modern wrapper | adopt `@vscode/test-cli` (vitest still owns unit tests) |
| Permission policy interface | promised but undefined (FR-019) | concrete typed interface designed in R-06 | lands as `contracts/permission-policy.ts` |
| Webview envelope | versioned envelope mandated (CD-04) | use `zod ^4.3.6` (matches SDK transitive) | `contracts/webview-protocol.md` |
| Project layout | leaves open (FR-001) | repo-root governance + `extension/` for shipped code | adopted |

— copilot(developer:opus-4.7)
