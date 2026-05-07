# Changelog

All notable changes to **agent-arena** are documented in this file.

The format is based on [Keep a Changelog 1.1.0][kac], and this project
adheres to [Semantic Versioning 2.0.0][semver].

The constitution at [`.specify/memory/constitution.md`][constitution]
mandates this discipline (see *Changelog discipline* under
*Development Workflow*). Every PR that introduces a user-visible change
MUST add an entry under `[Unreleased]` in the appropriate group, **and
every entry MUST end with an attributed-identity trailer** in the
canonical Principle II inline form — an em-dash followed by
`<provider>(<role>:<model>)`, e.g. `— copilot(developer:opus-4.7-xhigh)`.
Human-authored entries use `— @<github-handle>`. Multi-author entries
list each identity, comma-separated. Bullets without a trailer are a
Principle II violation and the deputy will flag them.

## [Unreleased]

### Changed

- **CD-13 — CD-07 reversal: agent surface is a `vscode.Pseudoterminal`-backed
  `vscode.Terminal`, one tab per agent in the native panel area.** The
  `WebviewPanel` + xterm.js + React shell from CD-07 is gone; each agent
  now opens a real VS Code terminal whose tab name is the canonical
  Principle II identity (`copilot(developer)`, `copilot(deputy)`,
  `copilot(solid-snake)`, …) — matching the user's actual operating
  model (multiple `copilot` CLI instances as terminal tabs). The CD-11
  keel is preserved: Agent / AgentRegistry / manager pattern (now
  `AgentTerminalManager`), Activity-Bar TreeView for navigation,
  persistent agent across surface close (CD-11 §6), idempotent
  `open()`, PermissionPolicy + per-kind modal, EI-1 audit log, SDK
  adapter seam, yolo store + status-bar item. The render surface is
  what changes: `AgentPanel` → `AgentTerminal`, `AgentPanelManager` →
  `AgentTerminalManager`, the webview-side `TerminalController` →
  `PseudoterminalIO` (a pure-logic module under
  `extension/src/panel/io/` with no `vscode` import). OSC 633 shell-
  integration sequences are emitted at the right moments (`A`/`B`
  bracket the prompt; `E` + `C` fire on Enter with a verifying nonce;
  `D ; 0` / `D ; 1` mark turn-end on `session.idle` / `session.error`;
  `P ; HasRichCommandDetection=True` and `P ; Cwd=<path>` set once
  on open) so command decorations, navigation, sticky scroll, and
  quick fixes light up for free. — copilot(developer:opus-4.7)

### Added

- **`AgentTerminal` (`extension/src/panel/AgentTerminal.ts`)** — owns one
  `vscode.window.createTerminal({ pty, name, iconPath, location: TerminalLocation.Panel })`
  per agent. Subscribes to Agent events on reveal (delta / final /
  error / status), unsubscribes on close. `handleClose` emits
  `aa.webview.closed.v1` (event-name retained for log continuity)
  and disposes the Pseudoterminal emitters; the underlying Agent
  stays alive (CD-11 §6). — copilot(developer:opus-4.7)

- **`AgentTerminalManager` (`extension/src/panel/AgentTerminalManager.ts`)** —
  `Map<agentId, AgentTerminal>` with idempotent `open()`. Same shape as
  the prior `AgentPanelManager`; replaces it. Includes the `isDisposing`
  guard from the adversarial-review fix (A10) so the synchronous
  `onDidDispose` callback can't mutate the map mid-iteration during
  teardown. — copilot(developer:opus-4.7)

- **`PseudoterminalIO` (`extension/src/panel/io/PseudoterminalIO.ts`)** —
  pure-logic input/output handler driven by the host-side AgentTerminal.
  Owns the line buffer, ↑/↓ history, escape-state machine for arrow-key
  parsing, slash-command dispatch (`/help`, `/yolo on|off`, `/clear`),
  banner + prompt rendering, OSC 633 emission discipline, and
  transcript replay for re-opened terminals (CD-11 §6). 34 unit tests.
  — copilot(developer:opus-4.7)

