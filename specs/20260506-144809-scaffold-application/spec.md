# Feature Specification: Scaffold Initial Application

**Feature Branch**: `20260506-144809-scaffold-application`
**Created**: 2026-05-06
**Status**: Draft
**Originating Input**: GitHub issue [#4](https://github.com/jdylanmc/agent-arena/issues/4) — "SPEC: Scaffold Initial Application"
**Authoring Agent Attribution**: copilot(developer:opus-4.7-xhigh)

> **Scope reminder.** This spec stands up the *minimum viable foundation*: a VS Code extension named **Agent Arena** that integrates with the GitHub Copilot SDK and proves end-to-end that a user can send a prompt to a primary agent and receive a response inside VS Code. It is **explicitly not** the full Swarm UI from the mockups. Subsequent specs will build the Swarm sidebar, background agents, workflows, harness loaders, and so on. This is the keel.

## Constitutional Context (binding)

This feature is bound by the agent-arena Constitution (`.specify/memory/constitution.md`, v1.0.0).

- **Principle II — Agent Identity & Attribution**: All work is authored as `copilot(developer:opus-4.7-xhigh)`; CHANGELOG and PR carry that signature.
- **Principle III — Spec Kit Adherence**: This spec is the `/speckit.specify` artifact. `/speckit.plan` and `/speckit.tasks` follow in subsequent commits before implementation.
- **Principle IV — LLM Wiki as Knowledge Base**: This feature seeds the wiki with two ingestions (Copilot SDK, VS Code Extensions API).
- **Principle V — Explicit Prohibitions (Prohibition P-1)**: Tests use synthetic / fixture inputs only; no real malicious payloads anywhere in the test suite. (P-1 is a Prohibition, not Principle V — the binding lives at `constitution.md` *Prohibitions* section, not under Principle V.)
- **Principle VI — Full Agent Observability (Engineering Invariants EI-1, EI-2)**: All extension and SDK activity emits structured trace events to a stable schema, and extension state is loadable/unloadable as JSON harnesses. (EI-1 and EI-2 are Engineering Invariants, not Principle VI — the binding lives at `constitution.md` *Engineering Invariants* section.)

The Deputy agent will validate this PR against all of the above before merge.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First-message round-trip (Priority: P1)

A developer installs the Agent Arena `.vsix`, opens VS Code, signs in to GitHub Copilot, opens the **Agent Arena** view in the activity bar, types a prompt into the **primary agent** terminal, and receives a streamed response from the model. The exchange is recorded in the structured event log and a session is persisted to disk.

**Why this priority**: This is the entire point of the scaffold. Without this round-trip working, no subsequent feature can be built. It proves that the SDK is wired correctly, the webview can communicate with the extension host, the agent loop completes, observability is emitting, and session persistence functions.

**Independent Test**: Build the `.vsix`, install it in VS Code, sign in to Copilot, open the Agent Arena view, type "Reply with the single word: pong", press Enter, observe the word "pong" rendered in the terminal within 30 seconds, and verify a `session-state` directory has been written under the extension's storage URI containing an `events.jsonl` with the user prompt and model response.

**Acceptance Scenarios**:

1. **Given** a fresh VS Code workspace with the extension installed and the user signed in to Copilot, **When** the user opens the Agent Arena view and submits the prompt "Reply with: pong", **Then** the primary agent terminal renders streamed response chunks until the agent loop ends and the final response contains "pong".
2. **Given** an active Agent Arena session that has just completed a round-trip, **When** the user inspects the extension's structured trace log, **Then** the log contains, at minimum, `extension.activate`, `session.created`, `user.message`, `assistant.message_delta` (one or more), `assistant.message`, and `session.idle` events with monotonic timestamps and a stable `sessionId`.
3. **Given** the user has had at least one round-trip, **When** the user closes and reopens VS Code, **Then** the prior session is listed and resumable (using the SDK's session persistence on disk).

---

### User Story 2 — Yolo toggle and permission prompts (Priority: P2)

The primary agent honors the SDK's required `onPermissionRequest` handler. By default, **yolo mode is OFF**, and any tool the agent attempts to invoke (read file, edit file, run command, fetch URL, etc.) raises a permission prompt the user must approve. The terminal header in the webview shows a **yolo toggle** (icon: a robot doing a "dab"); flipping it on bypasses prompts for that agent only.

**Why this priority**: The SDK *requires* a permission handler. Shipping `approveAll` as the default would silently grant the agent filesystem and shell access on first install. Yolo-toggle is the user's chosen UX for trading safety for speed; the scaffold needs to prove the toggle wires through to the handler. Fine-grained per-tool control is **out of scope for this scaffold** (deferred to a future spec) but the architecture must allow it without rework.

**Independent Test**: With yolo OFF, instruct the agent to "create a file called scratch.txt in the workspace". Verify the user receives a permission prompt for the file write tool and that denying it results in the agent reporting the denial in its response. Flip the yolo toggle ON via the terminal header; repeat the same prompt; verify no permission prompt appears and the file is created.

**Acceptance Scenarios**:

1. **Given** yolo mode is OFF for the primary agent and the user submits a prompt that triggers a non-read-only tool call, **When** the agent invokes the tool, **Then** the user is prompted (via a VS Code modal or in-webview prompt) to allow or deny that specific tool invocation.
2. **Given** the user denies a permission prompt, **When** the agent loop continues, **Then** the agent's response acknowledges the denial and does not retry the same operation in the same turn.
3. **Given** the user toggles yolo ON via the dab-icon control in the terminal header, **When** the agent invokes any subsequent tool, **Then** no permission prompt is shown and the tool runs.
4. **Given** the user toggles yolo OFF again, **When** the agent invokes the next tool, **Then** the permission prompt returns.
5. **Given** yolo state has been changed, **When** VS Code reloads, **Then** yolo state for that agent persists (via extension state) and is restored OFF unless explicitly enabled.

---

### Edge Cases

- **User not signed in to Copilot**: Extension activates without errors; the terminal displays a non-modal sign-in prompt with a link to the Copilot sign-in flow; no session is created until sign-in completes.
- **SDK CLI binary fails to start** (missing platform binary, sandbox restriction): Extension surfaces a structured error event (`sdk.cli.start_failed`) and a user-visible error in the terminal with the underlying exit code/message; subsequent commands fail fast with a recoverable retry button.
- **Network or API outage during a session**: SDK emits an error event; webview renders the error inline in the conversation; the session remains resumable.
- **User submits a prompt while agent loop is still running**: The new prompt is *enqueued* (per SDK `mode: "enqueue"` semantics) and processed after the current turn completes; the UI shows a queued indicator.
- **User closes the Agent Arena view while a session is active**: The session continues running in the extension host until completion; reopening the view re-attaches and shows accumulated events.
- **Extension storage URI is read-only or full**: Extension surfaces a structured error and falls back to in-memory session state with a banner warning.
- **Extension is uninstalled**: VS Code clears the storage URI; persisted sessions are removed with the extension (acceptable; users were not promised long-term archival).
- **Workspace Trust restricted mode**: When the user opens a workspace as untrusted, VS Code denies the extension permission to register `commands` that mutate the workspace. The extension MUST still activate in restricted mode but skip command registration that requires trust, and the panel MUST render a banner explaining the restriction. The user resolves by accepting Workspace Trust for the folder.
- **Multi-account GitHub auth**: When the user has multiple authenticated identities (`gh CLI` with `--user`, OAuth + `GH_TOKEN`, etc.), the SDK's auth-priority order applies (`githubToken` constructor option → `GH_TOKEN`/`GITHUB_TOKEN` env → `gh CLI auth` → stored OAuth). The extension MUST surface the chosen `authType` + `login` in the panel banner so the user can confirm which identity is active before issuing prompts.
- **Permission prompt timeout / dismissal**: VS Code's `showInformationMessage(..., {modal: true}, "Allow", "Deny")` returns `undefined` if the user dismisses the modal (e.g., closes via Esc). The extension MUST treat `undefined` as **deny** as a safe default and emit `aa.permission.resolved.v1` with `decision: "deny"` and `reason: "modal_dismissed"`. There is no implicit timeout — the modal blocks until the user answers or dismisses.
- **Settings Sync interaction with yolo state**: Per CD-05, yolo state lives in `workspaceState` which is **never** synced. The extension MUST call `Memento.setKeysForSync([])` for the yolo namespace at activation time so any future change to VS Code's sync defaults cannot accidentally enable cross-machine sync.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Repository foundation

- **FR-001**: The repository MUST contain a buildable Node.js / TypeScript VS Code extension at the repo root (or under `extension/` if a monorepo layout is chosen during planning), packaged as a `.vsix` via `vsce`.
- **FR-002**: The extension MUST use TypeScript for all source, esbuild for the extension-host bundle, Vite + `@vitejs/plugin-react` + Tailwind CSS for the webview UI, vitest for unit tests, and `@vscode/test-electron` for integration tests.
- **FR-003**: The repository MUST contain a `LICENSE` file at the root with the MIT license, copyright "Dylan McCurry".
- **FR-004**: The extension's `package.json` MUST set `publisher` to `jdylanmc`, `name` to `agent-arena`, `displayName` to `Agent Arena`, `engines.vscode` to a current LTS-line version, and a semver `version` starting at `0.0.1`.

#### VS Code extension contract

- **FR-005**: The extension MUST register a `viewsContainers` entry in the activity bar titled "Agent Arena" with an icon (placeholder SVG acceptable for the scaffold).
- **FR-006**: The extension MUST register a `views` entry of type `webview` inside the Agent Arena view container, hosting the **primary agent terminal** view.
- **FR-007**: The extension MUST register a command `agent-arena.openPrimaryAgent` that focuses (and reveals if hidden) the primary agent terminal view.
- **FR-008**: The extension MUST declare modern command-based activation (no broad `onStartupFinished` activation) so it stays out of the way until the user invokes it.
- **FR-009**: The webview MUST communicate with the extension host via `postMessage` and `acquireVsCodeApi()` using the versioned envelope defined in **CD-04** (`{ protocol_version, message_id, correlation_id, session_id?, agent_id?, type, payload }`, runtime-validated on both sides, unknown `type` rejected and logged); the extension host MUST be the sole owner of the Copilot SDK client (the webview never imports `@github/copilot-sdk`). The `type` enumeration is owned by the extension host and documented at `wiki/docs/webview-protocol.md`.

#### Copilot SDK integration (the core round-trip)

- **FR-010**: The extension host MUST instantiate a single `CopilotClient` from `@github/copilot-sdk` per VS Code window and start it on first user invocation (lazy start), tearing it down on extension deactivate.
- **FR-011**: The extension MUST redirect the SDK's home directory via the `copilotHome` option to a path inside `context.globalStorageUri`, so the SDK's session-state files live under the extension's storage and not the user's `~/.copilot/`.
- **FR-012**: The extension MUST create sessions with `streaming: true` and subscribe to `assistant.message_delta` events to render token-level updates in the terminal as they arrive.
- **FR-013**: The extension MUST expose a default model selection of `gpt-5` via a VS Code setting `agentArena.primaryAgent.model`, configurable by the user; the model used for each session MUST be recorded in the session metadata.
- **FR-014**: The extension MUST authenticate with the user's existing Copilot credentials via the SDK's auto-detection (`useLoggedInUser` default behavior); when the user is not signed in, the extension MUST surface a friendly sign-in prompt and not throw an unhandled error.
- **FR-015**: A session, once created, MUST handle prompts submitted via `session.send({ prompt, mode: "enqueue" })` so back-to-back submissions are processed in order.

#### Permission handling and yolo toggle

- **FR-016**: The extension MUST register an `onPermissionRequest` handler on every session. When the agent's `yoloMode` is OFF, the handler MUST display the request to the user and only resolve `allow` on explicit user acceptance.
- **FR-017**: Each agent (in the scaffold, only the primary agent exists) MUST have a `yoloMode` boolean state, default OFF, persisted per **CD-05** in VS Code's `workspaceState` under the key `agentArena.yoloMode.<agentId>`, with Settings Sync explicitly disabled for these keys.
- **FR-018**: The terminal webview MUST render a yolo toggle in its header using a "robot dabbing" icon (placeholder SVG asset acceptable for the scaffold). The toggle MUST update the agent's `yoloMode` state immediately and the change MUST take effect on the next tool invocation without restarting the session.
- **FR-019**: The permission handler MUST be implemented in such a way that a future spec can replace the binary yolo/prompt logic with a fine-grained per-tool policy without changing the handler's call sites.

#### Observability — EI-1 binding

- **FR-020**: The extension MUST capture the SDK's OpenTelemetry telemetry and route it through the extension's telemetry adapter (per **CD-01**) into a single canonical JSONL log at `${context.logUri}/agent-arena.events.jsonl`. SDK event identifiers are adopted verbatim as the basis of the canonical `event` field with the `.v1` suffix appended; the original SDK payload is preserved verbatim under `payload.sdk`.
- **FR-021**: The extension MUST emit its own structured events to the same canonical log for events the SDK does not cover (per **CD-01**). New extension-only event identifiers use the `aa.` namespace and the `.v1` version suffix, including at minimum: `aa.extension.activate.v1`, `aa.extension.deactivate.v1`, `aa.webview.opened.v1`, `aa.webview.message.received.v1`, `aa.webview.message.rejected.v1`, `aa.permission.prompted.v1`, `aa.permission.resolved.v1`, `aa.yolo.toggled.v1`, `aa.harness.session.unrecoverable.v1`. Each event's envelope conforms to the canonical EI-1 schema (`ts`, `level`, `event`, `agent_id` (when attributable), `correlation_id`, and a typed `payload`).
- **FR-022**: The trace log path MUST be discoverable from the Command Palette via a command `agent-arena.showTraceLog` that opens the file in an editor.
- **FR-023**: The event-name catalog and payload schemas MUST be documented in `wiki/docs/log-schema.md` and that page MUST be linked from `wiki/index.md`.

#### Harness — EI-2 binding (skeleton only)

- **FR-024**: The extension MUST define an `AgentArenaHarness` JSON shape with `harness_version`, `agents[]` (each with `id`, `kind` (enumeration; the only valid value in the scaffold is `"primary"`), `yoloMode`), `activeSessionId` (or null), and `sessions[]` (per **CD-02**: each entry `{ session_id, agent_id, session_dir_path, content_hash, manifest: { files: [{ name, size, sha256 }] } }`). The schema MUST live in source as a TypeScript type and be documented at `wiki/docs/harness-schema.md`.
- **FR-025**: The extension MUST expose two commands `agent-arena.harness.export` and `agent-arena.harness.import` that round-trip the harness JSON to/from a file the user picks, restoring agent settings (yolo state) on import. Session message history is **not** part of the harness in the scaffold (the SDK's own session persistence covers that).
- **FR-026**: An empty harness fixture file MUST be checked into the repo at `extension/tests/harnesses/harness.empty.json` (per the constitutional default `tests/harnesses/` at `constitution.md:584-588`, scoped to the extension package) and used by at least one unit test that exercises import/export.

#### Wiki ingestion (Principle IV binding)

- **FR-027**: The wiki MUST contain a synthesis page `wiki/sources/copilot-sdk.md` summarizing the GitHub Copilot SDK (`github/copilot-sdk`) with at least: architecture overview, key APIs (`CopilotClient`, `Session`, `defineTool`, `onPermissionRequest`), authentication priority order, observability hooks, and known constraints.
- **FR-028**: The wiki MUST contain a synthesis page `wiki/sources/vscode-extensions-api.md` summarizing the VS Code Extensions API contribution points and runtime APIs relevant to building Agent Arena (commands, viewsContainers, views, webview, configuration, activation events).
- **FR-029**: Each ingestion MUST include 10–20 raw doc snapshots cached under `wiki/raw/copilot-sdk/` and `wiki/raw/vscode-extensions-api/` respectively, with each snapshot recording `source_url`, `fetched_at`, and `commit_sha` (where the source is a git repo).
- **FR-030**: Both synthesis pages MUST be cross-linked from `wiki/index.md` under appropriate categories.
- **FR-031**: The wiki MUST contain a glossary entry for "Bot Fight" (the original codename for what is now Agent Arena) noting it as a historical alias only.

#### Continuous integration

- **FR-032**: CI MUST run on `ubuntu-latest` and `windows-latest` (macOS deferred to a follow-up). Each job MUST install dependencies, lint (ESLint), type-check, run unit tests (vitest), run integration tests (`@vscode/test-electron`) where feasible, and produce the `.vsix` as a build artifact.
- **FR-033**: CI MUST NOT exercise the live Copilot SDK (no Copilot subscription token in CI). Unit and integration tests MUST exercise the SDK behind the test seam defined in **CD-03** — the SDK's own test harness if it ships one (verified during `/speckit.plan` via the `@github/copilot-sdk` wiki ingestion), otherwise an `SdkAdapter` interface with a `FakeSdkAdapter` substitute. The seam MUST demonstrably exercise streaming deltas, permission allow/deny, queued prompts, session resume/list, SDK startup failure, and SDK runtime error events. Live-SDK verification is a documented manual step in the README.
- **FR-034**: CI MUST fail the build on lint errors, type errors, test failures, or `vsce package` failures.

#### Documentation and project hygiene

- **FR-035**: `README.md` MUST document install, build, run, and **manual live-SDK verification** steps (sign in to Copilot, install `.vsix`, open Agent Arena, send "Reply: pong", expect "pong").
- **FR-036**: `CHANGELOG.md` MUST receive an attributed entry under `[Unreleased] / Added` for this feature, signed `copilot(developer:opus-4.7-xhigh)`.
- **FR-037**: The PR opened for this spec MUST be a Spec Kit draft PR linking issue #4, declaring conformance with Principles II–VI, and listing the wiki pages added.

### Key Entities

- **Agent** — A logical assistant configured with a model, a yolo state, and (in future specs) a custom system prompt and tool policy. The scaffold has exactly one: the **primary agent**.
- **Session** — An SDK session bound to one Agent, persisted on disk by the SDK at `${copilotHome}/session-state/<sessionId>/` (per R-05: a directory containing `checkpoints/*.json`, `plan.md`, `files/`, etc. — the SDK does not write a single per-session `events.jsonl`). Has lifecycle events `created → idle → resumed → idle → ... → ended`.
- **Harness** — A JSON document capturing extension-level state (`agents`, `activeSessionId`) suitable for export/import. Does **not** duplicate the SDK's own session log.
- **Trace Event** — A JSON-line emitted to the trace log, either by the SDK (via OpenTelemetry) or by the extension (via the structured event emitter). Stable schema.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A clean clone of the repo on `ubuntu-latest` and `windows-latest` runs `npm ci && npm run lint && npm run typecheck && npm test && npm run package` to green within 10 minutes per OS, producing a `.vsix` artifact.
- **SC-002**: A human verifier installs the `.vsix` in VS Code, signs in to Copilot, opens the Agent Arena view, and completes a round-trip with the prompt "Reply: pong" in under 60 seconds end-to-end (sign-in time excluded).
- **SC-003**: The trace log written during the verification round-trip contains every event listed in FR-021 plus the SDK's `session.created`, `user.message`, `assistant.message`, and `session.idle` events, in causal order.
- **SC-004**: With yolo OFF, asking the primary agent to write a file MUST produce exactly one permission prompt; toggling yolo ON and re-issuing the same instruction MUST produce zero permission prompts.
- **SC-005**: Closing and reopening VS Code MUST surface the prior session in a resumable state (whether or not the resume UX is built; the persisted directory MUST exist and be enumerable via the SDK).
- **SC-006**: The harness fixture `harness.empty.json` round-trips through export → modify → import, restoring `yoloMode` correctly, in a unit test.
- **SC-007**: `wiki/index.md` references both new ingestion synthesis pages, and each synthesis page is between 200 and 1500 words and links to at least 5 raw snapshots.
- **SC-008**: The Deputy agent's review of this PR finds no constitutional violations.

---

## Assumptions

- **Stack choices are locked at planning time.** TypeScript, esbuild, Vite + React + Tailwind, vitest, `@vscode/test-electron`, ESLint, npm. These were selected by the primary developer; the planning phase does not relitigate them.
- **Wiki ingestion depth is "medium"** (~10–20 raw snapshots per source plus a synthesis page), per the primary developer's choice.
- **The Copilot SDK is in Public Preview**; APIs may change. The scaffold pins to a specific version in `package.json` and the wiki synthesis page records the snapshot commit. A breaking SDK upgrade is a follow-up spec, not a scaffold concern.
- **CI does not have a Copilot subscription token.** Live-SDK exercise is a manual verification step in the README. CI mocks the SDK.
- **The bundled Copilot CLI binary** that `@github/copilot-sdk` ships is platform-specific via npm's standard optional-dependency mechanism. Verification on `windows-latest` and `ubuntu-latest` is part of FR-032; macOS is deferred.
- **Marketplace / Open VSX publishing is OUT OF SCOPE.** The scaffold ships a `.vsix` artifact for sideloading. Publishing the extension is a separate spec.
- **The Swarm sidebar UI** (primary + background agents grid, workflow panel) shown in the issue's mockups is OUT OF SCOPE. The scaffold ships only the primary agent terminal view as a placeholder webview. Subsequent specs build the Swarm.
- **MCP servers, custom tools beyond the SDK's built-ins, custom skills, custom agents** (per the SDK's `agents[]` config), and **infinite-session compaction** are OUT OF SCOPE for the scaffold.
- **Fine-grained per-tool permission policies** are OUT OF SCOPE; the scaffold ships only the binary yolo toggle. The permission-handler abstraction (FR-019) preserves the upgrade path.
- **Background agents** (the upper grid in the mockup) are OUT OF SCOPE.
- **The trace log file path** is per-window (each VS Code window has its own log). Aggregating across windows is OUT OF SCOPE.

---

## Out of Scope (explicit)

- The Swarm sidebar layout (primary + background agents grid + workflow panel)
- Background agents
- Workflow definitions and execution
- MCP servers
- Custom tools beyond what the SDK ships built-in
- Per-tool fine-grained permission policies (only binary yolo for the scaffold)
- Marketplace / Open VSX publishing
- macOS CI
- Live Copilot SDK exercise in CI
- Aggregating trace logs across multiple VS Code windows
- Long-term session archival beyond extension uninstall
- Theming and design polish beyond a functional placeholder

---

## Originating-input citation

GitHub issue [#4 — SPEC: Scaffold Initial Application](https://github.com/jdylanmc/agent-arena/issues/4), opened in the agent-arena repository. The mockups in that issue (Swarm primary, Swarm background, Workflow) describe the long-term product vision. This spec covers only the scaffold; subsequent specs will build the views shown in those mockups.

---

## Clarifying Decisions

A running, append-only log of clarifying questions raised during spec
review and the decisions made. Each entry records the question, the
chosen answer, and the FR(s) / scenario(s) the decision binds. New
entries land at the **top** so the most recent decision is visible
first.

> Format:
> **CD-NN — Short title** (chunk #, date)
> *Question:* …
> *Decision:* …
> *Binds:* FR-xxx, SC-xxx, US-x scenario y

**CD-10 — Seamless extension of VS Code (binding visual + interaction discipline)** (chunk #2, 2026-05-07)
*Question:* Agent Arena lives inside VS Code; users open it alongside Explorer, Source Control, Search, and the integrated Terminal. Without an explicit binding rule, the extension's React shell can drift visually and interactively from VS Code's native chrome — different colors when the user toggles theme, custom icons that don't match the codicon set, non-standard keybindings, missing Command Palette entries. The user has identified visual fidelity as a first-class requirement: *"This plugin needs to feel like a 'seamless extension of vscode'."*  Should this be encoded as a binding mandate?
*Decision:* **Yes — Agent Arena MUST present as a seamless extension of VS Code, in five binding dimensions:**
1. **Theme tokens, not hex.** Every color in the React shell MUST resolve through VS Code's `var(--vscode-<token>)` CSS variables (e.g. `var(--vscode-editor-background)`, `var(--vscode-sideBar-background)`, `var(--vscode-terminal-foreground)`). Hardcoded hex values are a CD-10 violation. The webview iframe injects these variables automatically, and they update in place when the user toggles theme — so Agent Arena follows light/dark/high-contrast switches without a reload. Catalog: `wiki/sources/vscode-source.md` §1.
2. **Codicons, not bespoke SVGs.** All chrome icons MUST come from the `@vscode/codicons` font (gear, send, search, comment-discussion, etc.). Bespoke SVGs are permitted only for branding (the `A` activity-bar mark, agent avatars). Catalog: `https://microsoft.github.io/vscode-codicons/`.
3. **Command bus.** Every user action with an addressable trigger MUST be exposed as a `vscode.commands.registerCommand(...)` entry declared in `package.json` `contributes.commands`. This makes actions Command-Palette-able, keybindable, and integration-testable. Direct DOM-bound function calls without a command-bus hop are a CD-10 violation.
4. **Activity-bar idiom.** The Activity Bar `A` icon is the **sole** primary entry point. Clicking it MUST drop the user directly into the WebviewPanel — no intermediate sidebar TreeView, no welcome markdown, no "Open Primary Agent Panel" button. The TreeView exists solely to anchor the icon and forwards visibility events into `agent-arena.openPrimaryAgent`. (This decision rescinds the `viewsWelcome` markdown the scaffold initially shipped with.)
5. **Disposable lifecycle.** All long-lived subscriptions (event handlers, status-bar items, panels, sessions) MUST be `vscode.Disposable` instances pushed into `context.subscriptions` or held by an explicit `Disposable[]` field on the owning class. Anonymous closure-bound listeners that survive past their owner are a CD-10 violation.

**Token discipline applies inside the xterm Theme too**: the color palette currently hardcoded in `XtermTerminal.tsx` MUST migrate to read VS Code's `terminal.background` / `terminal.foreground` / `terminal.ansi*` tokens via `getComputedStyle(document.documentElement).getPropertyValue("--vscode-terminal-...")`. The migration is part of the CD-10 binding, not deferred.

**Library discipline**: where VS Code itself uses a library (xterm.js, zod), Agent Arena uses the same library. Substituting equivalents is a CD-10 violation unless a follow-up CD documents the rationale (e.g. React vs. VS Code's hand-rolled DOM is an exception that's already accepted in CD-08; future deviations need the same explicit carve-out).

**Why "binding"**: every CD-10 violation is fixed at PR review by the deputy (Principle V — *Gated Agent Output*). The deputy MUST flag any of: hardcoded colors in `webview-src/`, bespoke SVGs masquerading as chrome icons, user actions without a `package.json` command entry, sidebar TreeView welcomes, and undisposed subscriptions.
*Binds:* FR-006, FR-007, FR-018, CD-07, CD-08. **Drops** the `viewsWelcome` contribution from the previous CD-08 §3 ("clicking it shows a button that creates/reveals the panel") — the panel opens on activity-bar click without intermediate UI. Mandates ongoing migration work in the existing scaffold (hardcoded hex → VS Code tokens; bespoke SVGs → codicons). The Copilot integration patterns documented at [`wiki/sources/vscode-copilot.md`](../../wiki/sources/vscode-copilot.md) inform how the SDK adapter, telemetry, and command surfaces should be wired to feel native.

**CD-09 — EI-2 harness unload semantics for SDK session directories** (chunk #2, 2026-05-06)
*Question:* CD-02 introduced reference-by-manifest for the harness's `sessions[]`, with `loadHarness` validating each file's `sha256` against the manifest. EI-2 (`constitution.md:524-552`) requires that "load harness A → unload → load harness B in the same process" leaves no residual state from A. CD-02 didn't specify what `unload` does to the SDK session directory referenced by harness A's manifest. Without a rule, harness A's session files would still be on disk when harness B loads, contaminating the round-trip.
*Decision:* **Three-state unload protocol with explicit residency.**
1. **`loadHarness(harness)`** copies (or symlinks, on platforms that support it) the referenced session directories from `${session_dir_path}` (relative to `copilotHome`) into a per-harness *residency root* at `${context.globalStorageUri}/harnesses/<harness_id>/sessions/`. The SDK's `copilotHome` is then redirected to this residency root for the duration of the harness's lifetime. The harness's manifest hash is verified against the residency contents on every `loadHarness` call.
2. **`unloadHarness()`** stops the in-flight CopilotClient (cleanly drains in-progress sessions), tears down the residency root via recursive `vscode.workspace.fs.delete(..., { recursive: true, useTrash: false })`, and emits `aa.harness.unloaded.v1` with `payload: { harness_id, residency_root_deleted: true }`. After unload, the SDK is in a "no harness" state — `loadHarness` MUST be called again before any session activity resumes.
3. **`load(B)` after `load(A) → unload`** starts a fresh CopilotClient against B's residency root. Harness A's residency root MUST be absent on disk; if it isn't (e.g., previous unload was killed mid-tear-down), `loadHarness` MUST emit `aa.harness.residency.orphaned.v1` and either delete the orphan or refuse to load (configurable via `agentArena.harness.orphanPolicy: "delete" | "refuse"`, default `"delete"`).

This makes EI-2 round-trippability deterministic: `harness_a.json + load + use + unload + harness_b.json + load` produces a session-state world identical to `fresh process + harness_b.json + load`. The harness JSON itself remains the only durable record between sessions; on-disk SDK state is residency-bound and torn down on unload.
*Binds:* FR-024, FR-025, FR-026 (extends), SC-006. Resolves the deputy's outstanding ⚠ from `agents/deputy/reports/20260506-164205-deputy-report.md` ("CD-02 does not yet specify the `unload` semantics for the SDK session directory").

**CD-08 — Primary agent UI shell snaps to `prototype/swarm-primary.png`** (chunk #2, 2026-05-06)
*Question:* CD-07 fixed the **surface** (WebviewPanel + xterm.js inside a React shell) but left the React shell's *layout* unspecified. The repository contains an authored prototype at `prototype/swarm-primary.png` that defines the visible-app contract: top header + tabs + left agent sidebar + per-agent header + center terminal + bottom command input. Should the scaffold spec snap the React shell to that prototype, even though several of its pieces (background agents, multi-agent routing, "+ New Agent") only become functional in future specs?
*Decision:* **Yes — the React shell snaps to `prototype/swarm-primary.png` for the primary-agent surface; future-spec features are visually scoped out (not rendered as disabled stubs that imply unfinished work). Concretely:**
1. **Top header**: "Agent Arena" branding on the left (using `agent-arena` 'A' icon to match the activity-bar entry). The "+ New Agent" CTA from the prototype is **not rendered** in this scaffold (multi-agent creation is a future spec); when that spec lands it goes here.
2. **Tabs row**: `Swarm | Workflow`, with `Swarm` active and selected. The `Workflow` tab is rendered as a tab but its content is a stubbed placeholder ("Workflow editor lands in a future spec.") — present so the visual contract is locked, inert so users don't get a half-finished feature.
3. **Left sidebar**: a single `PRIMARY AGENT` section with one entry — the primary agent. Each entry shows: an avatar circle (placeholder SVG acceptable), the agent's display name (`Main Developer` or the configured name), a status line (`Running` / `Idle` / `Error`), and a colored status dot. The selected entry is visually highlighted (left-edge accent, slight background tint, right-side chevron). The `BACKGROUND AGENTS` section from the prototype is **not rendered** in this scaffold (background agents are a future spec); when that spec lands it goes below `PRIMARY AGENT`.
4. **Per-agent header**: above the terminal area — agent avatar + `>_  <agent-name>` + `Running` status text + a settings gear icon on the right (the gear is non-functional in this scaffold; clicking emits `aa.command.executed.v1` with `{ command: "agent-arena.agentSettings.placeholder" }`).
5. **Terminal area**: the existing xterm.js renderer from CD-07. The terminal continues to handle its own banner, prompt, and slash-command echo; the React shell does NOT render those above the xterm anymore (the per-agent header subsumes the role of identifying which agent is in view). The cwd line that was previously in the xterm banner moves up into the per-agent header sub-line.
6. **Bottom command input**: a separate React-rendered `<input>` row docked at the bottom of the panel, with a placeholder (`Type a command…`), a paper-airplane send button, and submit-on-Enter. **Both** the bottom input AND direct typing into the xterm submit prompts via the same code path — the bottom input is a convenience surface for users who prefer a dedicated text field; the xterm continues to accept direct keystrokes for users who want a terminal feel. Both routes flow through `TerminalController.submitOrSlash`.
7. **Color/typography**: matches the VS Code dark theme (background `#1e1e1e`, foreground `#d4d4d4`, accents `#0dbc79` green / `#cd3131` red / `#11a8cd` cyan / `#bc3fbc` magenta). Font: `'Cascadia Code', Consolas, monospace`. Tabs use VS Code's standard active-tab underline.
8. **Visual-fidelity binding**: `prototype/swarm-primary.png` is the binding visual reference for the primary-agent surface. Future specs that change this layout MUST update `prototype/swarm-primary.png` (or replace it with a successor file) AND amend or supersede CD-08.
*Binds:* FR-006 (further specifies the WebviewPanel's React shell layout, supplementing CD-07), FR-007 (the per-agent header's gear surfaces a future-spec settings command). **Does not change** the post-message protocol from CD-04 or the SDK boundary from CD-03. **Does not introduce** any background-agent or multi-agent functionality — that's reserved for a future spec.

**CD-07 — Primary agent surface: WebviewPanel + bespoke xterm.js terminal (supersedes CD-06)** (chunk #2, 2026-05-06)
*Question:* CD-06 routed the primary agent through a VS Code `Pseudoterminal` rendered in the integrated Terminal panel to avoid building a bespoke terminal. Two follow-on requirements have surfaced that the Pseudoterminal cannot meet: (1) the Terminal-panel surface is too narrow for the planned customizations in subsequent specs (background-agent grid, harness inspector, multi-agent orchestration controls); (2) future specs will need fine-grained control over the rendering, layout, and interaction model of the agent transcript that VS Code's terminal panel does not expose (no in-line custom UI, no DOM access, no React composition). Should we revert to a webview-based surface, and if so, what is the binding contract?
*Decision:* **Yes. Revert to a webview-based primary agent surface — `vscode.window.createWebviewPanel` opened in the editor area (not the sidebar, not the bottom panel), with an embedded `@xterm/xterm` renderer inside a React shell.** Concretely:
1. **Surface = WebviewPanel in the editor area.** The extension calls `vscode.window.createWebviewPanel("agent-arena.primaryAgent", "Agent Arena · Primary Agent", { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri/dist/webview] })`. The panel opens as a standard editor tab — the user can split it, maximize it, drag it between editor groups, and pin it. `retainContextWhenHidden: true` preserves the DOM and xterm.js scrollback when the user switches to another editor tab and back.
2. **Renderer = `@xterm/xterm` + `@xterm/addon-fit` inside a React shell.** xterm.js handles the terminal-emulator concerns — ANSI/CSI parsing, scrollback, copy/paste, link/URL detection, font-size controls, accessibility — that are non-trivial to reimplement. The React shell wraps it with our banner, status indicators, and (in future specs) auxiliary panes. xterm.js is the *renderer*, not the surface contract; we own the post-message envelope, slash-command parsing, input-history navigation, and prompt/banner content.
3. **Activity-bar entry stays + auto-opens on first activation.** The `agentArenaPrimaryView` TreeView welcome remains as the auxiliary entry (clicking it shows a button that creates/reveals the panel). On first extension activation in a session, the panel auto-opens beside the welcome page. Subsequent activations do NOT auto-open (so the user can dismiss and re-open via the activity bar or Command Palette).
4. **CSP MUST be set** on the webview HTML (`Content-Security-Policy: default-src 'none'; script-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; img-src ${cspSource} https: data:`). The previous "webview created without CSP" warning that triggered the original Pseudoterminal pivot was a misdiagnosis — the warning was caused by a missing CSP, not by the webview surface itself. CSP is mandatory and the webview HTML template asserts it on every render.
5. **Pseudoterminal implementation is removed.** `src/terminal/PrimaryAgentTerminal.ts` is replaced by `src/panel/PrimaryAgentPanel.ts`. The webview ↔ host envelope contract from CD-04 is the sole communication channel. Slash-command handling moves into the React shell (since that's where input is captured); the canonical event log still receives every interaction. The status-bar yolo item from CD-05 remains (it's surface-independent).
6. **Permission prompts continue to use `vscode.window.showInformationMessage(..., {modal:true}, ...)`.** That decision is independent of the surface and was correct on its merits; it stays.
*Binds:* FR-005 (activity-bar entry hosts a TreeView welcome AND triggers the WebviewPanel; auto-opens the panel on first activation), FR-006 (rewrites the contract back — WebviewPanel + xterm.js, NOT Pseudoterminal, NOT WebviewView in the sidebar), FR-009 (the postMessage envelope from CD-04 is now the ONLY communication path between host and primary agent UI), FR-018 (yolo toggle: status bar item + an in-panel control rendered in the React shell), FR-019 (default `PromptUserPolicy` implementation: VS Code modal — unchanged from CD-06). **Supersedes CD-06.** Tasks T035 (production CopilotSdkAdapter) is unaffected. Tasks T056 (TreeView placeholder), T058 (extension wiring), T060–T064 (UI surface) are re-scoped onto the WebviewPanel; specifically, the in-flight work in `src/terminal/PrimaryAgentTerminal.ts` is replaced by `src/panel/PrimaryAgentPanel.ts` + a refreshed React surface in `webview-src/` that hosts xterm.js. The webview infrastructure (`webview-src/`, `vite.config.ts`, `tsconfig.webview.json`) — which CD-06 had set aside for "future Swarm UI specs" — is reactivated in this scaffold. Carries forward the lessons of CD-06: native terminal affordances (ANSI, history, copy/paste) MUST be available; we get them from xterm.js rather than VS Code's terminal panel.

**CD-06 — Primary agent terminal architecture: VS Code Pseudoterminal** (chunk #2, 2026-05-06) *(SUPERSEDED by CD-07; retained for traceability)*
*Question:* The original FR-006 specified a custom webview view for the primary agent terminal. Building a bespoke terminal duplicates xterm.js features VS Code already provides (monospace fonts, ANSI parsing, copy/paste, find, scrolling, font-size controls). Should we leverage VS Code's terminal integration instead?
*Decision:* **Yes. The primary agent runs inside a VS Code `Pseudoterminal` rendered in the integrated Terminal panel.** The extension implements `vscode.Pseudoterminal` (`onDidWrite` / `handleInput` / `open` / `close`), captures user input keystroke-by-keystroke, manages an input buffer + ANSI prompt rendering, and writes assistant streaming chunks back via `onDidWrite`. Slash commands (`/help`, `/yolo on|off`, `/clear`) are handled locally and never sent to the agent. The activity-bar `agentArenaPrimaryView` becomes a **TreeView placeholder** with a `viewsWelcome` markdown link to `agent-arena.openPrimaryAgent` (which creates + shows the Pseudoterminal). Yolo state surfaces as a **VS Code status bar item** (per CD-05) instead of a webview-rendered toggle, and as a `/yolo` slash command in the terminal — both flow through the same `YoloStore` so all surfaces stay in sync. Permission prompts use **VS Code's native modal dialogs** (`vscode.window.showInformationMessage(...,{modal:true},"Allow","Deny")`) instead of webview-rendered prompts. *Side benefit*: the FR-006 webview view no longer exists, so the "webview created without CSP" warning that VS Code emits on webview construction goes away naturally.
*Binds:* FR-005 (activity-bar entry now hosts a TreeView, not a webview), FR-006 (rewrites the contract — Pseudoterminal, not webview), FR-018 (yolo toggle: status bar item + `/yolo` command, not a dab icon in the terminal header), FR-019 (default `PromptUserPolicy` implementation: VS Code modal). The contracts/permission-policy.ts interface is unchanged — only the default implementation surface moves from the webview to VS Code's native dialog. Supersedes the webview-UI tasks T060–T064 (those are now terminal/status-bar tasks; the underlying UX requirements are met by the Pseudoterminal). The webview infrastructure (`webview-src/`, `vite.config.ts`, `tsconfig.webview.json`) **remains** in the repo for future Swarm UI specs (background agents grid, workflow panel) but is no longer wired into the primary agent surface in this scaffold.

**CD-05 — Yolo toggle persistence scope** (chunk #1, 2026-05-06)
*Question:* FR-017 says yolo state is "persisted via VS Code's extension state" but does not specify scope. Workspace, window, user, settings-synced?
*Decision:* **Per-workspace, per-agent, NOT synced across machines.** Yolo state is stored in VS Code's `workspaceState` (`Memento`) under a per-agent key `agentArena.yoloMode.<agentId>`. Settings Sync MUST be explicitly disabled for these keys. Default is OFF on every fresh workspace open; if state was ON in the prior session, the webview MUST render a one-time banner indicating yolo was restored to ON before the user submits the next prompt. Multi-window with the same workspace open shares state via VS Code's `workspaceState` semantics.
*Binds:* FR-017, FR-018, US-2 acceptance scenarios 3, 4, 5.

**CD-04 — Webview ↔ extension-host protocol envelope** (chunk #1, 2026-05-06)
*Question:* FR-009 specifies the transport (`postMessage` + `acquireVsCodeApi`) but not the protocol envelope. Two engineers would build incompatibly.
*Decision:* **Versioned envelope.** Every message in either direction MUST conform to `{ protocol_version: 1, message_id: uuid (v4), correlation_id: uuid (v4), session_id?: string, agent_id?: string, type: string, payload: object }`. Both sides MUST validate the envelope at runtime (using `zod` or an equivalent runtime schema). Unknown `type` values MUST be rejected and an `aa.webview.message.rejected.v1` event emitted (per CD-01). The `correlation_id` MUST be propagated into every EI-1 event emitted as a downstream consequence of the message. The `type` enumeration is owned by the extension host and documented at `wiki/docs/webview-protocol.md`.
*Binds:* FR-009, FR-021.

**CD-03 — CI test seam for the SDK** (chunk #1, 2026-05-06)
*Question:* FR-033 mandates that CI mock `CopilotClient` and `Session` but doesn't specify how. Risk of vacuous green CI.
*Decision:* **SDK-test-harness-first, fall back to adapter + fake.** `/speckit.plan` MUST first ingest `@github/copilot-sdk` (per FR-027) to determine whether the SDK ships a test harness, mock, or fixtures package. If yes: adopt them as the test seam. If no: introduce an `SdkAdapter` interface that the extension host always imports; `CopilotClient` lives only behind the adapter; tests substitute a `FakeSdkAdapter`. Either way, the test seam MUST demonstrably exercise: streaming deltas (`assistant.message_delta`), permission request allow + deny paths, prompt queueing under `mode: "enqueue"`, session resume / list, SDK startup failure, and SDK runtime error events. The chosen approach and the demonstrated behavioral surface MUST be recorded in `plan.md` before `tasks.md` is generated.
*Binds:* FR-033, SC-001 (CI green budget). Constrains the test seam for FR-010, FR-012, FR-014, FR-015, FR-016.

**CD-02 — EI-2 harness scope: include SDK session state by reference** (chunk #1, 2026-05-06)
*Question:* FR-024 excludes session message history from the harness "because the SDK persists it." Per EI-2 (`constitution.md:524-552`, "round-trippable"), that's a state leak.
*Decision:* **Reference-by-manifest.** The `AgentArenaHarness` shape grows a top-level `sessions[]` field. Each entry is `{ session_id: string, agent_id: string, session_dir_path: string (relative to copilotHome), content_hash: string (sha256 of the canonical concatenation of session files), manifest: { files: [{ name, size, sha256 }] } }`. `saveHarness` MUST snapshot the manifest and compute the content hash at save time. `loadHarness` MUST validate the path exists and that each file's sha256 matches the manifest entry; if validation fails, the session entry MUST be marked `state: "unrecoverable"` in the loaded harness and an `aa.harness.session.unrecoverable.v1` event MUST be emitted (per CD-01). The SDK remains the system of record for session content; the harness is the source of truth for which sessions belong to a saved scenario.
*Binds:* FR-024, FR-025, FR-026, SC-006. Resolves the EI-2 contradiction noted in the PR #5 conformance posture.

**CD-01 — EI-1 telemetry: snap to SDK names, single canonical log** (chunk #1, 2026-05-06)
*Question:* The constitution mandates a single canonical envelope (`ts` / `level` / `event` namespaced+versioned / `agent_id` / `correlation_id` / `payload`). The Copilot SDK ships its own OpenTelemetry stream with its own shape. How should these reconcile?
*Decision:* **Single canonical log; SDK-name-first; envelope normalization at the adapter.** All events — both SDK-originated and extension-originated — emit to one canonical JSONL file at `${context.logUri}/agent-arena.events.jsonl` and conform to the canonical envelope mandated by EI-1 (`ts`, `level`, `event`, `agent_id`, `correlation_id`, `payload`). Event identifiers (`event` field) snap to the SDK's existing names verbatim where the SDK already names the event (e.g. an SDK `session.created` becomes `event: "copilot.session.created.v1"`); the `.v1` suffix is appended to honor EI-1's "MUST be namespaced and versioned" requirement and signals the extension's stability commitment to that identifier — if the SDK changes an event name in v2, the extension catalog adds a `.v2` entry alongside with deprecation discipline per Keep a Changelog. New extension-only events that have no SDK counterpart use the `aa.` namespace (e.g. `aa.yolo.toggled.v1`, `aa.webview.opened.v1`, `aa.permission.prompted.v1`). Where the SDK telemetry payload shape differs from `payload`, the extension's telemetry adapter normalizes it into the canonical envelope on emission and preserves the original SDK payload verbatim under `payload.sdk`.
*Binds:* FR-020, FR-021, FR-022, FR-023, SC-003. Resolves the EI-1 contradiction noted in the PR #5 conformance posture.

<!-- Decisions will be appended above this line as the spec is reviewed. -->

