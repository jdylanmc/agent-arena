# Data Model — scaffold-application

**Author attribution**: copilot(developer:opus-4.7)
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

This file defines the TypeScript types that bind the FRs and CDs together. Every type here is the authoritative shape; the corresponding source file under `extension/src/**/*.ts` MUST import / re-export from these definitions, not redefine them.

---

## CanonicalEvent (CD-01 / EI-1)

```typescript
/** The canonical EI-1 envelope every event MUST conform to.
 *  Single canonical log at `${context.logUri}/agent-arena.events.jsonl`. */
export interface CanonicalEvent<P = unknown> {
  /** ISO-8601 UTC, e.g. "2026-05-06T20:35:12.345Z". */
  ts: string;

  /** Severity. Lowercase. */
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";

  /** Stable, namespaced + versioned event identifier. Examples:
   *    "copilot.session.created.v1"             (SDK-name-first per CD-01)
   *    "aa.yolo.toggled.v1"                     (extension-only event)
   *    "aa.webview.message.rejected.v1"         (CD-04 unknown-type rejection)
   *    "aa.harness.session.unrecoverable.v1"    (CD-02 hash-mismatch)
   *  Catalog of identifiers lives in eventNames.ts (Object.freeze) and is
   *  documented in wiki/docs/log-schema.md. */
  event: string;

  /** Canonical Principle II identity if attributable to an agent.
   *  For SDK-originated events this is "copilot(developer:<model>)" or null
   *  if the SDK action is not attributable; for extension-originated events
   *  this is the active agent identity. */
  agent_id: string | null;

  /** Trace ID propagating through this causal chain. For events triggered by
   *  a webview message, this is the envelope's correlation_id (CD-04).
   *  For SDK-originated events normalized from OTel, this is the trace-id
   *  portion of the SDK's W3C traceparent (R-04). */
  correlation_id: string;

  /** Event-typed payload. Free-form prose (if any) lives in `payload.message`. */
  payload: P & {
    /** Optional human-readable message. Never required. */
    message?: string;
    /** For SDK-originated events: original SDK payload preserved verbatim
     *  (per CD-01 normalization rule — sidecar fidelity). */
    sdk?: unknown;
  };
}
```

### Event identifier catalog (snapshot)

The full catalog lives in `extension/src/telemetry/eventNames.ts` (frozen object) and `wiki/docs/log-schema.md`. Initial entries:

| `event` identifier | Origin | Trigger |
|---|---|---|
| `aa.extension.activate.v1` | extension | `extension.ts` `activate()` first run |
| `aa.extension.deactivate.v1` | extension | `extension.ts` `deactivate()` |
| `aa.webview.opened.v1` | extension | webview view first becomes visible |
| `aa.webview.message.received.v1` | extension | inbound envelope after Zod validation |
| `aa.webview.message.rejected.v1` | extension | envelope failed validation; CD-04 |
| `aa.permission.prompted.v1` | extension | `PromptUserPolicy.decide` shown a prompt |
| `aa.permission.resolved.v1` | extension | policy returned `allow` or `deny` |
| `aa.yolo.toggled.v1` | extension | toggle changed; CD-05 |
| `aa.harness.session.unrecoverable.v1` | extension | `loadHarness` hash mismatch; CD-02 |
| `aa.sdk.cli.start_failed.v1` | extension | CopilotClient startup error (FR-010 + R-11c) |
| `copilot.<sdk-event>.v1` | SDK (normalized) | every SDK telemetry span; identifier suffixed `.v1` |

---

## Agent

```typescript
/** A logical assistant configured with a model and a yolo state.
 *  In the scaffold, exactly one agent exists: { id: "primary", kind: "primary" }. */
export interface Agent {
  id: string;                          // stable identifier; "primary" for the scaffold
  kind: "primary";                     // enumeration; only "primary" in this scaffold
  yoloMode: boolean;                   // CD-05 — persisted per-workspace, per-agent
}
```

The `kind` enumeration is intentionally constrained to `"primary"` for this scaffold. Future specs (background agents, custom agents) widen it.

---