- **`oscSequences` (`extension/src/panel/io/oscSequences.ts`)** — pure
  helpers for the VS Code shell-integration `OSC 633` catalog
  (`promptStart`, `promptEnd`, `preExecution`, `done`, `commandLine`
  with command-line nonce, `setCwd`, `setProperty`,
  `richCommandDetection`, `escapeCommandLine`). 18 unit tests verifying
  exact byte sequences VS Code's parser expects, including the
  required hex-escape rules (`\` → `\\`, `;` → `\x3b`, any code ≤ 0x20
  → `\xNN`, including space). — copilot(developer:opus-4.7)

### Removed

- **`AgentPanel`, `AgentPanelManager`** — superseded by `AgentTerminal`
  + `AgentTerminalManager`. — copilot(developer:opus-4.7)

- **`extension/webview-src/`** — entire React + Tailwind + xterm.js
  webview tree (App.tsx, components/, lib/, protocol/ mirror, styles/).
  No equivalent in the new substrate. — copilot(developer:opus-4.7)

- **`extension/src/protocol/`** — `MessageEnvelope`, `INBOUND_TYPES`,
  `OUTBOUND_TYPES`, `MESSAGE_SCHEMAS`. There's no postMessage with
  Pseudoterminal — the host drives the Pseudoterminal directly via
  callbacks. — copilot(developer:opus-4.7)

- **`extension/src/webview/messageRouter.ts`** — same reason; no
  inbound dispatch surface. — copilot(developer:opus-4.7)

- **`extension/test/unit/protocol/`, `extension/test/unit/webview/`** —
  test surfaces are gone. The 52-test PseudoterminalIO + oscSequences
  suite under `test/unit/panel/` covers the new code.
  — copilot(developer:opus-4.7)

- **Vite, React, Tailwind, xterm.js, Zod, postcss, autoprefixer, the
  `tsconfig.webview.json` typecheck pass, the `build:webview` npm
  script** — all dropped from `package.json` and the build pipeline.
  Result: smaller `extension.cjs` bundle (no React, no xterm.js,
  no zod), simpler build (single `node esbuild.config.mjs` step),
  faster install. — copilot(developer:opus-4.7)

### Added

- **Agent test suite (I7)**: `test/unit/state/Agent.test.ts` covers the
  CD-11 keel — basic snapshot shape, status transitions, transcript
  accumulation (chunks then assembled final), `streaming: true` /
  `model` / `correlation_id` plumbing into `createSession`, and the
  permission shim's per-kind policy delegation + SDK-result mapping
  (`allow → approved`, `deny → denied-interactively-by-user`, `ask →
  denied-no-approval-rule-and-could-not-request-from-user`). 13 tests.
  — copilot(developer:opus-4.7)

- **Replay-transcript test suite (I4)**: `test/unit/webview/replayTranscript.test.ts`
  covers `TerminalController.onAssistantFinal(text?)` and
  `replayTranscript(...)` — the two surfaces that drove the "no output
  in the xterm" symptom from the adversarial review. Tests the
  text-when-not-streaming path, the prefer-final-over-chunks path, and
  multi-turn ordering. 9 tests. — copilot(developer:opus-4.7)

- **CopilotSdkAdapter env allowlist test (I3 / E1)**:
  `test/unit/sdk/CopilotSdkAdapter.env.test.ts` covers `buildSpawnedEnv`
  — the new explicit-allowlist replacement for the previous
  `...process.env` spread. Asserts that `GH_TOKEN`, `AWS_*`, `OPENAI_*`,
  `NPM_TOKEN`, etc. are filtered out and that overrides win over
  inherited values. 7 tests. — copilot(developer:opus-4.7)

- **`AA_WEBVIEW_CLOSED` event (A7)**: catalog'd alongside
  `AA_WEBVIEW_OPENED` so `AgentPanel.handlePanelClose` can emit a
  distinct event instead of misusing OPENED.
  — copilot(developer:opus-4.7)

### Changed

- **A1 / FR-012 — `streaming: true` on every SDK session**.
  `Agent.ensureSession` now passes `streaming: true` to
  `sdk.createSession`, so `assistant.message_delta` events flow as
  designed. Without this, the SDK only emitted final
  `assistant.message` events and the user saw nothing in the xterm
  while the model was working. — copilot(developer:opus-4.7)

- **A2 — render the assistant's final text when streaming was off**.
  `TerminalController.onAssistantFinal(text?)` now writes
  `text + CRLF` when no streaming preceded it (when streaming did
  precede, only a CRLF — the deltas already drew the body). `App.tsx`
  passes `payload.text` through. The combined effect: the model's
  output now actually appears in the terminal. — copilot(developer:opus-4.7)

- **A3 — permission modal copy is built per `request.kind`**.
  `PromptUserPolicy.decide` now `switch`es on the SDK's
  `PermissionRequest.kind` (`shell` / `write` / `read` / `mcp` / `url`
  / `custom-tool`, plus `memory` and unknown future kinds) and renders
  per-kind title + body — e.g., shell shows `$ <fullCommandText>` +
  intention + warning; write shows fileName + intention + diff
  preview; read shows path + intention; url shows URL + intention.
  Replaces the previous broken modal that read invented
  `request.toolName` / `request.summary` fields and rendered the
  empty `Agent Arena: allow ?\n\n`. — copilot(developer:opus-4.7)

- **A4 — permission deny path returns the SDK's real result shape**.
  `Agent`'s `onPermissionRequest` shim now maps internal
  `PermissionDecision.deny` to `{ kind: "denied-interactively-by-user",
  feedback }` and `ask` to
  `{ kind: "denied-no-approval-rule-and-could-not-request-from-user" }`
  — both members of the SDK's `PermissionRequestResult` union. The
  previous `{ kind: "denied", reason }` was not in the union and
  silently failed RPC validation. Allow now returns `{ kind: "approved" }`.
  — copilot(developer:opus-4.7)

- **A5 / CD-04 — `correlation_id` propagates through the prompt chain**.
  `MessageRouter.InboundHandler` now receives the envelope and
  `Agent.submitPrompt(prompt, correlationId?)` accepts the originating
  envelope's id, forwarding it through every downstream EI-1 emit
  (`AA_AGENT_PROMPT_SUBMITTED`, `AA_AGENT_SESSION_*`, `AA_AGENT_SEND_*`,
  `AA_AGENT_SDK_EVENT`, etc.). The audit chain now reflects what the
  spec promises. — copilot(developer:opus-4.7)

- **A6 — drop `assistant.streaming_delta` subscription**. That event
  carries `{ totalResponseSizeBytes }` only, not content; the previous
  handler read non-existent `data.deltaContent` and just spammed the
  EI-1 log with empty deltas. The single content stream is
  `assistant.message_delta` (correctly subscribed) +
  `assistant.message` (final). — copilot(developer:opus-4.7)

- **A9 — `replayTranscript` prefers final over chunks**. When a turn
  has both, the consolidated final renders; chunks are the fallback.
  Pre-fix the condition was `final !== undefined && chunks.length === 0`,
  which dropped the consolidated final whenever both were recorded.
  — copilot(developer:opus-4.7)

- **A10 / A11 — dispose hygiene**. `AgentPanelManager.dispose` snapshots
  the panel map and clears it before iterating, so the synchronous
  `panel.onDidDispose` callback can't mutate a Map mid-walk. The
  manager and `YoloStatusBar` are no longer pushed to
  `context.subscriptions` since they're explicitly disposed in
  `deactivate()` in their required teardown order; double-dispose
  closed. — copilot(developer:opus-4.7)

- **A12 / FR-013 — read `agentArena.primaryAgent.model` config**.
  `extension.ts` reads the configured model from
  `vscode.workspace.getConfiguration("agentArena").get("primaryAgent.model")`
  and forwards it through `Agent` → `createSession({ model })`.
  Empty-string and undefined fall through to the SDK default. The
  setting was declared in `package.json` but never read.
  — copilot(developer:opus-4.7)

- **A13 — `ResumeSessionConfig` spread order**. Spread the caller's
  opts first, then apply the default `onPermissionRequest` so a missing
  key falls through to `sdk.approveAll`; previously the order was
  inverted and a caller-supplied `undefined` would clobber the default.
  — copilot(developer:opus-4.7)

- **E1 — env allowlist for spawned Copilot CLI**. `CopilotSdkAdapter`
  no longer spreads `process.env` into the spawned binary's
  environment; it forwards an explicit allowlist (`PATH`, `HOME`,
  `USERPROFILE`, `LANG`, `LC_*`, OS housekeeping like `TEMP`/`PATHEXT`,
  XDG variables, `TERM`/`COLORTERM`) plus any `COPILOT_*` prefixed key,
  with caller overrides winning. Closes the leak that was forwarding
  `GH_TOKEN`, `AWS_*`, `OPENAI_API_KEY`, `NPM_TOKEN`, and arbitrary CI
  secrets to the child process. — copilot(developer:opus-4.7)

- **H6 — `agent-arena.openAgent` declared in `package.json`**. The
  canonical command (CD-11 §7) is now in `commands` and
  `activationEvents`, so the Command Palette discovers it.
  — copilot(developer:opus-4.7)

- **I2 — permission test fixtures use real SDK kind shapes**. The
  `PromptUserPolicy.test.ts` and `YoloPolicy.test.ts` fixtures
  previously cast invented `{ toolName, summary }` shapes as `never` so
  the typed `PermissionDecisionContext` would accept them — but those
  fields don't exist on the SDK's `PermissionRequest` union, which is
  why bug A3 didn't surface despite all 112 tests passing. Fixtures
  are now built from the real `kind: "shell" | "write" | "read" |
  "url"` discriminator with per-kind fields, and the suite asserts the
  modal copy includes the kind-specific details. The same `as never`
  cast survives only because `[key: string]: unknown` on the SDK type
  doesn't admit the discriminated members directly through TS's
  inference. — copilot(developer:opus-4.7)

### Removed

- **B1 — Supervisor / `lifecycle.ts`**. The 122-line `SupervisorState`
  state machine had zero callers in `src/` and the
  `aa.sdk.cli.degraded.v1` / `aa.sdk.cli.restart_attempted.v1` events
  it claimed to drive were never emitted. Catalog entries and the
  test file removed alongside the module. Re-introduce in a follow-up
  spec when CLI restart-supervision is actually wired through
  `CopilotSdkAdapter`. — copilot(developer:opus-4.7)

- **B2 — `harness/` + harness commands**. `AgentArenaHarness`,
  `serializeHarness`, `EMPTY_HARNESS`, `HarnessedSession`, the
  `agent-arena.harness.{export,import}` command stubs (which just
  showed a "not yet implemented" toast), the corresponding entries in
  `package.json` `commands` + `activationEvents`, and the
  `AA_HARNESS_*` event-name catalog entries are gone. CD-02 was
  already withdrawn in CD-12; this completes the removal.
  — copilot(developer:opus-4.7)

- **B3 / B6 — `permission.respond` + `permission.prompt` protocol
  surface**. The webview-mediated permission dispatch was superseded
  by VS Code modal dialogs (CD-07 §6); the no-op handler in
  `AgentPanel.wireRouter`, the schemas in `protocol/types.ts`, and
  the `INBOUND_TYPES` / `OUTBOUND_TYPES` entries are removed.
  — copilot(developer:opus-4.7)

- **B7 — stale `PrimaryAgentPanel` doc references**. The class was
  replaced by `AgentPanel` in the CD-11 refactor; comments in
  `FakeSdkAdapter.ts`, `CopilotSdkAdapter.ts`, `SdkAdapter.ts`, and
  the README's *Layout* + *Architecture* sections are updated to
  reference the new module names. — copilot(developer:opus-4.7)

### Added

- **CD-08 — prototype-based UI shell**: the React webview now matches
  the layout in [`prototype/swarm-primary.png`](prototype/swarm-primary.png):
  top brand bar, `Swarm | Workflow` tabs, left sidebar with a
  `PRIMARY AGENT` section (single entry — *Main Developer*), per-agent
  header with avatar + status + settings gear, xterm terminal, and a
  bottom command-input row with a paper-airplane send button. The
  `BACKGROUND AGENTS` section and `+ New Agent` CTA from the prototype
  are intentionally not rendered in this scaffold (deferred to a
  future spec); the visual contract is locked so they slot in cleanly
  when they ship. — copilot(developer:opus-4.7)

- **FR-026 path correction**: harness fixture moved from
  `extension/tests/fixtures/` to `extension/tests/harnesses/` per
  `constitution.md:584-588`. Resolves the deputy's borderline ❌
  from the same report. — copilot(developer:opus-4.7)

- **Permission policy seam (T036, T038–T041)**: extracts the inline
  yolo + modal-prompt logic from `PrimaryAgentPanel` into three
  files. `YoloPolicy` always allows + emits the canonical event with
  `source: "yolo"`. `PromptUserPolicy` uses VS Code's modal dialog;
  user-dismissed modals are denied as a safe default.
  `DefaultPolicyResolver` re-consults `getYolo` on every tool
  invocation so a yolo toggle takes effect immediately (FR-018) without
  restarting the session. The `PrimaryAgentPanel.onPermissionRequest`
  shim translates the typed `PermissionDecision` into the SDK's
  `approved`/`denied` shape — no call-site changes required when a
  future per-tool policy plugs into the resolver (FR-019 / R-06).
  — copilot(developer:opus-4.7)

- **Copilot CLI startup fix in VS Code's Electron host**: explicitly
  resolves `cliPath` to the OS-specific binary at
  `node_modules/@github/copilot-<platform>-<arch>/copilot[.exe]` so the
  SDK skips its `getNodeExecPath()` fallback (which would otherwise
  spawn `Code.exe` instead of `node`, failing immediately). Surfaces
  in the panel banner as *connected to GitHub Copilot as `<your-login>`*
  when the user is signed in. — copilot(developer:opus-4.7)

- **Wiki bootstrap (FR-027–031)**: established the project's durable
  knowledge base under `wiki/`. Synthesis pages
  [`wiki/sources/copilot-sdk.md`](wiki/sources/copilot-sdk.md) (FR-027)
  and [`wiki/sources/vscode-extensions-api.md`](wiki/sources/vscode-extensions-api.md)
  (FR-028) cover architecture, key APIs, auth priority order,
  observability hooks, and known constraints (the Electron-host
  `process.execPath` gotcha, ESM-only SDK, missing abort-turn
  primitive). 10 immutable source-pointer files per source under
  `wiki/raw/<source>/` (FR-029). [`wiki/glossary/bot-fight.md`](wiki/glossary/bot-fight.md)
  records the historical alias (FR-031). [`wiki/index.md`](wiki/index.md)
  cross-links every page (FR-030). [`wiki/AGENTS.md`](wiki/AGENTS.md)
  documents the editing contract for any future agent or human.
  — copilot(developer:opus-4.7)

- **CI workflow (FR-032/033/034)**:
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on
  `ubuntu-latest` and `windows-latest`, doing
  `npm ci → typecheck → lint → vitest → integration (Linux only via
  xvfb) → build → vsce package`, and uploads the `.vsix` as a build
  artifact. Live-SDK verification stays manual per FR-033.
  — copilot(developer:opus-4.7)

- **README live-SDK verification (FR-035)**:
  [`extension/README.md`](extension/README.md) walks through install,
  build, run, sign-in to GitHub Copilot, the `Reply: pong` round-trip,
  trace-log inspection, and evidence to attach to the verification PR.
  Layout reflects the actual `src/` and `webview-src/` trees post-CD-07
  and -CD-08. — copilot(developer:opus-4.7)

- **US-2 unit test coverage (T065–T072 partial)**: 19 new tests across
  4 files — `YoloPolicy`, `PromptUserPolicy` (allow/deny/dismissed paths
  + event-emission ordering), `DefaultPolicyResolver` (the
  re-consult-getYolo-on-every-call invariant from FR-018), and
  `YoloStore` (per-agent isolation, default-OFF, `agentArena.yoloMode.<id>`
  key per CD-05). 110/110 tests passing. The remaining T067/T068
  workspace-reload integration tests are deferred — they require the
  yolo banner from CD-05 §3 which lands in a follow-up.
  — copilot(developer:opus-4.7)

- **Integration test scaffold (T049)**:
  [`extension/test/integration/activation.test.ts`](extension/test/integration/activation.test.ts)
  fires up a real VS Code instance via `@vscode/test-electron` and
  asserts: extension discoverable by id, `activate()` resolves without
  throwing, all five contributed commands are registered. CI runs
  these on Linux via `xvfb-run`. T050–T053 (view rendering, end-to-end
  round-trip, persistence, streaming aggregator) are scaffolded for
  but not yet authored — they follow once T071 (the `yolo.set` envelope
  wiring) lands. — copilot(developer:opus-4.7)

- **GitHub Action tracking (issue #12)**: filed
  [github.com/jdylanmc/agent-arena/issues/12](https://github.com/jdylanmc/agent-arena/issues/12)
  per the SOLID SNAKE persona's open question #1 — auto-invoking
  deputy + SOLID-snake on PR events requires LLM-API-key infrastructure
  not yet available. Tracked for a follow-up spec; the bots remain
  human-invoked in the meantime (per their read-only contract).
  — copilot(developer:opus-4.7)

- **SOLID-snake persona example cleanup**: dropped `-xhigh` suffix from
  the persona's example identities at
  [`agents/solid-snake/persona.md:49`](agents/solid-snake/persona.md)
  per the persona-consistency note in the SOLID-snake report
  (L99-105). — copilot(developer:opus-4.7)

- **CD-07 implementation — primary agent surface = WebviewPanel + bespoke
  xterm.js terminal**: replaces the CD-06 Pseudoterminal architecture
  (which proved too narrow for planned customizations and hides the
  rendering layer behind VS Code's Terminal panel). The primary agent now
  opens via `vscode.window.createWebviewPanel` in the editor area
  (`viewColumn=Active`, `retainContextWhenHidden=true`,
  `enableScripts=true`, `localResourceRoots=dist/webview`) — splittable,
  maximizable, dragable like any editor tab. Renderer is `@xterm/xterm`
  v0.11.0 + `@xterm/addon-fit` inside a React shell at `webview-src/`.
  CSP is locked on every render (`default-src 'none'`; nonce-gated
  scripts; `'unsafe-inline'` styles only). Activity-bar **A** icon stays
  as the auxiliary entry; on first activation per session the panel
  auto-opens beside the welcome page. The earlier
  `src/terminal/PrimaryAgentTerminal.ts` and the React chat-style
  components (`MessageList`, `PromptInput`, `StatusHeader`) are deleted
  as superseded; replaced by `src/panel/PrimaryAgentPanel.ts` (host
  orchestration), `webview-src/components/XtermTerminal.tsx` (renderer),
  and `webview-src/lib/terminalController.ts` (input buffer, ↑/↓ history,
  CSI parsing, slash commands). New `agent.bootstrap` outbound message
  type carries cwd + adapter kind/login + yolo state to the React shell
  on first paint. The FakeSdkAdapter and adapter-contract tests were
  updated to emit SDK-shaped events (`{ type, data: {...} }` with
  `deltaContent`/`content`) so a single panel-side handler works against
  both the real and fake adapters. — copilot(developer:opus-4.7)

- **Production `CopilotSdkAdapter` + runtime selector** (T035):
  `extension/src/sdk/CopilotSdkAdapter.ts` is now the SOLE permitted
  importer of `@github/copilot-sdk` runtime values; it implements the
  ISP-segregated `SdkAdapter` contract by wrapping `CopilotClient` and
  `CopilotSession`. A new `extension/src/sdk/selectAdapter.ts` decides
  at runtime whether to use the real adapter (user signed in to GitHub
  Copilot) or fall back to `FakeSdkAdapter` demo mode (not signed in,
  CLI failed to start, or `forceFake` for tests). Adapter selection is
  lazy — happens on first invocation of `agent-arena.openPrimaryAgent`,
  not on extension activation, so the Copilot CLI is not spawned on
  every VS Code startup. The chosen adapter is announced via a new
  `aa.sdk.adapter.selected.v1` canonical event and surfaced in the
  Pseudoterminal banner subtitle (e.g. "connected to GitHub Copilot as
  alice (user)" or "demo mode (not signed in)"). `@github/copilot-sdk`
  and `@github/copilot` are esbuild externals so the SDK locates the
  bundled CLI at runtime via `require.resolve()`. Note: SDK v0.1.8
  doesn't expose `copilotHome` or `telemetry` on `CopilotClientOptions`
  — `COPILOT_HOME` is redirected via env, and SDK-internal telemetry
  routing is deferred until the SDK adds it (the canonical EI-1 log
  still captures the events that matter per CD-01 normalization).
  Adapter NOT exercised by unit tests per FR-033 (live SDK); interface
  conformance is type-checked. — copilot(developer:opus-4.7)

### Changed

- **`/speckit.tasks` for `scaffold-application`**: produced
  `specs/20260506-144809-scaffold-application/tasks.md` with 91
  numbered tasks (T001..T091) grouped by user story (US1 P1
  round-trip MVP, US2 P2 yolo + permissions) and infrastructure
  phases (Setup, Foundational, Polish). Tests are MANDATORY (not
  "OPTIONAL" as the template suggests) per constitution Principle III
  (Test-First, NON-NEGOTIABLE) — every implementation task is
  preceded by a failing-test task that exercises the same behavior.
  US1 is shippable as MVP after Phase 3 lands. Polish phase covers
  the harness round-trip + unload tests (binding EI-2 per plan.md
  gate), trace-log rotation (closes reviewer significant finding
  #12), live-SDK auth verification (R-11c, tagged `@live-sdk` and
  excluded from CI per FR-033), spec hygiene cleanups (closes deputy
  round-1 minor items: P-1/EI mislabel at spec.md:18-19, Key
  Entities `events.jsonl` drift, README "numbered branch" drift,
  edge-case coverage), and final wiki cross-linking. — copilot(developer:opus-4.7)
- **SOLID/ISP refactor of `contracts/sdk-adapter.ts`** (pre-emptive,
  in anticipation of SOLID SNAKE review): split the monolithic
  `SdkAdapter` (6 methods) into two single-responsibility interfaces
  — `SdkClientLifecycle` (start/stop) and `SdkSessionRegistry`
  (create/resume/list/delete sessions) — with the original
  `SdkAdapter` retained as an aggregate (`extends` both) for callers
  that legitimately need both halves (extension activation code).
  Likewise split `SdkSessionHandle` into `SdkSessionLifecycle`
  (sessionId + disconnect) and `SdkSessionMessaging` (send + on +
  abortCurrentTurn), with `SdkSessionHandle` as the aggregate.
  Consumers MUST import the narrowest interface that satisfies their
  needs; the project's ESLint config will enforce this with
  `no-restricted-imports` during `/speckit.implement`. Mirror update
  in `data-model.md` plus a consumer-to-interface mapping table.
  No behavior change; pure interface segregation. — copilot(developer:opus-4.7)
- **`WikiRawPointer` schema** added to `data-model.md` (closes the
  deputy round-1 wiki/raw item): per-pointer-file YAML frontmatter
  with `source_url`, `fetched_at` (immutable), `commit_sha?`,
  `license` (SPDX), `content_hash?`, `snapshot_kind`
  (`pointer-only` | `cached-body`), `body_path?`, and
  `ingest_status?`. Pointer + body files are write-once after first
  commit; cached-body snapshots gated by an SPDX license allow-list
  at `.specify/wiki-raw-licenses.json` (created in /speckit.implement).
  This is a superset-compatible refinement of `constitution.md:571`'s
  "immutable source pointer files" definition; `plan.md` Project
  Structure updated to show the `snapshots/` subdirectory under each
  ingested source. — copilot(developer:opus-4.7)
- **`/speckit.plan` for `scaffold-application`**: produced
  `specs/20260506-144809-scaffold-application/plan.md`,
  `research.md` (Phase 0 — SDK + tooling research, with 11 numbered
  findings R-01..R-11), `data-model.md` (canonical EI-1 envelope, Agent,
  HarnessedSession, AgentArenaHarness, MessageEnvelope, PermissionPolicy,
  SdkAdapter types), and `contracts/` (webview-protocol.md,
  sdk-adapter.ts, permission-policy.ts). Headline outcomes:
  **CD-03 falls to fallback A** — the SDK ships no consumer-facing test
  harness (only internal CI mocks under `test/harness/`); we build an
  `SdkAdapter` interface with a `FakeSdkAdapter` substitute. **CD-01
  refined** to a canonical EI-1 log + a sidecar raw-OTel file (the SDK
  writes the latter; the extension normalizes into the former), so the
  user's "snap to SDK telemetry where possible, preserve observability"
  direction is satisfied without losing SDK-internal span detail. Pinned
  concrete `engines.vscode: ^1.95.0` (replacing FR-002's "current
  LTS-line"), adopted `@vscode/test-cli` for integration tests
  (replacing FR-002's `@vscode/test-electron`), set monorepo layout
  with the shipped extension under `extension/`. Designed the typed
  `PermissionPolicy` interface that FR-019 promised but did not specify.
  Three open spec-text contradictions remain to be cleaned up in a
  follow-up commit before `/speckit.tasks` (Principle II `-xhigh`
  trailers in spec/checklist; FR-029 `wiki/raw/` definition;
  spec Key Entities mention of `events.jsonl` per session).
  — copilot(developer:opus-4.7)
- **P-1 self-application carve-out** (resolves #6). Added a
  *Self-application exception* clause to P-1 in
  `.specify/memory/constitution.md`. The literal instruction-override
  probe that appears in P-1's own teaching prose and `❌` code example
  is now explicitly exempted from the P-1 prohibition, scoped strictly
  to the P-1 section of the constitution document. The exception does
  not extend to any other documentation, test, fixture, comment, or
  commit anywhere else in the repository, and drift outside that
  section is a P-1 violation in the normal way. Chosen as **Fix B**
  from the deputy's two-option recommendation in issue #6 (Fix A
  would have required a history rewrite + force-push to `main`).
  Trade-off acknowledged: prohibitions now admit a single,
  minimally-scoped self-application carve-out. — copilot(developer:opus-4.7)
- **`/speckit.clarify` for `scaffold-application`**: encoded five clarifying
  decisions (CD-01..CD-05, newest-at-top per template) and rewrote
  FR-009 / FR-017 / FR-020 / FR-021 / FR-024 / FR-033 to match. CD-01 resolves
  the EI-1 contradiction (single canonical JSONL log; SDK event names adopted
  verbatim with `.v1` suffix; new extension events under the `aa.` namespace;
  payload normalized through the telemetry adapter with original SDK payload
  preserved under `payload.sdk`). CD-02 resolves the EI-2 harness leak
  (harness gains `sessions[]` with manifest + `content_hash` referencing the
  SDK session directory; SDK remains system of record). CD-03 sets the CI
  test seam (use the SDK's own test harness if it ships one — verified during
  `/speckit.plan` via the wiki ingestion — otherwise an `SdkAdapter` interface
  with a `FakeSdkAdapter` substitute; either way the seam must exercise
  streaming, permission allow/deny, queueing, resume, startup failure, and
  runtime errors). CD-04 specifies the webview ↔ extension-host versioned
  envelope `{ protocol_version, message_id, correlation_id, session_id?,
  agent_id?, type, payload }` with runtime validation and unknown-`type`
  rejection. CD-05 scopes yolo persistence to `workspaceState`, per-agent,
  with Settings Sync explicitly disabled. The Principle II attribution
  self-inconsistency and the FR-029 `wiki/raw/` definition contradiction
  remain to be addressed in subsequent commits to PR #5. — copilot(developer:opus-4.7)
- `.github/copilot-instructions.md` rewritten for clarity. Dropped the
  sub-agent-spawning procedural prose (deputy invocation is owned by
  the constitution, not by host-runtime instructions). New structure:
  constitution pointer with attribution reminder, "Spec Kit is the
  workflow" (non-negotiable adherence), "The wiki" (purpose and
  structure of the knowledge base), and a one-paragraph `agents/`
  pointer that defers to the constitution's Governance section for
  deputy details. — copilot(developer:opus-4.7-xhigh)
- Spec Kit branch & spec-directory naming switched from **sequential
  numbering** (`001-add-user-auth`) to **timestamp prefix**
  (`YYYYMMDD-HHMMSS-add-user-auth`). Parallel cloud agents no longer
  race for the next sequential number, and date-prefixed specs let us
  revisit old specs chronologically and re-assert their primary
  assumptions and goals over time. Affects `.specify/init-options.json`,
  `.specify/extensions/git/git-config.yml`,
  `.specify/extensions/git/config-template.yml`, and
  `.specify/extensions/git/extension.yml`. — copilot(developer:opus-4.7-xhigh)

### Added

- **`/speckit.implement` Phase 2 wave 3 + Phase 3 first slice — visible
  end-to-end demo** (`tasks.md` T046, T054-T056, T058-T064 ticked;
  running total: 34 of 91 tasks). The extension is now **F5-runnable**
  end-to-end: press F5 in `extension/`, click the Activity Bar icon,
  submit a prompt, see streamed assistant responses. The user-visible
  surface is real React + Tailwind, the postMessage envelope is real
  CD-04, and every event hits the canonical EI-1 log:
    - Moved `FakeSdkAdapter` from `test/unit/sdk/` to `src/sdk/` and
      taught it an `autoRespond` mode for demo use. The Fake is the
      production adapter until task T035 lands the real
      `CopilotSdkAdapter`.
    - `extension/src/webview/messageRouter.ts` — host-side dispatcher
      validating every inbound envelope via Zod, rejecting unknown
      `type` and payload-schema violations as `aa.webview.message.rejected.v1`,
      catching handler errors as `aa.event_handler.failed.v1`.
    - `extension/src/webview/ViewProvider.ts` — `WebviewViewProvider`
      wiring the React bundle into the Activity Bar view. Constructs
      the webview HTML with CSP nonce; brokers postMessage in both
      directions; manages the per-view session lifecycle; subscribes
      to SDK events and translates to outbound envelopes
      (`assistant.delta`, `assistant.message.final`, `session.state`,
      `error`).
    - `extension/src/extension.ts` — entry point. Constructs
      `EventEmitter` (writes `${context.logUri}/agent-arena.events.jsonl`),
      starts the FakeSdkAdapter in demo mode with auto-respond,
      registers `PrimaryAgentViewProvider` + commands.
    - `extension/src/activate/registerCommands.ts` —
      `agent-arena.openPrimaryAgent`, `agent-arena.showTraceLog`,
      `agent-arena.harness.{export,import}` (the harness commands are
      stubbed; full impl lands T078).
    - `extension/src/shared/ids.ts` — `mintSessionId(agentId)`,
      `mintCorrelationId()`, `mintMessageId()`.
    - `extension/webview-src/` — React + Tailwind UI:
      `App.tsx` (state machine for status / turns / errors),
      `components/StatusHeader.tsx`, `components/MessageList.tsx`
      (with streaming caret + finalized indicator),
      `components/PromptInput.tsx` (Enter to send, Shift+Enter newline),
      `protocol/messageBus.ts` (typed `bus.send` / `bus.on` over
      `acquireVsCodeApi`), `styles/tailwind.css` (VS Code theme
      variables baked in via `tailwind.config.ts`).
    - `extension/.vscode/launch.json` + `tasks.json` — F5 launches an
      Extension Development Host with the bundle pre-built.
    - `extension/README.md` — install + build + F5 instructions, plus
      the manual SC-002 verification ritual that takes effect once
      T035 lands.
  All 91 vitest unit tests still green; typecheck clean; lint clean;
  `npm run build` produces `dist/extension.js` (~573KB) and
  `dist/webview/{index.html, assets/index.{js,css}}` (~226KB total).
  — copilot(developer:opus-4.7)
- **`/speckit.implement` Phase 2 (foundational types) — second wave**
  (`tasks.md` T028–T034 ticked; running total: 24 of 91 tasks).
  Landed the SDK adapter seam, supervisor state machine, and EI-1
  EventEmitter — all with failing-test-first vitest coverage:
    - `extension/src/sdk/SdkAdapter.ts` — ISP-segregated interfaces
      (`SdkClientLifecycle`, `SdkSessionRegistry`, `SdkAdapter`
      aggregate, `SdkSessionLifecycle`, `SdkSessionMessaging`,
      `SdkSessionHandle` aggregate) plus `REQUIRED_BEHAVIORAL_CONTRACT`
      mirror of contracts/sdk-adapter.ts.
    - `extension/test/unit/sdk/FakeSdkAdapter.ts` — in-memory test
      double exercising every behavior in
      `REQUIRED_BEHAVIORAL_CONTRACT` (streaming deltas, permission
      allow/deny, queued prompts, resume/list, startup failure,
      runtime error). Replaces the SDK in unit + integration tests
      without requiring a Copilot subscription (FR-033).
    - `extension/src/sdk/lifecycle.ts` — supervisor state machine
      (`notStarted → starting → ready → degraded → restarting →
      ready | stopped`) with pure `nextState` transition function,
      `Supervisor` class with observer-list dispatch (observer
      errors swallowed to keep state-machine integrity), and
      `canAcceptPrompts` predicate for early rejection in
      `degraded`/`restarting`. Closes plan.md significant finding #8.
    - `extension/src/telemetry/EventEmitter.ts` — single-writer JSONL
      emitter to `${context.logUri}/agent-arena.events.jsonl`. Creates
      parent directory; writes one CanonicalEvent per line with
      trailing `\n`; subscriber notification with bounded recursion
      guard (re-emitted `AA_EVENT_HANDLER_FAILED` events do not
      re-trigger throwing subscribers); silent mode for tests; auto
      UUID for callers using `emitNew()`.
    - 8 test files, 91 tests total (envelope, types, event,
      eventNames, harness shape, lifecycle, EventEmitter, adapter
      contract). All green; `npm run typecheck` clean; `npm run lint`
      clean (with refined `no-restricted-imports` policy permitting
      type-only SDK imports in `SdkAdapter.ts`/`PermissionPolicy.ts`/
      tests, value imports still restricted to `CopilotSdkAdapter.ts`).
  — copilot(developer:opus-4.7)
- **`/speckit.implement` Phase 2 (foundational types) — first wave**
  (`tasks.md` T022-T025, T037, T044-T045, T047-T048 ticked).
  Landed pure-TypeScript foundational modules + their failing-first
  vitest unit tests:
    - `extension/src/protocol/envelope.ts` — `MessageEnvelopeSchema`
      (Zod) for the CD-04 webview ↔ host postMessage envelope plus
      `validateEnvelope` with a typed rejection-reason taxonomy.
    - `extension/src/protocol/types.ts` — per-`type` Zod schemas
      (`webview.ready`, `prompt.submit`, `yolo.set`,
      `permission.respond`, `assistant.delta`,
      `assistant.message.final`, `permission.prompt`,
      `session.state`, `error`) with a `MESSAGE_SCHEMAS` dispatch
      table type-checked against the `MessageType` union.
    - `extension/src/telemetry/event.ts` — `CanonicalEvent<T>` shape
      + `CanonicalEventSchema` (Zod) per CD-01/EI-1 (`ts`, `level`,
      `event` namespaced+versioned, `agent_id`, `correlation_id`,
      `payload`) plus `makeEvent` helper and `EVENT_NAME_PATTERN`
      regex.
    - `extension/src/telemetry/eventNames.ts` — frozen catalog of
      every initial event identifier (15 `aa.*` + 9 `copilot.*`)
      with `isCatalogedEventName` runtime guard.
    - `extension/src/harness/shape.ts` — `AgentArenaHarness`,
      `Agent`, `HarnessedSession`, `ManifestFile` types, frozen
      `EMPTY_HARNESS` constant (binds plan.md unload semantics),
      and `serializeHarness` deterministic serializer (sorts agents
      by id, sessions by session_id, manifest.files by name; 2-space
      indent; trailing newline) per EI-2 "Diffable" clause.
    - `extension/src/permission/PermissionPolicy.ts` —
      `PermissionDecision`, `PermissionDecisionContext`,
      `PermissionPolicy`, `PolicyResolver` typed interfaces (the
      seam FR-019 promised, designed for future per-tool policies).
  Test files under `extension/test/unit/{protocol,telemetry,harness}/`
  exercise envelope validation, dispatch coverage, event-name pattern
  conformance, harness round-trip determinism, and the empty-harness
  unload constant. Implementations were authored AFTER their tests
  per Principle III. — copilot(developer:opus-4.7)
- **`/speckit.implement` Phase 1 — `extension/` scaffolding**
  (`tasks.md` T001–T010 ticked). Created the `extension/` package
  with `publisher: jdylanmc`, `name: agent-arena`, `version: 0.0.1`,
  `engines.vscode: ^1.95.0`, runtime deps `@github/copilot-sdk@^0.1.8`
  + `zod@^4.3.6`. Build pipeline: esbuild for the extension-host
  bundle (`src/extension.ts` → `dist/extension.js`, CJS, externals
  `vscode`), Vite + React + Tailwind for the webview bundle
  (`webview-src/` → `dist/webview/`, with a build-time copy step
  syncing `src/protocol/*.ts` into `webview-src/protocol/` so both
  sides share the envelope validator). Test harness: vitest for
  unit (`test/unit/`), `@vscode/test-cli` + Mocha for integration
  (`test/integration/`, unique `userDataDir` per run, retry policy).
  ESLint flat config enforces the `no-restricted-imports` rule that
  bans `@github/copilot-sdk` outside `src/sdk/CopilotSdkAdapter.ts`
  (the SOLE permitted importer per CD-03 / R-02 / ISP) and bans
  ad-hoc `console.log` per EI-1. `.prettierrc.json`,
  `.vscodeignore`, `.gitignore`, MIT `LICENSE` (copyright "Dylan
  McCurry"), placeholder activity-bar SVG icon (uses `currentColor`
  for theme-aware tinting). Empty `src/`, `webview-src/`, `test/`,
  `tests/harnesses/` directory tree pre-created. `npm install`
  verification deferred to Phase 2 first commit. — copilot(developer:opus-4.7)
- **SOLID SNAKE agent persona** under `agents/solid-snake/` — a
- **GLaDOS-QA composed agent** — a source-controlled agent that
  enforces quality and testability of the codebase autonomously, in
  the background. Renders two mutually-exclusive verdicts
  (**QA-VERIFIED** ✅ / **QA-DISAPPOINTMENT** ❌) plus an orthogonal
  **QA-FLAKY** ⚠ annotation label that always coexists with
  `QA-DISAPPOINTMENT` (a test that passes on retry without
  explanation is never benign). Code-coverage labels (`CODE-COVERAGE-HELD` /
  `CODE-COVERAGE-DROPPED` / `CODE-COVERAGE-UNTESTED`) explain the verdict's
  relationship to coverage. Six pillars: `tests-pass`, `coverage`,
  `crash-triage`, `sensory-analysis`, `flakiness`, `test-first`.
  Maintains **two PR comments updated in place** per PR — a
  *running checklist* tracking pillar findings, and a dedicated
  *coverage report* posted on every PR (including PRs where
  coverage held) — and files attributed reports under
  `agents/glados-qa/reports/` plus crash and UI artifacts under
  `agents/glados-qa/artifacts/`. Identity:
  `copilot(glados-qa:<model>)`. Trigger phrase:
  `> Initiate Aperture Science verification protocol`. Operates
  independently of the deputy and SOLID SNAKE. Originating input:
  issue #3. Spec: `specs/20260507-123242-glados-qa-agent/spec.md`. — copilot(developer:opus-4.7)
- **Directive / persona composition layout** under `agents/`. Splits
  an agent's role-agnostic *directive* (responsibilities, verdicts,
  contracts, hard constraints) from its directive-agnostic *persona*
  (name, voice, vocabulary, tonal rules), then composes them in a
  per-agent file. The split lets the same directive be played by
  different personas, and the same persona play different
  directives. Adds three new directories — `agents/directives/`,
  `agents/personas/`, and the composed `agents/glados-qa/` — and
  documents the new pattern alongside the legacy single-file persona
  layout in `agents/README.md`. Existing deputy and SOLID SNAKE
  personas remain on the legacy layout (the split is opt-in).
  — copilot(developer:opus-4.7)
- **QA directive** (`agents/directives/qa.md`). Role-agnostic
  Quality & Testability enforcement directive. Defines the six
  pillars, the two-verdict surface (`QA-VERIFIED` /
  `QA-DISAPPOINTMENT`), the orthogonal `QA-FLAKY` annotation label
  (always forces `QA-DISAPPOINTMENT`), the code-coverage labels, the
  three-attempt flakiness budget (1 fail + 2 retries; flakiness is
  never benign — a test that passes on retry without explanation
  fails the `flakiness` pillar), the **dedicated coverage report
  comment** posted on every PR and updated in place (distinct from
  the running checklist; required even when coverage held), the
  crash artifact contract (exit code, signal, `correlation_id`,
  last 100 log lines, env fingerprint, repro command, repro
  attempts), the test-vs-code failure classification
  (`code-failure` / `test-failure` / `infra-failure`), the
  **Blocking Directive** issue contract (title form, mandatory
  labels, body sections, idempotency by title, per-run cap of 5,
  re-check loop with 7-day stale-issue safeguard), the **degraded
  operation** clause (a pillar with an open Blocking Directive is
  skipped for the run; the agent continues rendering verdicts using
  the remaining operational pillars; PRs are never penalized for
  the directive's missing infrastructure), and the **first-run
  posture** (empty reports directory triggers a full pillar audit
  before any PR verdicts). Persona-agnostic. — copilot(developer:opus-4.7)
- **GLaDOS persona** (`agents/personas/glados.md`). Voice-only
  Aperture Science register: clinical, composed, quietly
  disappointed; never insults the subject; never loses composure;
  never gloats on a sign-off. Includes vocabulary table mapping
  generic concepts to GLaDOS-flavored terms (chamber / experiment /
  subject / artifacts / sign-off / disappointment / inconclusive /
  redundancy allowance / logged operational deficiency / unmonitored
  axis / reference profile / measurement) for use in narrative
  prose only — machine-readable identifiers (label names, JSON keys,
  file paths) stay in directive form. No copyrighted material from
  the source setting; voice and vocabulary only.
  Directive-agnostic — pluggable into future non-QA directives.
  — copilot(developer:opus-4.7)
- **GLaDOS-QA composition** (`agents/glados-qa/agent.md`). Binds the
  QA directive and the GLaDOS persona, names the role string
  `glados-qa` for Principle II attribution, names the trigger phrase
  `> Initiate Aperture Science verification protocol`, names the
  reports and artifacts directories, defines the authorized label
  set, defines the issue-filing surface (issues authored by an
  identity matching `<provider>(glados-qa:<model>)` only),
  documents two admissible issue-filing mechanisms (direct GitHub
  API with a fine-grained `issues:write` token vs staging
  directory under `agents/glados-qa/issues/staging/`), and
  documents the cross-agent independence boundary with deputy and
  SOLID SNAKE. — copilot(developer:opus-4.7)
- **SOLID SNAKE agent persona** under `agents/solid-snake/`— a
  read-only, source-controlled agent designed to be spawned
  autonomously in the background to monitor the repository for SOLID
  object-oriented design violations (SRP, OCP, LSP, ISP, DIP). Renders
  exactly two verdicts (**SOLID** / **NOT-SOLID**, the latter rendered
  red where surfaces support color), maintains a single in-place
  *running checklist* PR comment per PR that he updates as the PR
  evolves, applies `SOLID` / `NOT-SOLID` labels, and files attributed
  reports under `agents/solid-snake/reports/`. Identity:
  `copilot(solid-snake:<model>)`. Trigger phrase:
  `> Start the SOLID SNAKE agent workflow`. `agents/README.md` updated
  to list him under *Available agents*. — copilot(developer:opus-4.7-xhigh)
- **`prototype/` directory** with three concept mockups for the
  long-term Swarm UI vision (out-of-scope for the current scaffold
  spec, referenced by `specs/20260506-144809-scaffold-application/spec.md`'s
  *Originating-input citation* section): `swarm-primary.png` (the
  primary agent workspace), `swarm-background.png` (the background
  agents grid), and `swarm-workflow.png` (the workflow panel).
  Filenames are kebab-cased for cross-platform safety. Includes a
  `prototype/README.md` documenting provenance, scope, and the
  intended path forward (subsequent specs consume these; durable
  design notes land under `wiki/docs/` once the wiki tree exists).
  — copilot(developer:opus-4.7)
- **First feature spec: `scaffold-application`** (`specs/20260506-144809-scaffold-application/`).
  Establishes the minimal viable foundation for Agent Arena: a VS Code
  extension (publisher `jdylanmc`, MIT license) that integrates the
  GitHub Copilot SDK and proves an end-to-end primary-agent round-trip,
  with binary yolo toggle (default OFF, dab-icon control) gating the
  SDK's mandatory permission handler. Pulls SDK telemetry through the
  built-in OpenTelemetry exporter to satisfy EI-1; ships a single-agent
  harness skeleton (import/export commands + fixture) to satisfy EI-2;
  seeds the wiki with medium-depth ingestions of `github/copilot-sdk`
  and the VS Code Extensions API; bounds CI to `ubuntu-latest` +
  `windows-latest`; mocks the SDK in CI and documents manual live
  verification in the README. Resolves agent-arena#4. Subsequent specs
  build the Swarm sidebar, background agents, workflows, and
  fine-grained per-tool permissions on top of this scaffold. — copilot(developer:opus-4.7-xhigh)
- **Engineering Invariants section** in the constitution (between
  Prohibitions and Knowledge Base). Holds binding architectural
  properties of the shipped product that the constitutional dev model
  depends on. Numbered sequentially (EI-1, EI-2, ...) for precise
  citation. Specs MAY refine but MAY NOT relax. — copilot(developer:opus-4.7-xhigh)
- **EI-1: Full agent-observable execution.** Mandates structured
  single-line JSON logs against a canonical schema documented in
  `wiki/docs/log-schema.md`, stable namespaced/versioned event
  identifiers (e.g. `agent.invoke.started.v1`), end-to-end
  `correlation_id` propagation across agents/processes/async boundaries,
  zero ad-hoc `console.log`/`print` (lint enforced), and the
  operational bar that any failure MUST be diagnosable from logs
  alone. — copilot(developer:opus-4.7-xhigh)
- **EI-2: JSON state harnesses.** Mandates that all behavior-relevant
  application state is representable as a single round-trippable
  JSON harness, with replace-semantics `loadHarness`, in-process
  `unload`, top-level `harness_version`, deterministic field ordering
  for diffing, and source-controlled scenario fixtures under
  `tests/harnesses/` (subject to P-1). — copilot(developer:opus-4.7-xhigh)
- Deputy checklist grew item 12 to verify EI compliance on every run
  (`agents/deputy/persona.md`). — copilot(developer:opus-4.7-xhigh)
- **Prohibitions section** in the constitution, sitting between Core
  Principles and Knowledge Base. Negative rules (what agents MUST NOT
  do), numbered sequentially (P-1, P-2, ...) for precise citation by
  the deputy. Violations are hard merge blockers. — copilot(developer:opus-4.7-xhigh)
- **P-1: No real malicious data in tests, fixtures, or source.** First
  prohibition. Forbids committing functional attack payloads (prompt
  injection, XSS, SQLi, command injection, secret-extraction probes,
  etc.) into the repository — including tests, fixtures, docs, READMEs,
  and changelog entries. Synthetic placeholders are required; real
  payloads, when genuinely needed, MUST live in a gated adversarial
  corpus outside source control and be referenced by hash/ID. Includes
  a remediation requirement for already-committed violations (history
  rewrite + force-push, not just `HEAD` removal). The deputy's per-run
  checklist grew item 11 to scan for prohibition violations. — copilot(developer:opus-4.7-xhigh)
- Spec Kit scaffolding (`.specify/`, `.github/agents/`, `.github/prompts/`,
  `.vscode/settings.json`). — copilot(developer:opus-4.7-xhigh)
- Project Constitution v1.0.0 (`.specify/memory/constitution.md`) defining
  Single Execution Authority, Attributed Identity, Test-First, Traceability
  to Originating Input, Gated Agent Output, and Observable & Interruptible
  Orchestration. The constitution governs the development of this codebase;
  product roles, services, and tech stack are defined in feature specs. — copilot(developer:opus-4.7-xhigh)
- Knowledge-base scaffolding rules: `wiki/index.md`, `wiki/raw/`,
  `wiki/docs/`, and `wiki/bugs/` (the last for accumulated bug reports
  with confirmed fixes). — copilot(developer:opus-4.7-xhigh)
- **Deputy agent**: source-controlled persona at `agents/deputy/persona.md`,
  reports directory at `agents/deputy/reports/`, top-level
  `agents/README.md` explainer, and trigger-phrase recognition wired
  into `.github/copilot-instructions.md`. The deputy is the formal
  owner and enforcer of the constitution; invoke with
  `> Start the deputy agent workflow`. — copilot(developer:opus-4.7-xhigh)
- **Changelog attribution rule.** Principle II of the constitution now
  explicitly covers changelog entries, and the *Changelog discipline*
  bullet under *Development Workflow* requires every bullet to end
  with the canonical inline-trailer identity. The deputy enforces
  this on every run (checklist item 8). — copilot(developer:opus-4.7-xhigh)
- `README.md` describing project structure and the Spec Kit workflow. — copilot(developer:opus-4.7-xhigh)
- This `CHANGELOG.md`, following Keep a Changelog 1.1.0. — copilot(developer:opus-4.7-xhigh)

### Changed

- **Migrated `deputy` and `solid-snake` agents to the directive +
  persona + composition layout.** The legacy single-file
  `agents/deputy/persona.md` and `agents/solid-snake/persona.md` have
  been deleted; both agents now use the same three-part layout as
  GLaDOS-QA. The deputy directive is extracted to
  `agents/directives/deputy.md` (constitution enforcement, the twelve
  numbered checkpoints across Principles I–VI plus Wiki, Changelog,
  Secrets, Sync Impact, Prohibitions, and EI clauses, voice-agnostic).
  The SOLID directive is extracted to `agents/directives/solid.md`
  (the five SOLID object-oriented design principles, the
  `SOLID` / `NOT-SOLID` two-verdict surface, the PR review loop,
  voice-agnostic). New compositions live at `agents/deputy/agent.md`
  and `agents/solid-snake/agent.md`. The `agents/README.md`
  *Two layouts (both supported)* section is removed; the single
  three-part layout is now canonical. — copilot(developer:opus-4.7)
- **Added Andy Griffith and Barney Fife personas** under
  `agents/personas/` for interchangeability. The `deputy` composition
  is corrected to pair the deputy directive with the **Barney Fife**
  persona — in *The Andy Griffith Show* canon, Barney Fife is the
  Deputy and Andy Taylor is the Sheriff, so the legacy file's use of
  the Andy Griffith voice for the deputy role was a mis-cast. The
  Andy Griffith persona is preserved in this repository (with its
  casting note flagging that it is intended for a future
  sheriff-shaped directive, not the deputy directive). The directive
  / persona split makes either pairing a one-line change in the
  composition file. — copilot(developer:opus-4.7)
- **Added Solid Snake persona** under
  `agents/personas/solid-snake.md`. The `solid-snake` composition now
  pairs the SOLID directive with the Solid Snake codec-style
  tactical-reconnaissance register. The persona file explicitly
  carries a *no source-canon catchphrases* rule (no "Snake?", no
  "Colonel,", no "kept you waiting") to keep the homage tasteful and
  free of copyright-adjacent dialogue lifts. — copilot(developer:opus-4.7)
- **P-1 self-application carve-out** (resolves #6).Added a
  *Self-application exception* clause to P-1 in
  `.specify/memory/constitution.md`. The literal instruction-override
  probe that appears in P-1's own teaching prose and `❌` code example
  is now explicitly exempted from the P-1 prohibition, scoped strictly
  to the P-1 section of the constitution document. The exception does
  not extend to any other documentation, test, fixture, comment, or
  commit anywhere else in the repository, and drift outside that
  section is a P-1 violation in the normal way. Chosen as **Fix B**
  from the deputy's two-option recommendation in issue #6 (Fix A
  would have required a history rewrite + force-push to `main`).
  Trade-off acknowledged: prohibitions now admit a single,
  minimally-scoped self-application carve-out. — copilot(developer:opus-4.7)
- `.github/copilot-instructions.md` rewritten for clarity. Dropped the
  sub-agent-spawning procedural prose (deputy invocation is owned by
  the constitution, not by host-runtime instructions). New structure:
  constitution pointer with attribution reminder, "Spec Kit is the
  workflow" (non-negotiable adherence), "The wiki" (purpose and
  structure of the knowledge base), and a one-paragraph `agents/`
  pointer that defers to the constitution's Governance section for
  deputy details. — copilot(developer:opus-4.7-xhigh)
- Spec Kit branch & spec-directory naming switched from **sequential
  numbering** (`001-add-user-auth`) to **timestamp prefix**
  (`YYYYMMDD-HHMMSS-add-user-auth`). Parallel cloud agents no longer
  race for the next sequential number, and date-prefixed specs let us
  revisit old specs chronologically and re-assert their primary
  assumptions and goals over time. Affects `.specify/init-options.json`,
  `.specify/extensions/git/git-config.yml`,
  `.specify/extensions/git/config-template.yml`, and
  `.specify/extensions/git/extension.yml`. — copilot(developer:opus-4.7-xhigh)

[Unreleased]: https://github.com/jdylanmc/agent-arena/commits/main
[kac]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html
[constitution]: .specify/memory/constitution.md
