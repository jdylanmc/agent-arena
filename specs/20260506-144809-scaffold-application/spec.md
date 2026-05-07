# Feature Specification: Scaffold Initial Application

**Feature Branch**: `20260506-144809-scaffold-application`
**Created**: 2026-05-06
**Status**: Draft
**Originating Input**: GitHub issue [#4](https://github.com/jdylanmc/agent-arena/issues/4) — "SPEC: Scaffold Initial Application"
**Authoring Agent Attribution**: copilot(developer:opus-4.7-xhigh)

> **Scope reminder.** This spec stands up the *minimum viable foundation*: a VS Code extension named **Agent Arena** that integrates with the GitHub Copilot SDK and proves end-to-end that a user can send a prompt to a primary agent and receive a response inside VS Code. It is **explicitly not** the full Swarm UI from the mockups. Subsequent specs will build the Swarm sidebar, background agents, workflows, harness loaders, and so on. This is the keel.

## Constitutional Context (binding)

This feature is bound by the agent-arena Constitution (`.specify/memory/constitution.md`, v1.0.0).

- **Principle II — Agent Identity & Attribution**: All work is authored under the canonical `<provider>(<role>:<model>)` identity; CHANGELOG and PR carry that signature.
- **Principle III — Spec Kit Adherence**: This spec is the `/speckit.specify` artifact. `/speckit.plan` and `/speckit.tasks` follow in subsequent commits before implementation.
- **Principle V — Explicit Prohibitions (P-1)**: Tests use synthetic / fixture inputs only; no real malicious payloads anywhere in the test suite.

> *Note on Principle IV (Wiki) and Principle VI / EI-1 / EI-2*: per the user direction encoded in CD-12, this scaffold scopes wiki upkeep as a context-building tool for the implementing agent (not a product binding) and defers the SDK telemetry pipeline + harness round-trip + token-discipline migration to follow-up specs. The Deputy will see the deferrals as explicit scope decisions, not violations.

The Deputy agent will validate this PR against the constitutional principles in scope.

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

- **FR-005**: The extension MUST register a `viewsContainers` entry in the activity bar titled "Agent Arena" with an icon. The container MUST host a populated `agentArenaPrimaryView` TreeView that lists every navigable destination (currently one entry: the primary agent — *Main Developer*). Per CD-11, each TreeView row carries an avatar, display name, status dot (green=running / gray=idle / yellow=connecting / red=error), and short activity label. Clicking a row reveals or creates the corresponding WebviewPanel.
- **FR-006**: The primary agent MUST surface as a `vscode.WebviewPanel` opened in the editor area (per CD-07), not as a `views[]` entry of type `webview`. The Activity-Bar TreeView is the navigation surface; the WebviewPanel is the agent's window. Closing the panel does not dispose the agent (per CD-11 §6); re-opening replays the in-flight transcript.
- **FR-007**: The extension MUST register a command `agent-arena.openAgent` that takes an agent id and opens (or reveals) the corresponding panel. `agent-arena.openPrimaryAgent` is preserved as sugar for `agent-arena.openAgent("primary")` for backwards compatibility with the Command Palette + tests.
- **FR-008**: The extension MUST declare modern command-based activation (no broad `onStartupFinished` activation) so it stays out of the way until the user invokes it.
- **FR-009**: The webview MUST communicate with the extension host via `postMessage` and `acquireVsCodeApi()` using the versioned envelope defined in **CD-04** (`{ protocol_version, message_id, correlation_id, session_id?, agent_id?, type, payload }`, runtime-validated on both sides, unknown `type` rejected and logged); the extension host MUST be the sole owner of the Copilot SDK client (the webview never imports `@github/copilot-sdk`). The `type` enumeration is owned by the extension host and documented at `wiki/docs/webview-protocol.md`.

#### Copilot SDK integration (the core round-trip)

- **FR-010**: The extension host MUST instantiate a single `CopilotClient` from `@github/copilot-sdk` per VS Code window and start it on first user invocation (lazy start), tearing it down on extension deactivate.
- **FR-011**: The extension MUST redirect the SDK's home directory via the `copilotHome` option to a path inside `context.globalStorageUri`, so the SDK's session-state files live under the extension's storage and not the user's `~/.copilot/`.
- **FR-012**: The extension MUST create sessions with `streaming: true` and subscribe to `assistant.message_delta` events to render token-level updates in the terminal as they arrive.
- **FR-013**: The extension MUST expose a default model selection via a VS Code setting `agentArena.primaryAgent.model`, configurable by the user. The default value ships with the package (`gpt-5.2-codex` at time of writing — the chosen default may change as the SDK's model catalog evolves; the FR does not pin a specific identifier). The model used for each session MUST be recorded in the session metadata.
- **FR-014**: The extension MUST authenticate with the user's existing Copilot credentials via the SDK's auto-detection (`useLoggedInUser` default behavior); when the user is not signed in, the extension MUST surface a friendly sign-in prompt and not throw an unhandled error.
- **FR-015**: A session, once created, MUST handle prompts submitted via `session.send({ prompt, mode: "enqueue" })` so back-to-back submissions are processed in order.

#### Permission handling and yolo toggle

- **FR-016**: The extension MUST register an `onPermissionRequest` handler on every session. When the agent's `yoloMode` is OFF, the handler MUST display the request to the user and only resolve `allow` on explicit user acceptance.
- **FR-017**: Each agent (in the scaffold, only the primary agent exists) MUST have a `yoloMode` boolean state, default OFF, persisted per **CD-05** in VS Code's `workspaceState` under the key `agentArena.yoloMode.<agentId>`, with Settings Sync explicitly disabled for these keys.
- **FR-018**: The extension MUST expose a yolo toggle that immediately updates the agent's `yoloMode` state — change MUST take effect on the next tool invocation without restarting the session. Surface for this scaffold is the **VS Code status-bar item + `/yolo` slash command** (per CD-05 / CD-07 / CD-10 / CD-11). An in-panel UI affordance is reserved for a future spec.
- **FR-019**: The permission handler MUST be implemented in such a way that a future spec can replace the binary yolo/prompt logic with a fine-grained per-tool policy without changing the handler's call sites.

#### Observability — extension events

- **FR-021**: The extension MUST emit its own structured events to a single canonical JSONL log at `${context.logUri}/agent-arena.events.jsonl` (per **CD-01**). New extension-only event identifiers use the `aa.` namespace and the `.v1` version suffix, including at minimum: `aa.extension.activate.v1`, `aa.extension.deactivate.v1`, `aa.webview.opened.v1`, `aa.webview.message.received.v1`, `aa.webview.message.rejected.v1`, `aa.permission.prompted.v1`, `aa.permission.resolved.v1`, `aa.yolo.toggled.v1`. Each event's envelope conforms to the canonical EI-1 schema (`ts`, `level`, `event`, `agent_id` (when attributable), `correlation_id`, and a typed `payload`).
- **FR-022**: The trace log path MUST be discoverable from the Command Palette via a command `agent-arena.showTraceLog` that opens the file in an editor.

> *Deferred to a follow-up spec*: the SDK telemetry-pipeline integration (originally FR-020 / FR-023 / SC-003) — capturing the SDK's OpenTelemetry stream and routing it through the canonical envelope, plus the wiki/docs/log-schema.md mirror. The extension's own EI-1 events ship and are sufficient for this scaffold's diagnostics.

#### Continuous integration

- **FR-032**: CI MUST run on `ubuntu-latest` and `windows-latest` (macOS deferred to a follow-up). Each job MUST install dependencies, lint (ESLint), type-check, run unit tests (vitest), run integration tests (`@vscode/test-cli`) where feasible, and produce the `.vsix` as a build artifact.
- **FR-033**: CI MUST NOT exercise the live Copilot SDK (no Copilot subscription token in CI). Unit and integration tests MUST exercise the SDK behind the test seam defined in **CD-03** — an `SdkAdapter` interface with a `FakeSdkAdapter` substitute. The seam MUST demonstrably exercise streaming deltas, permission allow/deny, queued prompts, session resume/list, SDK startup failure, and SDK runtime error events. Live-SDK verification is a documented manual step in the README.
- **FR-034**: CI MUST fail the build on lint errors, type errors, test failures, or `vsce package` failures.

#### Documentation and project hygiene

- **FR-035**: `README.md` MUST document install, build, run, and **manual live-SDK verification** steps (sign in to Copilot, install `.vsix`, open Agent Arena, send "Reply: pong", expect "pong").
- **FR-036**: `CHANGELOG.md` MUST receive an attributed entry under `[Unreleased] / Added` for this feature, signed under the canonical Principle II identity.
- **FR-037**: The PR opened for this spec MUST be a Spec Kit draft PR linking issue #4 and declaring conformance with the constitution.

> *Deferred to a follow-up spec*: the EI-2 harness round-trip (originally FR-024 / FR-025 / FR-026 / SC-006). The `Agent` runtime, registry, and per-agent SDK session lifecycles ship in this scaffold; the export/import-as-JSON discipline is a separate engineering effort that the harness-aware tests gate. Likewise the wiki ingestion bindings (originally FR-027–031 / SC-007) are not product requirements — wiki upkeep is a context-building tool for the implementing agent, not a deliverable of this spec.

### Key Entities

- **Agent** — A persistent runtime object (per **CD-11**) that owns one SDK session, its in-flight turn id, a transcript buffer, yolo state, cwd, and the adapter binding. Survives panel close/reopen. The scaffold has exactly one: the **primary agent**.
- **AgentRegistry** — `Map<agentId, Agent>` owned by the extension host (per **CD-11**); the TreeDataProvider reads from it.
- **AgentPanel** — A `vscode.WebviewPanel` rendering one Agent's surface. Per **CD-11** §6, disposing the panel does not dispose the Agent; the SDK session keeps streaming and the next reveal replays the in-flight transcript.
- **Session** — An SDK session bound to one Agent, persisted on disk by the SDK at `${copilotHome}/session-state/<sessionId>/` (per R-05: a directory containing `checkpoints/*.json`, `plan.md`, `files/`, etc.).
- **Trace Event** — A JSON-line emitted to the canonical extension log (`agent-arena.events.jsonl`) by the extension's `EventEmitter`. Stable schema.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A clean clone of the repo on `ubuntu-latest` and `windows-latest` runs `npm ci && npm run lint && npm run typecheck && npm test && npm run package` to green within 10 minutes per OS, producing a `.vsix` artifact.
- **SC-002**: A human verifier installs the `.vsix` in VS Code, signs in to Copilot, opens the Agent Arena panel, and completes a round-trip with the prompt "Reply: pong" in under 60 seconds end-to-end (sign-in time excluded).
- **SC-004**: With yolo OFF, asking the primary agent to write a file MUST produce exactly one permission prompt (the VS Code modal dialog from `PromptUserPolicy`); toggling yolo ON and re-issuing the same instruction MUST produce zero prompts.
- **SC-005**: Closing and reopening VS Code MUST surface the prior session in a resumable state (whether or not the resume UX is built; the persisted directory MUST exist and be enumerable via the SDK).
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

**CD-13 — Reverse CD-07: agent surface = `vscode.Pseudoterminal`-backed `vscode.Terminal`, one tab per agent in the native panel area** (chunk #3, 2026-05-07)
*Question:* CD-07 chose a `vscode.WebviewPanel` (xterm.js inside React) as the per-agent render surface so the layout could host a custom header + bottom command-input row matching the prototype. After the adversarial-review fix sweep landed the SDK + bug-chain work, the user observed that the in-panel terminal felt different in category from VS Code's native terminal — it lacked features like the `/model` REPL slash commands the real `copilot` CLI exposes, didn't participate in VS Code's terminal-inline-chat, didn't get shell-integration command decorations, and didn't share the native terminal's tabs/splits/find/copy-paste UX. The user's framing: *"Don't reinvent the wheel, just render a vscode terminal wired into copilot sdk."* And then, after the screenshot showing `copilot(developer)` / `copilot(deputy)` / `copilot(solid-snake)` as separate terminal tabs in the user's actual operating model: *"This plugin could be an extension to the vscode terminal area … same ideas, just more sophisticated."*
*Decision:* **Reverse CD-07. Each agent surfaces as ONE `vscode.Terminal` backed by an extension-implemented `vscode.Pseudoterminal`, sitting as a tab in the native panel area, named with the canonical Principle II identity (`copilot(developer)`, `copilot(deputy)`, `copilot(solid-snake)`, …).** The CD-11 keel stays — Agent / AgentRegistry / manager pattern (now `AgentTerminalManager`), Activity-Bar TreeView as the navigation surface, persistent agent across surface close, idempotent `open()`, PermissionPolicy + per-kind modal, EI-1 audit log, SDK adapter seam, yolo store + status-bar item. Concretely:
1. **`AgentPanel` (WebviewPanel + xterm + React) is replaced by `AgentTerminal`** (`extension/src/panel/AgentTerminal.ts`). It owns one `vscode.window.createTerminal({ pty, name, iconPath, location: TerminalLocation.Panel })` per agent. Tab name maps the agent id to its canonical Principle II identity.
2. **Pseudoterminal IO is split into a pure-logic module** (`extension/src/panel/io/PseudoterminalIO.ts`) with no `vscode` import — line buffer, ↑/↓ history, slash-command dispatch (`/help`, `/yolo on|off`, `/clear`), banner + prompt rendering, OSC 633 emission. Unit-tested standalone. The host wraps it in a real `Pseudoterminal` (`AgentTerminal.ts`) and forwards `handleInput` from the terminal's keystroke stream to `PseudoterminalIO.handleInput`, and forwards Agent events (delta / final / error / status) into the corresponding IO callbacks.
3. **`AgentPanelManager` becomes `AgentTerminalManager`** (`extension/src/panel/AgentTerminalManager.ts`) — same `Map<agentId, AgentTerminal>` shape, idempotent `open()`, `onDidCloseTerminal` listener that drops the manager entry while keeping the Agent alive (CD-11 §6 preserved).
4. **The webview path goes away entirely.** Deletes `webview-src/` (React shell, xterm components, TerminalController, message bus), `src/protocol/` (envelope + per-type schemas — there's no postMessage with Pseudoterminal), `src/webview/messageRouter.ts`, `vite.config.ts`, `tsconfig.webview.json`, `postcss.config.cjs`, `tailwind.config.ts`. Drops runtime deps `@xterm/*`, `react`, `react-dom`, `zod`; drops dev deps `@vitejs/plugin-react`, `tailwindcss`, `autoprefixer`, `postcss`, `vite`. Drops the `build:webview` npm script and the second `tsconfig.webview.json` typecheck pass.
5. **OSC 633 shell-integration is wired** so the native terminal's command decorations + navigation + sticky scroll + quick-fix surface light up. `PseudoterminalIO` emits:
   - `OSC 633 ; A` before the visible prompt prefix, `OSC 633 ; B` after it.
   - `OSC 633 ; E ; <escapedCommandLine> ; <nonce>` + `OSC 633 ; C` on Enter (before `agent.submitPrompt`).
   - `OSC 633 ; D ; 0` on the running→idle transition (turn complete) and `OSC 633 ; D ; 1` on `session.error`.
   - `OSC 633 ; P ; Cwd=<path>` and `OSC 633 ; P ; HasRichCommandDetection=True` once at `open()`.
   See [`wiki/sources/vscode-terminals.md`](../../wiki/sources/vscode-terminals.md) for the full catalog and escape rules.
6. **PermissionPolicy modal stays unchanged.** Tool-call approval continues to use `vscode.window.showInformationMessage({modal:true})` — modal-dialog UX is orthogonal to the terminal substrate. Per-kind copy from CD-13's ancestor work (the adversarial-review A3 fix) survives as-is.
7. **The Activity-Bar TreeView's behavior is unchanged.** It still lists registered agents with status icons, fires `agent-arena.openAgent(agentId)` on row click, drives idempotent reveal via the manager. The only difference is that "open" now reveals a `vscode.Terminal` instead of a `vscode.WebviewPanel`.
8. **Multi-agent is the natural shape.** Every additional `Agent` instance is one additional terminal tab in the panel — VS Code's tabs UI handles selection, splits, group-decorations, and rearrangement for free. No separate multi-agent surface design is needed.
9. **Slash commands `/help`, `/yolo on|off`, `/clear`** survive the swap — they're agent-level UX, not xterm-level. Re-implemented in `PseudoterminalIO.handleSlashCommand` with the same vocabulary as before. Slash commands do NOT emit `OSC 633 ; E` / `; C` because they don't go to the agent.
10. **What's lost:** the React-rendered `AgentPaneHeader` (avatar + status badge + cwd + adapter banner + gear), the React `<CommandInput>` row, the non-functional gear icon. **What's gained:** native font/scrollback/find/link-detection/copy-paste, OSC-633 shell-integration features, terminal-inline-chat (`Cmd/Ctrl+I`), `@terminal` chat participant + `#terminalSelection` / `#terminalLastCommand` chat context refs, automatic VS Code theme alignment, smaller bundle (no Vite, no React, no @xterm/*).

*Binds:* Supersedes CD-07 §1, §3 (the WebviewPanel + xterm.js + React shell), CD-08 (the React UI shell — drop AppHeader/Tabs/Sidebar/AgentPaneHeader/CommandInput entirely; the prototype's per-agent layout becomes the terminal tab name + a one-shot banner), and CD-04 (the postMessage envelope protocol — there's no postMessage anymore). FR-006 amended to specify "the agent surface is a `vscode.Terminal` named per the canonical Principle II identity, sitting as a tab in the panel area; the Pseudoterminal-driven buffer renders the banner + prompt + agent output." FR-007 amended to mark the gear placeholder as N/A (no per-agent header in a terminal). CD-10 (seamless VS Code extension) is reinforced — agents now feel like first-class terminal participants rather than "extension UI in a webview." CD-11 is unchanged — its keel survives the substrate swap; only the render surface differs.

**CD-12 — Scope narrowing: defer SDK telemetry, harness round-trip, token-discipline migration, wiki ingestion, and image binding** (chunk #2, 2026-05-07)
*Question:* The user re-scoped this PR after an adversarial spec review surfaced ~30 findings. The original spec promised more than the scaffold needs to deliver: full SDK→canonical telemetry routing (FR-020 / SC-003), full EI-2 harness round-trip with manifest hashing (FR-024 / FR-025 / FR-026 / SC-006), exhaustive `var(--vscode-*)` token migration on first ship (CD-10's "not deferred" clause), wiki-ingestion-as-product-FR (FR-027–031 / SC-007), and a binding visual contract enforced against `prototype/swarm-primary.png` (CD-08 §8). The user's direction: *"a basic plugin that has the primary agent stood up and working, with the architecture set up to scale into different concepts. Keep it SOLID, Keep it secure, and ensure we use the copilot sdk."* And: *"design images are a frame of reference but not necessarily a source of truth."* And: *"Wiki ingestion activities should not be done as part of a spec ... that's purely a tool for you, the assistant agent, and not for the app's benefit."*
*Decision:* **Narrow scope. Strike the bindings the user explicitly de-scoped, keep the rest, defer the heavy engineering to follow-up specs.** Concretely:
1. **STRIKE FR-020** (SDK OpenTelemetry routing into the canonical log). The extension's own `aa.*` events still ship and are sufficient for diagnostics in this scaffold. The SDK's events are still observable via the SDK's own logs at `${COPILOT_HOME}/logs/`. A follow-up spec wires the OTel-to-canonical normalizer.
2. **STRIKE FR-023** (`wiki/docs/log-schema.md` requirement). The event-name catalog lives in code at `extension/src/telemetry/eventNames.ts`; a wiki-mirror page is not a product binding.
3. **STRIKE FR-024 / FR-025 / FR-026 + CD-02 + SC-006** (harness shape + import/export commands + fixture file + reference-by-manifest design). The `Agent` runtime, registry, and per-agent SDK session lifecycle ship in this scaffold (per CD-11); the export/import-as-JSON harness discipline lands in a follow-up spec.
4. **STRIKE FR-027 / FR-028 / FR-029 / FR-030 / FR-031 + SC-007** (wiki ingestion bindings). Wiki upkeep is a context-building tool for the implementing agent, not a product deliverable. The wiki/ tree we have stays as agent-context infrastructure; future specs may add to it as the implementing agent finds useful, but no FR enforces it.
5. **AMEND CD-01** to extension-events-only. Drop the SDK-events-via-normalizer clause. The canonical envelope (`ts`, `level`, `event` namespaced + versioned, `agent_id`, `correlation_id`, `payload`) still applies to every `aa.*` event; SDK events are now out of scope for the canonical log.
6. **STRIKE CD-08 §8** (the `prototype/swarm-primary.png` binding-image clause). Design images are non-binding frames of reference, not contracts. CD-08 keeps its rendering decisions (xterm + addons + theme + per-agent-header / bottom-input layout) but the visual-fidelity-is-binding clause is removed. A new file `prototype/swarm-primary-asbuilt.md` documents the engineering-reconciled vision (the version that fits VS Code's platform constraints + CD-11's nav consolidation).
7. **LOOSEN CD-10** "not deferred" clause for the xterm-theme-token migration. Token-discipline migration is now an *ongoing best-effort improvement*, not a release-blocker. New code MUST use `var(--vscode-*)` tokens; the existing hardcoded-hex palette in `XtermTerminal.tsx` and the React shell components migrates incrementally as files are touched. The deputy MAY note remaining hex usage as ⚠ but not as ❌.
8. **AMEND FR-006 / FR-007 / FR-013 / FR-018 text** to match shipped reality (TreeView at activity-bar entry; WebviewPanel in editor area; `agent-arena.openAgent(agentId)` is the canonical command; yolo via status-bar + `/yolo` slash command; no dab icon in terminal header).

What this PR ships:
- Issue #4's hard requirements: VS Code plugin, installable, testable, isolated dev workflow, CI green with passing unit tests, Copilot SDK integration, a single fully-functional terminal for the primary agent.
- The CD-11 architectural keel: `Agent`, `AgentRegistry`, `AgentPanel`, `AgentPanelManager`, populated TreeView with stateful rows. Multi-agent + workflow surfaces stay deferred but the seams are in place.
- The hygiene fixes: drop `onStartupFinished`, fix FR text drift, retract T091's wiki-cross-link claim.
*Binds (strikes/amends):* FR-020, FR-023, FR-024, FR-025, FR-026, FR-027, FR-028, FR-029, FR-030, FR-031, SC-003, SC-006, SC-007, CD-01 (narrowed), CD-02 (struck), CD-08 §8 (struck), CD-10 (token-migration clause loosened). Adds *new entities* `Agent`, `AgentSnapshot`, `AgentRegistry`, `AgentPanelManager` to the data model (per CD-11). Sets the bar for `/speckit.implement` to "every binding still in scope must ship in this PR or be explicitly listed in this CD as deferred."

**CD-11 — Consolidated navigation: Activity-Bar TreeView is the sole nav, panels are independent windows, agents persist across panel close/reopen** (chunk #2, 2026-05-07)
*Question:* CD-08 introduced in-panel `Swarm | Workflow` tabs and a `PRIMARY AGENT` sidebar inside the WebviewPanel — but VS Code's Activity Bar already provides a left-side TreeView for `agentArena`, which under CD-10 is currently empty (it just forwards to `agent-arena.openPrimaryAgent`). So Agent Arena has *two* left-side navigation surfaces, only one of which carries content. Should they consolidate?
*Decision:* **Yes — collapse all navigation into the Activity-Bar TreeView, treat WebviewPanels as VS Code-style editor windows, and keep agent state alive across panel close/reopen.** Concretely:
1. **Single navigation surface = the Activity-Bar `agentArenaPrimaryView` TreeView.** Its data provider lists every navigable destination — currently just one entry (*Main Developer*, the primary agent). Future specs append rows for background agents and a workflow editor; the entry shape stays the same. The `Swarm | Workflow` tab strip and the `PRIMARY AGENT` section header from CD-08 are **dropped from the WebviewPanel** — they're TreeView concerns, not panel concerns. The `WorkflowStub` placeholder is removed entirely (it returns when an actual workflow editor ships).
2. **Each navigation row maps to one WebviewPanel "window".** Clicking a row opens a `vscode.WebviewPanel` in the editor area for that destination, exactly like VS Code opens a file. Clicking a row whose window is already open **reveals the existing window** instead of creating a duplicate (idempotent), the same way VS Code's editor tab system handles re-opening a file. Each panel's `viewType` is `"agent-arena.<destination-id>"` so VS Code's panel registry correctly maps clicks to existing instances.
3. **Activity-Bar A click → opens TreeView AND auto-opens the primary panel.** When the user clicks the `A` icon (or the TreeView becomes visible for the first time in a session), the extension auto-opens the primary agent's WebviewPanel beside the welcome page, **and** the TreeView's *Main Developer* row is rendered as already-active (visual highlight, status dot reflecting the agent's live state). Subsequent activity-bar clicks reveal the existing panel; they do NOT re-open or duplicate it. Future agents that aren't open are shown un-highlighted in the TreeView.
4. **TreeView rows show live agent status.** Each row carries:
   - Avatar (the `MD` initials block for primary, future codicon glyphs for background-agent kinds).
   - Display name.
   - A status dot — green for `running`, gray for `idle`, yellow for `connecting`, red for `error`.
   - A short activity label — `Idle`, `Streaming response…`, `Awaiting permission`, `Connecting…`, `Error`.
   The TreeDataProvider subscribes to the `AgentRegistry`'s change events; a state change on any `Agent` triggers a `_onDidChangeTreeData.fire()` so the row re-renders without polling. This matches the iconography pattern in [`prototype/swarm-primary.png`](../../prototype/swarm-primary.png) and gives the user at-a-glance situational awareness even when the panel is closed.
5. **Panel content = single-purpose surface.** A panel for the primary agent renders only: per-agent header (avatar + name + status + cwd + adapter status + gear) → xterm terminal → bottom command input. No tabs, no in-panel sidebar, no top brand bar (the Activity Bar carries the brand). Future specs may render different content per destination — a workflow editor, a harness inspector — without changing this shape.
6. **Agent state is panel-independent.** A new `Agent` class (under `extension/src/state/`) owns everything that survives a panel-close: SDK session, current-turn id, a streaming buffer of the in-flight turn's accumulated chunks, yolo state, cwd, adapter binding. The `AgentPanel` (renamed from `PrimaryAgentPanel`) is purely a render surface — it subscribes to its `Agent`'s events on `reveal()` and unsubscribes on `dispose()`. Closing the panel **does not disconnect the SDK session** and **does not abort an in-flight turn** — the SDK session keeps streaming in the background, the agent's streaming buffer accumulates the chunks, and re-opening the panel replays the buffer via `agent.bootstrap` followed by a synthetic `assistant.delta` (or final-message envelope, if the turn completed while the panel was closed) so the user sees the conversation mid-stream rather than starting over.
7. **`AgentRegistry`** (under `extension/src/state/`) is the keyed `Map<agentId, Agent>` that the TreeDataProvider reads from. It owns agent-creation + agent-disposal lifecycle (only on extension deactivate). A separate `AgentPanelManager` maps `agentId` → live panel; `open(agentId)` is the only public method. The TreeView's `command` field on each item is `agent-arena.openAgent` with the agent id as argument; `agent-arena.openPrimaryAgent` becomes sugar for `agent-arena.openAgent("primary")` and stays in `package.json` for backwards-compatibility with the existing Command Palette entry, README, and tests.
8. **Visual contract**: per CD-10, the TreeView entries use codicons + `var(--vscode-*)` tokens; the per-agent header in the panel keeps its `MD` initials avatar (branding); the panel matches VS Code's editor-tab affordances (reveal, split, drag, close — all native); panel close fires `vscode.WebviewPanel.onDidDispose`, the agent receives a "view detached" event, and the SDK session continues running — only the panel + its post-message router are torn down.
*Binds:* FR-005 (Activity Bar entry now hosts a populated TreeView with stateful rows, not an empty placeholder), FR-006 (further specifies what's *inside* the WebviewPanel — a single-purpose surface, no nav), FR-007 (`agent-arena.openPrimaryAgent` is sugar for `agent-arena.openAgent("primary")`), CD-07 (panel architecture unchanged), CD-08 (drops the `Swarm | Workflow` tab strip + `PRIMARY AGENT` sidebar header + `WorkflowStub`; supersedes those §3 and §5 elements), CD-10 (Activity-Bar idiom = drop straight into panel still applies; the TreeView is the nav, not a greeting). **New runtime types** required: `Agent`, `AgentSnapshot`, `AgentRegistry`, `AgentPanelManager` — captured in the data-model.md update that lands with this CD.

**CD-10 — Seamless extension of VS Code (binding visual + interaction discipline)** (chunk #2, 2026-05-07)
*Question:* Agent Arena lives inside VS Code; users open it alongside Explorer, Source Control, Search, and the integrated Terminal. Without an explicit binding rule, the extension's React shell can drift visually and interactively from VS Code's native chrome — different colors when the user toggles theme, custom icons that don't match the codicon set, non-standard keybindings, missing Command Palette entries. The user has identified visual fidelity as a first-class requirement: *"This plugin needs to feel like a 'seamless extension of vscode'."*  Should this be encoded as a binding mandate?
*Decision:* **Yes — Agent Arena MUST present as a seamless extension of VS Code, in five binding dimensions:**
1. **Theme tokens, not hex.** Every color in the React shell MUST resolve through VS Code's `var(--vscode-<token>)` CSS variables (e.g. `var(--vscode-editor-background)`, `var(--vscode-sideBar-background)`, `var(--vscode-terminal-foreground)`). Hardcoded hex values are a CD-10 violation. The webview iframe injects these variables automatically, and they update in place when the user toggles theme — so Agent Arena follows light/dark/high-contrast switches without a reload. Catalog: `wiki/sources/vscode-source.md` §1.
2. **Codicons, not bespoke SVGs.** All chrome icons MUST come from the `@vscode/codicons` font (gear, send, search, comment-discussion, etc.). Bespoke SVGs are permitted only for branding (the `A` activity-bar mark, agent avatars). Catalog: `https://microsoft.github.io/vscode-codicons/`.
3. **Command bus.** Every user action with an addressable trigger MUST be exposed as a `vscode.commands.registerCommand(...)` entry declared in `package.json` `contributes.commands`. This makes actions Command-Palette-able, keybindable, and integration-testable. Direct DOM-bound function calls without a command-bus hop are a CD-10 violation.
4. **Activity-bar idiom.** The Activity Bar `A` icon is the **sole** primary entry point. Clicking it MUST drop the user directly into the WebviewPanel — no intermediate sidebar TreeView, no welcome markdown, no "Open Primary Agent Panel" button. The TreeView exists solely to anchor the icon and forwards visibility events into `agent-arena.openPrimaryAgent`. (This decision rescinds the `viewsWelcome` markdown the scaffold initially shipped with.)
5. **Disposable lifecycle.** All long-lived subscriptions (event handlers, status-bar items, panels, sessions) MUST be `vscode.Disposable` instances pushed into `context.subscriptions` or held by an explicit `Disposable[]` field on the owning class. Anonymous closure-bound listeners that survive past their owner are a CD-10 violation.

**Token discipline applies inside the xterm Theme too**: the color palette currently hardcoded in `XtermTerminal.tsx` SHOULD migrate to read VS Code's `terminal.background` / `terminal.foreground` / `terminal.ansi*` tokens via `getComputedStyle(document.documentElement).getPropertyValue("--vscode-terminal-...")`. **Per CD-12 §7, this migration is ongoing best effort, not a release-blocker.** New code MUST use `var(--vscode-*)` tokens; pre-existing hardcoded-hex sweeps incrementally as files are touched.

**Library discipline**: where VS Code itself uses a library (xterm.js, zod), Agent Arena uses the same library. Substituting equivalents is a CD-10 violation unless a follow-up CD documents the rationale (e.g. React vs. VS Code's hand-rolled DOM is an exception that's already accepted in CD-08; future deviations need the same explicit carve-out).

**Why "binding"**: every CD-10 violation is fixed at PR review by the deputy (Principle V — *Gated Agent Output*). The deputy MUST flag any of: hardcoded colors in `webview-src/`, bespoke SVGs masquerading as chrome icons, user actions without a `package.json` command entry, sidebar TreeView welcomes, and undisposed subscriptions.
*Binds:* FR-006, FR-007, FR-018, CD-07, CD-08. **Drops** the `viewsWelcome` contribution from the previous CD-08 §3 ("clicking it shows a button that creates/reveals the panel") — the panel opens on activity-bar click without intermediate UI. Mandates ongoing migration work in the existing scaffold (hardcoded hex → VS Code tokens; bespoke SVGs → codicons). The Copilot integration patterns documented at [`wiki/sources/vscode-copilot.md`](../../wiki/sources/vscode-copilot.md) inform how the SDK adapter, telemetry, and command surfaces should be wired to feel native.

**CD-09 — WITHDRAWN** (chunk #2, 2026-05-06)
*Original concept (residency-root harness unload protocol with `${context.globalStorageUri}/harnesses/<id>/sessions/` indirection) was overengineered. The user identified it as invented complexity. The harness FRs themselves were later struck per CD-12 §3, so the unload semantics question is moot at this scope. Recorded here for append-only-log integrity.*

**CD-08 — Primary agent UI shell snaps to `prototype/swarm-primary.png`** (chunk #2, 2026-05-06)
*Question:* CD-07 fixed the **surface** (WebviewPanel + xterm.js inside a React shell) but left the React shell's *layout* unspecified. The repository contains an authored prototype at `prototype/swarm-primary.png` that defines the visible-app contract: top header + tabs + left agent sidebar + per-agent header + center terminal + bottom command input. Should the scaffold spec snap the React shell to that prototype, even though several of its pieces (background agents, multi-agent routing, "+ New Agent") only become functional in future specs?
*Decision:* **Yes — the React shell snaps to `prototype/swarm-primary.png` for the primary-agent surface; future-spec features are visually scoped out (not rendered as disabled stubs that imply unfinished work). Concretely:**
1. **Top header**: "Agent Arena" branding on the left (using `agent-arena` 'A' icon to match the activity-bar entry). The "+ New Agent" CTA from the prototype is **not rendered** in this scaffold (multi-agent creation is a future spec); when that spec lands it goes here.
2. **Tabs row**: `Swarm | Workflow`, with `Swarm` active and selected. The `Workflow` tab is rendered as a tab but its content is a stubbed placeholder ("Workflow editor lands in a future spec.") — present so the visual contract is locked, inert so users don't get a half-finished feature.
3. **Left sidebar**: a single `PRIMARY AGENT` section with one entry — the primary agent. Each entry shows: an avatar circle (placeholder SVG acceptable), the agent's display name (`Main Developer` or the configured name), a status line (`Running` / `Idle` / `Error`), and a colored status dot. The selected entry is visually highlighted (left-edge accent, slight background tint, right-side chevron). The `BACKGROUND AGENTS` section from the prototype is **not rendered** in this scaffold (background agents are a future spec); when that spec lands it goes below `PRIMARY AGENT`.
4. **Per-agent header**: above the terminal area — agent avatar + `>_  <agent-name>` + `Running` status text + a settings gear icon on the right (the gear is non-functional in this scaffold; clicking emits `aa.command.executed.v1` with `{ command: "agent-arena.agentSettings.placeholder" }`).
5. **Terminal area**: the existing xterm.js renderer from CD-07. The terminal continues to handle its own banner, prompt, and slash-command echo; the React shell does NOT render those above the xterm anymore (the per-agent header subsumes the role of identifying which agent is in view). The cwd line that was previously in the xterm banner moves up into the per-agent header sub-line.
6. **Bottom command input**: a separate React-rendered `<input>` row docked at the bottom of the panel, with a placeholder (`Type a command…`), a paper-airplane send button, and submit-on-Enter. **Both** the bottom input AND direct typing into the xterm submit prompts via the same code path — the bottom input is a convenience surface for users who prefer a dedicated text field; the xterm continues to accept direct keystrokes for users who want a terminal feel. Both routes flow through `TerminalController.submitOrSlash`.
7. **Color/typography**: matches the VS Code dark theme. Hardcoded hex values are the current state; per CD-10 (and amended by CD-12 §7) tokens migrate to `var(--vscode-*)` incrementally as files are touched. Font: prefer `var(--vscode-editor-font-family)` for the xterm grid; chrome elements use `var(--vscode-font-family)`.

*Binds:* FR-006 (further specifies the WebviewPanel's React shell layout, supplementing CD-07), FR-007 (the per-agent header's gear surfaces a future-spec settings command). **Does not change** the post-message protocol from CD-04 or the SDK boundary from CD-03. **Does not introduce** any background-agent or multi-agent functionality — that's reserved for a future spec. **CD-12 §6 strikes** the original §8 (`prototype/swarm-primary.png` binding visual contract); design images are non-binding frames of reference.

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

**CD-02 — STRUCK by CD-12 §3** (originally chunk #1, 2026-05-06; struck 2026-05-07)
*Original concept (reference-by-manifest harness `sessions[]` with sha256 manifest verification) is descoped. The harness round-trip itself moves to a follow-up spec per CD-12. Recorded here for append-only-log integrity.*

**CD-01 — Extension events: canonical envelope** (chunk #1, 2026-05-06; amended by CD-12 §5)
*Question:* The constitution mandates a single canonical envelope (`ts` / `level` / `event` namespaced + versioned / `agent_id` / `correlation_id` / `payload`). What is the binding event surface for this scaffold?
*Decision:* **The extension's own structured events conform to the canonical envelope and emit to a single JSONL file at `${context.logUri}/agent-arena.events.jsonl`.** Event identifiers use the `aa.` namespace and the `.v1` version suffix (e.g. `aa.yolo.toggled.v1`, `aa.webview.opened.v1`, `aa.permission.prompted.v1`). Each event carries `ts`, `level`, `event`, `agent_id` (when attributable), `correlation_id`, and a typed `payload`. The `correlation_id` propagates through every event in a causal chain originating from a webview message. SDK-originated telemetry is **not** routed through this envelope in this scaffold; that work moves to a follow-up spec (per CD-12 §1).
*Binds:* FR-021, FR-022. (FR-020 + SC-003, previously bound by this CD, are struck per CD-12 §1.)

<!-- Decisions will be appended above this line as the spec is reviewed. -->