## HarnessedSession (CD-02 / R-05)

```typescript
/** A reference to one SDK session directory, captured for round-trippable
 *  harness reproduction. The SDK is the system of record for session content;
 *  this struct is the manifest. */
export interface HarnessedSession {
  session_id: string;                  // SDK session id; format "aa-{agentId}-{ulid}"
  agent_id: string;                    // back-pointer to the owning Agent
  /** Path relative to copilotHome, e.g.
   *    "session-state/aa-primary-01HXY…/" */
  session_dir_path: string;
  /** sha256 over the canonical concatenation of every file listed in
   *  manifest.files, in manifest order. */
  content_hash: string;
  manifest: {
    files: Array<{
      /** Path relative to session_dir_path, e.g. "checkpoints/001.json". */
      name: string;
      size: number;                    // bytes
      sha256: string;                  // per-file hash
    }>;
  };
  /** Set by loadHarness when validation fails. Absent on save. */
  state?: "unrecoverable";
}
```

### Save semantics (`saveHarness`)

1. For each agent's active or recently-active sessions:
   - Walk `session_dir_path/{checkpoints,plan.md,files}/**` (in stable order).
   - For each file: compute `size` + `sha256`.
   - Order `manifest.files` by `name` (stable lexicographic sort).
   - Compute `content_hash` = `sha256(concat(file_bytes for file in manifest.files))`.
2. Emit `aa.harness.saved.v1` with payload `{ agent_count, session_count, total_bytes }`.

### Load semantics (`loadHarness`)

1. For each `HarnessedSession` in `harness.sessions`:
   - Resolve `session_dir_path` against `copilotHome`.
   - For each `manifest.files[i]`: validate file exists, `size` matches, `sha256` matches.
   - If any validation fails: set `state = "unrecoverable"`, emit `aa.harness.session.unrecoverable.v1` with payload `{ session_id, mismatched_files: [...] }`.
2. Replace runtime `Agent[]` from `harness.agents` (replace semantics per EI-2; no merge).
3. Set `activeSessionId = harness.activeSessionId`.
4. Emit `aa.harness.loaded.v1` with payload `{ agent_count, session_count, unrecoverable_count }`.

### Unload semantics (`unload` — EI-2 same-process round-trip)

`unload()` is `loadHarness(EMPTY_HARNESS)` where:

```typescript
const EMPTY_HARNESS: AgentArenaHarness = {
  harness_version: "1.0.0",
  agents: [],
  activeSessionId: null,
  sessions: [],
};
```

There is no separate `unload` code path; load is the only mutating verb. Internal sequence at every `loadHarness(...)` call:

1. **Abort** the current turn on every active `SdkSessionHandle` (best-effort; idempotent if no turn running).
2. **`disconnect()`** every handle — releases in-memory resources, preserves on-disk session directories (per CD-02 / R-05; SDK is system of record).
3. **Clear** the agent registry, the policy resolver's per-agent bindings, and `activeSessionId`.
4. **Replace** in-memory state from the new harness's `agents[]` and `activeSessionId`.
5. **Validate** every `sessions[]` entry per the load semantics above.
6. **Reconcile** `workspaceState` yolo entries: for each agent in the new harness, write the loaded `yoloMode` to `workspaceState` (so a subsequent reload-after-restart preserves the loaded value); do NOT delete entries for agents not present (those persist as orphaned but harmless workspace state).

**Sessions on disk are never touched by `loadHarness` or `unload`.** Cleanup of orphaned SDK session directories is out of scope for the scaffold; the SDK's `client.deleteSession(id)` is the explicit cleanup verb, surfaced through a future `harness.cleanupOrphanedSessions` command (not in this scaffold).

### Same-process round-trip test (gate)

`extension/test/unit/harness.unload.test.ts` MUST pass before /speckit.implement is considered complete:

```typescript
// Pseudocode
const harnessA = await loadHarness(fixtureA);   // has session X
const stateA = await snapshotInMemory();
await loadHarness(EMPTY_HARNESS);               // unload
expect(await snapshotInMemory()).toEqual(EMPTY_STATE);
const harnessB = await loadHarness(fixtureB);   // also has session X (same id, same hash)
expect((await snapshotInMemory()).agents.length).toBe(harnessB.agents.length);
// Session X validates: still on disk, hash matches → state field absent (recoverable)
expect(harnessB.sessions[0].state).toBeUndefined();
```

---

## AgentArenaHarness (CD-02 / FR-024)

```typescript
/** The complete behavior-relevant state of the extension at a point in time.
 *  loadHarness(saveHarness(state)) MUST equal state (modulo non-semantic
 *  ordering) per EI-2. */
export interface AgentArenaHarness {
  /** Semver. v1.0.0 for this scaffold. Bumped on any field-level change. */
  harness_version: string;

  /** All agents the extension knows about. Scaffold ships exactly one. */
  agents: Agent[];

  /** The session currently bound to the active agent's UI, if any. */
  activeSessionId: string | null;

  /** Manifests for every session referenced by the harness. May include
   *  sessions that are not currently active. */
  sessions: HarnessedSession[];
}
```

**Determinism for diffability** (EI-2 "Diffable" clause):

- Field order MUST be the order declared in the `interface` (TypeScript JSON serialization preserves insertion order in modern engines; we assert with a normalizing serializer).
- `agents` sorted by `id` ascending.
- `sessions` sorted by `session_id` ascending.
- Within `manifest.files`, sorted by `name` ascending.
- JSON stringified with 2-space indentation and trailing newline.

---

## MessageEnvelope (CD-04 / R-09)

```typescript
import { z } from "zod";

/** Webview ↔ extension-host envelope. EVERY message in either direction MUST
 *  conform to this shape and pass the runtime validator on both sides. */
export const MessageEnvelopeSchema = z.object({
  protocol_version: z.literal(1),
  message_id: z.string().uuid(),                 // v4
  correlation_id: z.string().uuid(),             // v4 — propagates into every EI-1 event
  session_id: z.string().optional(),
  agent_id: z.string().optional(),
  type: z.string().min(1),                       // see protocol/types.ts for the enum
  payload: z.record(z.unknown()),
});

export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;
```

Per-`type` payload schemas (also Zod) live in `extension/src/protocol/types.ts` and are mirrored by `wiki/docs/webview-protocol.md`. Initial enum:

| `type` | Direction | Payload schema (see protocol/types.ts) |
|---|---|---|
| `webview.ready` | webview → host | `{}` |
| `prompt.submit` | webview → host | `{ promptText: string, agentId: string }` |
| `yolo.set` | webview → host | `{ enabled: boolean, agentId: string }` |
| `permission.respond` | webview → host | `{ requestId: string, decision: "allow" \| "deny" }` |
| `assistant.delta` | host → webview | `{ chunk: string, sessionId: string, turnId: string }` |
| `assistant.message.final` | host → webview | `{ text: string, sessionId: string, turnId: string }` |
| `permission.prompt` | host → webview | `{ requestId: string, toolName: string, summary: string }` |
| `session.state` | host → webview | `{ status: "idle" \| "running" \| "queued" \| "error", sessionId: string }` |
| `error` | host → webview | `{ code: string, message: string, recoverable: boolean }` |

Unknown `type` MUST be rejected; the receiver emits `aa.webview.message.rejected.v1` with payload `{ raw_envelope, reason: "unknown_type" }`.

---

## PermissionPolicy (FR-019 / R-06)

```typescript
import type { PermissionRequest, ToolInvocation } from "@github/copilot-sdk";

export type PermissionDecision =
  | { kind: "allow"; reason?: string }
  | { kind: "deny"; reason: string }
  | { kind: "ask"; promptHint?: string };       // reserved for future per-tool policies

export interface PermissionDecisionContext {
  agentId: string;
  sessionId: string;
  request: PermissionRequest;
  invocation: ToolInvocation;
  correlationId: string;                         // CD-04 envelope id propagated
}

export interface PermissionPolicy {
  /** MUST be deterministic given the same context. MUST NOT throw. */
  decide(ctx: PermissionDecisionContext): Promise<PermissionDecision>;
}
```

