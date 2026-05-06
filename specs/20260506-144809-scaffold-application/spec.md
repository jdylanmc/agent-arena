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
- **Principle V — Explicit Prohibitions (P-1)**: Tests use synthetic / fixture inputs only; no real malicious payloads anywhere in the test suite.
- **Principle VI — Full Agent Observability (EI-1, EI-2)**: All extension and SDK activity emits structured trace events to a stable schema, and extension state is loadable/unloadable as JSON harnesses.

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
- **FR-009**: The webview MUST communicate with the extension host via `postMessage` and `acquireVsCodeApi()`; the extension host MUST be the sole owner of the Copilot SDK client (the webview never imports `@github/copilot-sdk`).

#### Copilot SDK integration (the core round-trip)

- **FR-010**: The extension host MUST instantiate a single `CopilotClient` from `@github/copilot-sdk` per VS Code window and start it on first user invocation (lazy start), tearing it down on extension deactivate.
- **FR-011**: The extension MUST redirect the SDK's home directory via the `copilotHome` option to a path inside `context.globalStorageUri`, so the SDK's session-state files live under the extension's storage and not the user's `~/.copilot/`.
- **FR-012**: The extension MUST create sessions with `streaming: true` and subscribe to `assistant.message_delta` events to render token-level updates in the terminal as they arrive.
- **FR-013**: The extension MUST expose a default model selection of `gpt-5` via a VS Code setting `agentArena.primaryAgent.model`, configurable by the user; the model used for each session MUST be recorded in the session metadata.
- **FR-014**: The extension MUST authenticate with the user's existing Copilot credentials via the SDK's auto-detection (`useLoggedInUser` default behavior); when the user is not signed in, the extension MUST surface a friendly sign-in prompt and not throw an unhandled error.
- **FR-015**: A session, once created, MUST handle prompts submitted via `session.send({ prompt, mode: "enqueue" })` so back-to-back submissions are processed in order.

#### Permission handling and yolo toggle

- **FR-016**: The extension MUST register an `onPermissionRequest` handler on every session. When the agent's `yoloMode` is OFF, the handler MUST display the request to the user and only resolve `allow` on explicit user acceptance.
- **FR-017**: Each agent (in the scaffold, only the primary agent exists) MUST have a `yoloMode` boolean state, default OFF, persisted via VS Code's extension state.
- **FR-018**: The terminal webview MUST render a yolo toggle in its header using a "robot dabbing" icon (placeholder SVG asset acceptable for the scaffold). The toggle MUST update the agent's `yoloMode` state immediately and the change MUST take effect on the next tool invocation without restarting the session.
- **FR-019**: The permission handler MUST be implemented in such a way that a future spec can replace the binary yolo/prompt logic with a fine-grained per-tool policy without changing the handler's call sites.

#### Observability — EI-1 binding

- **FR-020**: The extension MUST configure the SDK's built-in OpenTelemetry telemetry (`TelemetryConfig` with `exporterType: "file"`) to write JSON-line traces to a path under `context.logUri`.
- **FR-021**: The extension MUST emit its own structured events to the same JSONL log for events the SDK does not cover, including at minimum: `extension.activate`, `extension.deactivate`, `webview.opened`, `webview.message_received`, `permission.prompted`, `permission.resolved`, `yolo.toggled`. Event names are stable identifiers; payloads include `timestamp`, `sessionId` (when applicable), and a typed payload.
- **FR-022**: The trace log path MUST be discoverable from the Command Palette via a command `agent-arena.showTraceLog` that opens the file in an editor.
- **FR-023**: The event-name catalog and payload schemas MUST be documented in `wiki/docs/log-schema.md` and that page MUST be linked from `wiki/index.md`.

#### Harness — EI-2 binding (skeleton only)

- **FR-024**: The extension MUST define an `AgentArenaHarness` JSON shape with a `harness_version`, `agents[]` (each with `id`, `kind`, `yoloMode`), and `activeSessionId` (or null). The schema MUST live in source as a TypeScript type and be documented at `wiki/docs/harness-schema.md`.
- **FR-025**: The extension MUST expose two commands `agent-arena.harness.export` and `agent-arena.harness.import` that round-trip the harness JSON to/from a file the user picks, restoring agent settings (yolo state) on import. Session message history is **not** part of the harness in the scaffold (the SDK's own session persistence covers that).
- **FR-026**: An empty harness fixture file MUST be checked into the repo at `extension/tests/fixtures/harness.empty.json` and used by at least one unit test that exercises import/export.

#### Wiki ingestion (Principle IV binding)

- **FR-027**: The wiki MUST contain a synthesis page `wiki/sources/copilot-sdk.md` summarizing the GitHub Copilot SDK (`github/copilot-sdk`) with at least: architecture overview, key APIs (`CopilotClient`, `Session`, `defineTool`, `onPermissionRequest`), authentication priority order, observability hooks, and known constraints.
- **FR-028**: The wiki MUST contain a synthesis page `wiki/sources/vscode-extensions-api.md` summarizing the VS Code Extensions API contribution points and runtime APIs relevant to building Agent Arena (commands, viewsContainers, views, webview, configuration, activation events).
- **FR-029**: Each ingestion MUST include 10–20 raw doc snapshots cached under `wiki/raw/copilot-sdk/` and `wiki/raw/vscode-extensions-api/` respectively, with each snapshot recording `source_url`, `fetched_at`, and `commit_sha` (where the source is a git repo).
- **FR-030**: Both synthesis pages MUST be cross-linked from `wiki/index.md` under appropriate categories.
- **FR-031**: The wiki MUST contain a glossary entry for "Bot Fight" (the original codename for what is now Agent Arena) noting it as a historical alias only.

#### Continuous integration

- **FR-032**: CI MUST run on `ubuntu-latest` and `windows-latest` (macOS deferred to a follow-up). Each job MUST install dependencies, lint (ESLint), type-check, run unit tests (vitest), run integration tests (`@vscode/test-electron`) where feasible, and produce the `.vsix` as a build artifact.
- **FR-033**: CI MUST NOT exercise the live Copilot SDK (no Copilot subscription token in CI). Unit and integration tests MUST mock `CopilotClient` and `Session`. Live-SDK verification is a documented manual step in the README.
- **FR-034**: CI MUST fail the build on lint errors, type errors, test failures, or `vsce package` failures.

#### Documentation and project hygiene

- **FR-035**: `README.md` MUST document install, build, run, and **manual live-SDK verification** steps (sign in to Copilot, install `.vsix`, open Agent Arena, send "Reply: pong", expect "pong").
- **FR-036**: `CHANGELOG.md` MUST receive an attributed entry under `[Unreleased] / Added` for this feature, signed `copilot(developer:opus-4.7-xhigh)`.
- **FR-037**: The PR opened for this spec MUST be a Spec Kit draft PR linking issue #4, declaring conformance with Principles II–VI, and listing the wiki pages added.

### Key Entities

- **Agent** — A logical assistant configured with a model, a yolo state, and (in future specs) a custom system prompt and tool policy. The scaffold has exactly one: the **primary agent**.
- **Session** — An SDK session bound to one Agent, persisted on disk by the SDK at `${copilotHome}/session-state/<sessionId>/events.jsonl`. Has lifecycle events `created → idle → resumed → idle → ... → ended`.
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

<!-- Decisions will be appended above this line as the spec is reviewed. -->

