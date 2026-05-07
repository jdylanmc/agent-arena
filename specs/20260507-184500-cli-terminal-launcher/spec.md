# Feature Specification: Agent Arena — VS Code extension that launches `copilot` CLI agents as terminal tabs

**Feature Branch**: `20260507-184500-cli-terminal-launcher`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User direction recorded across the 2026-05-07 working session, plus the operating-model screenshot the user shared (multiple `copilot(...)` terminal tabs in their actual VS Code session driving the project).

> **This is a fresh spec, replacing the abandoned PR #5
> (`20260506-144809-scaffold-application`) work.** The prior attempt
> drifted through three architectural pivots — WebviewPanel + xterm + React
> (CD-07), then Pseudoterminal-driven by the Copilot SDK (CD-13), then a
> proposed shell-out — without surfacing the foundational question the
> user has now explicitly answered: **the agent surface IS the
> `@github/copilot` CLI itself, running in a real `vscode.Terminal`.**
> The extension's job is to make spawning, naming, and managing those
> CLI processes ergonomic — not to wrap or replicate any of the CLI's
> behavior.
>
> Almost everything below is a **direct echo of what the user has said
> in this repository**, plus marked-out gaps where I do not have a
> firm answer. Please scrub line-by-line and tell me where I'm wrong,
> over-specified, under-specified, or hedging on something you'd
> rather just decide.

---

## Context

The user already operates this way today, manually. Their VS Code
window for this project shows the panel-area terminal tab list:

```
TERMINAL                                              + ▼
┌───────────────┐
│ copilot(      │
│   developer)  │   ← the user's primary agent (this conversation)
├───────────────┤
│ copilot(      │
│   deputy)     │   ← background agent reviewing PRs
├───────────────┤
│ copilot(      │
│   solid-snake)│   ← background agent reviewing SOLID violations
├───────────────┤
│ pwsh ext      │   ← regular shell
└───────────────┘
```

Each of those four entries is a separate VS Code terminal tab. The
three `copilot(...)` tabs are each a separately-launched `copilot`
CLI process in interactive REPL mode. The user manually opens a new
terminal, types `copilot`, then runs the trigger phrase from the
relevant `agents/<role>/agent.md` (e.g., `> Start the deputy agent
workflow`) to load the persona.

The pain points that motivate an extension:

- Each agent has to be spawned manually — open terminal, run
  `copilot`, type the trigger phrase.
- Each agent's persona is in a markdown file in `agents/`; the user
  has to remember which trigger phrase is which.
- The terminal tab gets a generic name like `pwsh` or `copilot 4`;
  the canonical Principle II identity (`copilot(deputy)`,
  `copilot(solid-snake)`) has to be set manually via right-click →
  Rename.