Two implementations ship in the scaffold:

- **`YoloPolicy`** — always returns `{ kind: "allow" }`. Used when the agent's `yoloMode === true`.
- **`PromptUserPolicy`** — surfaces a `permission.prompt` envelope to the webview, awaits the matching `permission.respond`, and returns `allow` or `deny` based on the user's choice. Used when `yoloMode === false`.

The session-side `onPermissionRequest` shim (`extension/src/permission/handler.ts`) selects a policy at decision time based on the agent's current `yoloMode`. **No call site changes when a future spec adds a `PerToolPolicy`** — that's the point.

---

## SdkAdapter — ISP-segregated (CD-03 fallback / R-02)

The SDK seam is split into single-responsibility interfaces per Interface Segregation Principle. Consumers depend only on the segregated interface they need; the aggregates exist for code that legitimately needs both halves.

```typescript
import type {
  SessionConfig,
  ResumeSessionConfig,
  MessageOptions,
  SessionEvent,
  SessionLifecycleEvent,
  PermissionHandler,
} from "@github/copilot-sdk";

/** Owns the lifecycle of the underlying CopilotClient. */
export interface SdkClientLifecycle {
  start(opts: { copilotHome: string; telemetryFilePath: string }): Promise<void>;
  stop(): Promise<void>;
}

/** Owns session creation, lookup, and deletion. */
export interface SdkSessionRegistry {
  createSession(opts: SessionConfig & {
    onPermissionRequest: PermissionHandler;
  }): Promise<SdkSessionHandle>;

  resumeSession(sessionId: string, opts?: ResumeSessionConfig & {
    onPermissionRequest?: PermissionHandler;
  }): Promise<SdkSessionHandle>;

  listSessions(): Promise<Array<{ sessionId: string; createdAt: string }>>;
  deleteSession(sessionId: string): Promise<void>;
}

/** Aggregate; activation code may import this. Consumers that only need one
 *  half MUST import the segregated interface (ESLint enforced). */
export interface SdkAdapter extends SdkClientLifecycle, SdkSessionRegistry {}

/** Identity + connection state of one SDK session. */
export interface SdkSessionLifecycle {
  readonly sessionId: string;
  disconnect(): Promise<void>;
}

/** Messaging plane for one SDK session. */
export interface SdkSessionMessaging {
  send(opts: MessageOptions & { mode?: "enqueue" }): Promise<void>;

  on<E extends SessionEvent | SessionLifecycleEvent>(
    eventType: E["type"],
    handler: (event: E) => void | Promise<void>
  ): { dispose(): void };

  abortCurrentTurn(): Promise<void>;
}

/** Aggregate per-session handle. Consumers that only need one MUST import
 *  the segregated interface (ISP). */
export interface SdkSessionHandle extends SdkSessionLifecycle, SdkSessionMessaging {}
```

### Consumer-to-interface mapping (DIP)

| Consumer | Imports |
|---|---|
| `extension/src/extension.ts` (activate/deactivate) | `SdkClientLifecycle` |
| `extension/src/sdk/lifecycle.ts` (supervisor state machine) | `SdkClientLifecycle` |
| `extension/src/harness/save.ts` | `SdkSessionRegistry` |
| `extension/src/harness/load.ts` | `SdkSessionRegistry` |
| `extension/src/activate/registerCommands.ts` (`harness.import` etc) | `SdkSessionRegistry` |
| `extension/src/webview/ViewProvider.ts` (binds a session to a view) | `SdkAdapter` (legitimately needs both) |
| `extension/src/webview/messageRouter.ts` (per-turn dispatch) | `SdkSessionMessaging` |
| `extension/src/permission/handler.ts` (resolves policy per session) | `SdkSessionLifecycle` (only needs `sessionId`) |

The `FakeSdkAdapter` MUST emit, on demand:

- `assistant.message_delta` events (one or more per turn).
- A final assistant message event.
- A permission request (allow + deny variants).
- A queued-prompt acknowledgement when `mode: "enqueue"` is set during a running turn.
- A `session.idle` lifecycle event after each turn.
- A startup failure error (for the negative path test).
- A runtime error event mid-turn (for the negative path test).
- The `listSessions` / `deleteSession` contract.