- Per-agent state isolation (so the deputy's history doesn't pollute
  the developer's, etc.) requires manually setting `COPILOT_HOME`
  before each spawn.
- There's no at-a-glance view of which agents are alive.

The extension's value is: collapse all of that into "click one row in
an Activity Bar TreeView, get a properly-named, properly-configured
`copilot` CLI session in a new terminal tab." Nothing more, nothing
less.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Spawn the primary developer agent in one click (Priority: P1)

The user clicks the **Agent Arena** activity-bar icon. A TreeView
shows one row: `Main Developer`. Clicking the row opens a new
terminal tab in the panel area, named `copilot(developer)`, running
the bundled `@github/copilot` CLI in interactive mode at the
workspace root, with the developer persona loaded.

**Why this priority**: This is the smallest end-to-end flow that
delivers the core value. If only this story ships, the user has
replaced the manual "open terminal → type `copilot` → type trigger
phrase" sequence with a single click. Every subsequent story builds on
the same shape (TreeView row → terminal tab).

**Independent Test**: Click the activity-bar icon → click the
*Main Developer* row → confirm a new terminal tab appears in the
panel area named `copilot(developer)`, running the CLI with cwd at
the workspace root, and that the developer persona is active (CLI
acknowledges the trigger or shows the persona's intro).

**Acceptance Scenarios**:

1. **Given** the user has the extension installed and a workspace
   open, **When** they click the activity-bar A icon and then the
   `Main Developer` row, **Then** a new terminal tab appears in the
   panel area named exactly `copilot(developer)`, the active process
   is the bundled `@github/copilot` CLI binary, and the agent is
   ready to accept a prompt.

2. **Given** a `copilot(developer)` terminal tab is already open,
   **When** the user clicks the `Main Developer` row again, **Then**
   the existing tab is revealed (focused) — a duplicate is NOT
   created.

3. **Given** the user closes the `copilot(developer)` terminal tab
   via the trash-can button, **When** they later click the row
   again, **Then** a fresh `copilot(developer)` tab opens.
   [NEEDS CLARIFICATION: when the user closes the tab, the CLI
   process exits and any in-flight conversation is lost — is that
   acceptable, or do you want the extension to preserve the session
   across close/re-open somehow (e.g., via the CLI's
   `--resume <sessionId>` flag if it has one)?]

---

### User Story 2 — Spawn background agents (deputy, solid-snake) (Priority: P2)

The TreeView lists not just the primary agent but also the
background agents whose personas live under `agents/`. Clicking each
row spawns its own terminal tab named `copilot(deputy)` /
`copilot(solid-snake)` / etc., with the corresponding persona loaded.

**Why this priority**: Multi-agent is the project's reason for
existing (per the project name "Agent Arena"). This story proves the
shape generalizes. P2 because P1 alone delivers value if the
multi-agent vision lands later.

**Independent Test**: Click the *Deputy* row → new
`copilot(deputy)` terminal opens with the deputy persona loaded.
Click the *Solid Snake* row → new `copilot(solid-snake)` terminal
opens with that persona loaded. Both run alongside the primary
without interfering.

**Acceptance Scenarios**:

1. **Given** the developer agent is already running in
   `copilot(developer)`, **When** the user clicks the *Deputy* row,
   **Then** a new tab `copilot(deputy)` opens alongside it; the two
   processes run independently.
2. **Given** both deputy and solid-snake tabs are open, **When** the
   user clicks the deputy tab, **Then** that tab focuses and accepts
   input; the solid-snake tab continues running in the background
   with no input forwarded to it.

[NEEDS CLARIFICATION: does the TreeView always show ALL personas
defined under `agents/`, or only a curated set? If all, do
user-authored personas (a future `agents/glados-qa/agent.md` etc.)
auto-appear in the TreeView, or does the user have to register them
explicitly?]

[NEEDS CLARIFICATION: "background" was used in the project's
materials and in this conversation. Is a background agent simply
"any agent other than the primary developer," or does background
imply a different lifecycle — e.g., spawned without auto-revealing
the tab, kept running across restarts, polled for output by the
primary agent?]

---

### User Story 3 — Per-agent isolated state (Priority: P2)

Each agent's CLI process gets its own `COPILOT_HOME` directory so
their session histories, custom commands, and authentication do not
pollute each other.

**Why this priority**: Without isolation, the deputy's review
sessions land in the developer's history; slash commands they each
run change global state. P2 because the feature is invisible until
the user notices cross-pollution; P1 + P2 together are roughly the
"functional MVP."

**Independent Test**: Spawn `copilot(developer)`, run a few prompts,
quit. Spawn `copilot(deputy)`, run a few prompts, quit. Then re-spawn
`copilot(developer)` and verify it has its own session list (not the
deputy's), and vice versa.

**Acceptance Scenarios**:

1. **Given** the developer and deputy agents have each run several
   sessions, **When** the user inspects each agent's `COPILOT_HOME`,
   **Then** the directories are distinct (e.g.,
   `${context.globalStorageUri}/copilot-home/developer/` vs
   `${context.globalStorageUri}/copilot-home/deputy/`).

[NEEDS CLARIFICATION: where do per-agent COPILOT_HOME dirs live?
Per-agent under `${context.globalStorageUri}/`? Per-workspace under
`${context.storageUri}/`? Per-user shared (so the deputy on
project-A and project-B share state)? The right answer probably
depends on whether you want the deputy's PR-review history to follow
you across projects.]

[NEEDS CLARIFICATION: each agent's `COPILOT_HOME` will end up with
its own auth state. Does the extension need to surface "which
account is each agent signed in as?" or is that left to the CLI's
own machinery (the user runs `gh auth login` inside the terminal as
needed)?]

---

### User Story 4 — Persona injection (Priority: P2)

When an agent terminal opens, the extension injects the agent's
persona so the user does not have to manually type the trigger
phrase.

**Why this priority**: Without this, the user still has to manually
load each persona — partial value. P2 because P1+P2 alone are
acceptable as a launcher; persona injection is the polish that makes
"click and use" actually true.

**Acceptance Scenarios**:

1. **Given** the user clicks the *Deputy* row, **When** the
   `copilot(deputy)` tab opens, **Then** the deputy persona is
   active without the user having to type anything; the CLI
   acknowledges the persona is loaded (e.g., shows the persona's
   intro line).

[NEEDS CLARIFICATION — and this is the biggest open question in the
spec: how is the persona injected? Options I can see:

  (a) Send the trigger phrase (e.g., `> Start the deputy agent
      workflow`) to the terminal via `Terminal.sendText(...)`
      immediately after the CLI's prompt is ready. Crude — has to
      time the send so the CLI has finished initializing — but
      requires no CLI changes.

  (b) Pass the persona file as a CLI flag if the CLI supports one
      (e.g., `--system-prompt <file>`, `--instructions <file>`).
      I do not know whether `@github/copilot` accepts such a flag.

  (c) Pre-seed the agent's `COPILOT_HOME` with a system-prompt
      configuration (if the CLI reads one from disk).

  (d) Skip auto-injection — just open the terminal at cwd
      `agents/<role>/` so the persona file is right there for the
      user to read into the conversation manually.

Which option (or which combination) do you want? This decision
strongly shapes the spec.]

[NEEDS CLARIFICATION: where do persona definitions live? The repo
has `agents/<role>/agent.md` (the composed agent) +
`agents/directives/<role>.md` (the role-agnostic directive) +
`agents/personas/<voice>.md` (the persona). Does the extension read
the **composed agent file** directly and inject it as the system
prompt, or does it follow the agent → directive + persona references
and assemble the prompt itself? Or none of the above?]

---

### User Story 5 — TreeView shows live agent status (Priority: P3)

The TreeView row for each agent shows whether it's currently running
(its terminal tab is alive) or stopped, with a status icon /
description.

**Why this priority**: Useful at-a-glance polish, not blocking on
core value.

**Acceptance Scenarios**:

1. **Given** `copilot(developer)` is running and `copilot(deputy)`
   is not, **When** the user looks at the TreeView, **Then** the
   *Main Developer* row shows a "running" indicator (filled circle,
   green) and the *Deputy* row shows a "stopped" / "not running"
   indicator (outline circle, neutral).

[NEEDS CLARIFICATION: do you want any per-row controls beyond the
"click to open"? E.g., a context-menu *Stop* / *Restart* / *View
log* / *Open persona file*? Or strictly click-to-spawn-or-reveal?]

---

### Edge Cases

- The `@github/copilot` CLI binary is not installed / not bundled —
  what does the extension show? [NEEDS CLARIFICATION: is the CLI
  bundled with the extension (e.g., via the
  `@github/copilot-<platform>-<arch>` packages, the same way the
  prior PR #5 located it), or is the user expected to install it
  separately and have it on PATH?]
- The user clicks an agent row twice in quick succession — must not
  spawn two terminals (idempotent reveal).
- The user closes the terminal tab while the CLI is mid-response —
  the CLI process is killed; the in-flight response is lost. [NEEDS
  CLARIFICATION on whether to surface anything for this — a confirm
  dialog? A "session was interrupted" badge on the TreeView row?]
- The user is not signed in to GitHub Copilot (no `gh auth login`,
  no other valid auth) — the spawned `copilot` CLI will error out on
  first prompt. [NEEDS CLARIFICATION: does the extension preflight
  the auth status and surface a friendly "sign in first" message, or
  defer to the CLI's own error?]
- The workspace has no folder open — the cwd for the spawned
  CLI is undefined. [NEEDS CLARIFICATION: fall back to `os.homedir()`?
  Disallow spawning until a folder is open? Use the extension's
  globalStorageUri as a neutral cwd?]

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST contribute an Activity Bar entry
  labeled "Agent Arena" with a TreeView listing the registered
  agents.
- **FR-002**: Each TreeView row MUST, when clicked, open a
  `vscode.Terminal` (in the panel area) running the bundled
  `@github/copilot` CLI binary.
- **FR-003**: Each terminal's tab name MUST be the canonical
  Principle II identity for that agent — `copilot(<role>)` form
  (e.g., `copilot(developer)`, `copilot(deputy)`, `copilot(solid-snake)`).
- **FR-004**: Clicking an agent row whose terminal is already alive
  MUST reveal that terminal (focus + show), not spawn a duplicate.
- **FR-005**: When the user closes a terminal tab, the corresponding
  agent's `vscode.Terminal` MUST be released; the next click on the
  TreeView row MUST spawn a fresh CLI process.
- **FR-006**: Each agent's CLI process MUST run with an isolated
  `COPILOT_HOME` so that session history, custom commands, and auth
  state do not cross-pollute. [NEEDS CLARIFICATION: exact directory
  layout — see User Story 3.]
- **FR-007**: Each agent's CLI process MUST run with `cwd` set to
  the active workspace root (via
  `vscode.workspace.workspaceFolders[0]`). [NEEDS CLARIFICATION: see
  Edge Cases for the no-folder case.]
- **FR-008**: The extension MUST inject the agent's persona on
  spawn so the user does not type the trigger phrase manually.
  [NEEDS CLARIFICATION: mechanism — see User Story 4.]
- **FR-009**: The extension MUST forward only an allowlisted subset
  of `process.env` into the spawned CLI process (PATH, HOME /
  USERPROFILE, locale, OS housekeeping, COPILOT_*) — NOT the full
  parent env. (Rationale: the parent env may carry GH_TOKEN,
  AWS_*, OPENAI_API_KEY, NPM_TOKEN, arbitrary CI secrets — the CLI
  does not need them.) The allowlist is the same one validated in
  the prior PR #5's `buildSpawnedEnv` work
  (commit `b73c30f` if the deputy wants to compare).
- **FR-010**: The extension MUST surface activation via either the
  activity-bar TreeView visibility (`onView:agentArenaPrimaryView`)
  or an `agent-arena.openAgent` command. It MUST NOT use
  `onStartupFinished` or `*` activation events (which spawn the CLI
  on every VS Code launch and slow startup).

[NEEDS CLARIFICATION: which of the following are in scope for this
spec? Each is a self-contained binary decision:

  - **TreeView contents**: hard-coded `developer` / `deputy` /
    `solid-snake` rows? Discovered from `agents/<role>/agent.md`
    files at activation? Configurable via a setting?
  - **Custom user-defined agents**: can the user add an agent by
    dropping a file under `agents/<role>/` and have it auto-appear?
  - **Yolo / permission settings**: the CLI handles its own
    permission prompts (the `/yolo on|off` slash command). Does the
    extension need to surface anything (e.g., a status-bar item)?
    Or is yolo entirely a CLI-internal concern?
  - **Audit logging**: does the extension still write any
    canonical event log (`aa.*` events under `${context.logUri}/`),
    or rely entirely on the CLI's own logs under `${COPILOT_HOME}/logs/`?
  - **Cross-agent orchestration**: does the extension provide any
    surface for the developer to talk to the deputy programmatically
    (e.g., a "Send to Deputy" command)? Or is cross-agent
    coordination strictly user-driven (you switch tabs and type)?
  - **Settings / configuration**: any `agentArena.*` settings? E.g.,
    `agentArena.copilotHomeRoot`, `agentArena.discoverPersonasFrom`?
  - **Commands beyond `openAgent`**: e.g., "Stop All Agents",
    "Reload Personas From Disk", "Show Agent Logs"?
]

### Key Entities

- **Agent**: a registered participant in the arena, identified by
  a kebab-case `agentId` (`developer`, `deputy`, `solid-snake`). Has
  a canonical Principle II identity (`copilot(<role>)`), a persona
  source (a file path under `agents/`), and a per-agent
  `COPILOT_HOME` directory.

- **AgentTerminal**: the live `vscode.Terminal` for one agent, when
  it's running. The terminal's spawned process is the bundled
  `@github/copilot` CLI binary, with the agent's `cwd`, `env`
  (allowlist + agent-specific overrides), and persona injected.

[NEEDS CLARIFICATION: are there other entities? E.g., a "PersonaFile"
abstraction so the extension can validate / lint / hot-reload them?
A "Spawn Recipe" abstraction so each agent's spawn config is a
typed value rather than a closure?]

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user, with the extension installed and signed
  in to GitHub Copilot via `gh CLI auth`, can spawn the primary
  developer agent **in one click** from the activity bar — no
  Command Palette, no manual trigger phrase, no tab rename.

- **SC-002**: Multiple agents (`developer` + `deputy` +
  `solid-snake`) can run side-by-side without their session
  histories or auth state cross-polluting. Verified by spawning
  each, running a session, restarting them, and confirming each
  agent's history is its own.

- **SC-003**: The `@github/copilot` CLI's full interactive feature
  set works inside the extension's terminal tabs. Specifically:
  `/help`, `/model`, `/streamer-mode`, history navigation
  (`Ctrl+R`), and any other slash commands the CLI ships with — the
  extension does NOT intercept or reimplement them. (This is the
  core lesson from the abandoned PR #5 work.)

- **SC-004**: VS Code's native terminal features all work in agent
  tabs: find (`Cmd/Ctrl+F`), copy/paste, scrollback, link
  detection, drag-and-drop, terminal-inline-chat (`Cmd/Ctrl+I`),
  `@terminal` chat participant. Inherited for free by virtue of
  being a real `vscode.Terminal`.

- **SC-005**: Closing an agent's terminal tab releases its process
  cleanly and frees its slot in the TreeView, ready for re-spawn.
  No zombie processes, no "manager out of sync with reality" bugs.

[NEEDS CLARIFICATION: what's the "definition of done" for this
spec? Is it sufficient that User Story 1 (P1) is shipped end-to-end,
or must P1 + P2 land together? Is there a specific demo flow you'd
want to walk a colleague through to call this MVP-complete?]

---

## Assumptions

The following are my best-guess assumptions, not verified with the
user. Each is a candidate for the user to confirm or override during
the line-by-line review:

- **A-1**: The extension does NOT need to use `@github/copilot-sdk`
  (the JSON-RPC Node SDK package). The CLI binary itself is the
  product; the SDK is a programmatic substrate the user does not
  need access to from this extension. **If wrong**, this changes
  whether we keep the prior PR #5's adapter scaffolding (drop it
  vs. preserve it for a future programmatic-orchestration spec).

- **A-2**: The CLI's interactive REPL is a single mode — running
  `copilot` (no args) drops the user into it. There's no "headless"
  vs. "interactive" mode distinction the extension needs to manage.
  **If wrong**, we need to specify which mode each agent runs in.

- **A-3**: The `@github/copilot-<platform>-<arch>` npm packages
  that ship the binary will be redistributed with this extension
  the same way they were in PR #5 (as runtime dependencies). The
  extension's `extension.cjs` runs in VS Code's Node host and locates
  the binary under
  `node_modules/@github/copilot-<platform>-<arch>/copilot[.exe]`.
  **If wrong**, we need to specify how the binary is acquired (Marketplace?
  separate install step?).

- **A-4**: The user's existing `agents/` directory (with the
  composition / directive / persona layout from PR #13) is the
  source of truth for which agents exist and what their personas
  are. The extension reads from there, doesn't curate its own list.
  **If wrong**, we need to specify the discovery mechanism.

- **A-5**: The repo's existing constitution and Spec Kit workflow
  apply unchanged: every change goes through `/speckit.specify` →
  `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`; the
  deputy reviews; commits and PR bodies carry the canonical
  Principle II identity. **If wrong**, please flag what changes —
  but I doubt this is wrong.

- **A-6**: This spec is the start of a fresh PR. The PR #5 branch
  (`20260506-144809-scaffold-application`) and the work on it
  remain on the remote for archival but are not the basis of any
  ongoing work. **If wrong** (e.g., you want to formally close PR
  #5 or salvage specific commits), tell me what to do with it.

---

## What this spec deliberately does NOT cover

- Implementation. Plan + tasks land via `/speckit.plan` and
  `/speckit.tasks` after this spec is approved.
- The visual prototype (`prototype/swarm-primary.png`,
  `swarm-primary-asbuilt.md`). Per the prior CD-12 §6 (carried
  forward), design images are non-binding frames of reference.
- Specific test infrastructure, CI shape, packaging.
- Anything in the abandoned PR #5's Functional Requirements that
  this spec does not explicitly list.

---

## Open meta-questions

- The spec slug `cli-terminal-launcher` is a working title. Want
  something else? `agent-arena-restart`? `cli-terminal-spawner`?
  `terminal-extension`?
- Should this spec absorb the GLaDOS-QA agent (which already shipped
  in `specs/20260507-123242-glados-qa-agent/`)? Or stay agnostic and
  let GLaDOS-QA appear in the TreeView automatically once the
  discovery story lands?
- Should the constitution get a new principle related to "the
  extension never reimplements CLI features"? Or is that just
  captured in the spec's SC-003?

— copilot(developer:opus-4.7)