---

## WikiRawPointer (FR-029 / Knowledge Base / closes deputy round-1 wiki/raw item)

Every file under `wiki/raw/<source>/` is a **pointer manifest** — a markdown file with YAML frontmatter capturing source provenance. Pointers are **immutable** post-`fetched_at`: the body of a pointer file MUST NOT be edited after it is committed. To re-ingest a source, write a new pointer with a new `fetched_at`.

When cached body content is genuinely needed (e.g. for offline reasoning), it lives **alongside** the pointer at `wiki/raw/<source>/snapshots/<slug>.body.md` and is referenced from the pointer's `body_path` field. Snapshot bodies are also immutable.

```typescript
/** YAML frontmatter shape for every wiki/raw/<source>/<slug>.pointer.md file. */
export interface WikiRawPointer {
  /** Original URL that was fetched. */
  source_url: string;

  /** ISO-8601 UTC timestamp at which `source_url` was fetched. Immutable. */
  fetched_at: string;

  /** Git commit SHA (when the source is a git repo). Optional. */
  commit_sha?: string;

  /** SPDX license identifier of the source content (e.g. "MIT", "Apache-2.0",
   *  "CC-BY-4.0"). Use "unknown" only when the source explicitly lacks a
   *  license; in that case `snapshot_kind` MUST be "pointer-only". */
  license: string;

  /** sha256 of the captured body, if any. Required when snapshot_kind ===
   *  "cached-body"; absent when snapshot_kind === "pointer-only". */
  content_hash?: string;

  /** Whether this pointer carries cached content alongside it. */
  snapshot_kind: "pointer-only" | "cached-body";

  /** Path to the cached body file relative to this pointer file. Required
   *  when snapshot_kind === "cached-body"; absent otherwise. */
  body_path?: string;

  /** Free-form ingest status note. Optional. */
  ingest_status?: string;
}
```

### Immutability rule

- A pointer file (and its `body_path` cached body, when present) is **write-once after first commit**. Edits MUST go through a new pointer file.
- The deputy and SOLID SNAKE both verify this on every run — any commit that modifies an existing `wiki/raw/<source>/<slug>.pointer.md` (other than to add it for the first time) is flagged.
- A pointer file MAY be DELETED in a follow-up commit if the source is retracted; the deletion event itself is the audit trail.

### Cached-body licensing rule

- `snapshot_kind: "cached-body"` is permitted only when `license` is one of: `MIT`, `Apache-2.0`, `BSD-3-Clause`, `BSD-2-Clause`, `CC-BY-4.0`, `CC-BY-SA-4.0`, `CC0-1.0`, `Unlicense`, `0BSD`, or any other SPDX identifier explicitly added to the project's allow-list at `.specify/wiki-raw-licenses.json` (created during `/speckit.implement` task T015).
- For `license: "unknown"` or any non-allow-listed identifier, `snapshot_kind` MUST be `"pointer-only"` — record the URL and let the agent fetch on demand.

### Relationship to constitution.md:571

Constitution line 571 names `wiki/raw/*.md` as "immutable source pointer files... provenance (URL, captured-at date, access method) and ingest status." This shape is a **superset compatible** with that definition: `WikiRawPointer` includes `source_url`, `fetched_at`, and `ingest_status` as required, with the additional fields `license`, `commit_sha`, `content_hash`, `snapshot_kind`, and `body_path` extending the manifest. The deputy's round-1 review accepted this reading as "superset, not redefinition"; this section formalizes the manifest schema in response to the deputy's request that `/speckit.plan` codify it.

---

## Determinism notes

- All UUIDs MUST be v4 generated by Node's `crypto.randomUUID()` (no external dep).
- All timestamps MUST be ISO-8601 UTC with millisecond precision.
- All hashes MUST be hex-encoded sha256 (Node's `crypto.createHash("sha256")`).
- No `Date.now()` strings in event payloads — use `ts` field at the envelope level only.

— copilot(developer:opus-4.7)
