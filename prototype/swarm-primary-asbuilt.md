# prototype/swarm-primary-asbuilt.md

ASCII wireframe of what the **scaffold** ships **today**, post the
adversarial-review fix sweep on PR #5
(`20260506-144809-scaffold-application`). This is the
**engineering-reconciled** vision — the picture in
[`prototype/swarm-primary.png`](swarm-primary.png) remains a frame of
reference (per CD-08 §8 strike), but the actual behavior is below.

## Constraints honored

- **CD-10 (seamless VS Code extension)** — the extension feels like a
  first-class part of VS Code: activity-bar TreeView for navigation,
  WebviewPanel in the editor area for the agent surface, status-bar
  item for yolo, no in-panel branding, no in-panel tabs.
- **CD-11 (single-window-per-agent)** — Activity Bar TreeView IS the
  navigation. Each TreeView row maps to one persistent `Agent`.
  Clicking the row reveals the existing panel or creates a new one
  (idempotent). Closing the panel does NOT disconnect the agent —
  the Agent's SDK session keeps streaming, and the next reveal
  replays the in-flight transcript.
- **CD-12 (scaffold scope narrowing)** — only the primary agent is
  registered today; multi-agent / background agents land in a
  follow-up spec. The shape doesn't change when N agents arrive — a
  TreeView row + Agent + AgentPanel per agent.

## Top-level layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀ ▶ 🔍 [...]                          [Extension Development Host] Search    │   ← VS Code title bar (built-in)
├─┬────────────────────┬───────────────────────────────────────────────────────┤
│📁│ AGENT ARENA: PRIMARY│  Welcome × │  ▶_ Agent Arena · Main Developer ×   ◎ │   ← Tabs (built-in editor area)
│🔍│  AGENT             │ ┌─────────────────────────────────────────────────┐ │
│⌥ │                    │ │ MD  >_ Main Developer · Idle                   │ │   ← AgentPaneHeader (webview)
│🐞│ ○ Main Developer   │ │     /repo/agent-arena · connected to GitHub     │ │     avatar + name + status
│⚙ │   Idle             │ │     Copilot as jdylanmc (gh-cli)                │ │     + cwd + adapter banner
│💬│                    │ ├─────────────────────────────────────────────────┤ │
│A │                    │ │ Agent Arena · Primary Agent · gh-cli · yolo OFF │ │
│  │                    │ │ cwd: /repo/agent-arena                          │ │   ← xterm.js terminal (webview)
│  │                    │ │ Type a prompt and press Enter. /help for slash  │ │     bespoke renderer per CD-07,
│  │                    │ │ commands. ↑/↓ history, Ctrl+C abort, Ctrl+L     │ │     streaming deltas land here
│  │                    │ │ clear.                                          │ │     in real time
│  │                    │ │                                                 │ │
│  │                    │ │ arena /repo/agent-arena ❯ echo howdy            │ │
│  │                    │ │ howdy                                           │ │
│  │                    │ │                                                 │ │
│  │                    │ │ arena /repo/agent-arena ❯ ▌                     │ │
│  │                    │ ├─────────────────────────────────────────────────┤ │
│  │                    │ │ ▶ Type a command…                            ▷  │ │   ← CommandInput (webview)
│  │                    │ └─────────────────────────────────────────────────┘ │     bottom send-on-Enter row
├─┴────────────────────┴───────────────────────────────────────────────────────┤
│ × 0 ⚠ 0  ↻                                                  🛡 AA      🤖    │   ← VS Code status bar
└──────────────────────────────────────────────────────────────────────────────┘
                                                                  ▲
                                                   YoloStatusBar item — click to toggle
```

## Activity-bar TreeView

```
AGENT ARENA: PRIMARY AGENT
  ○ Main Developer    Idle               ← circle-outline icon + status label
                                            (filled circle when running,
                                             loading~spin when connecting,
                                             error icon when failed; theme
                                             colors charts.green / charts.yellow
                                             / charts.red / charts.foreground)
```

- **One row per agent** (today: `primary` only).
- **Click → `agent-arena.openAgent("primary")`**. Idempotent reveal:
  if a panel exists, focus it; otherwise create one and reveal.
- **First-visibility-of-session auto-opens** the primary panel so the
  user drops into the agent without an extra click (CD-10 §4 +
  CD-11 §3). Subsequent visibility changes are no-ops — the TreeView
  stays visible, the panel persists in the editor area.
- **No `onStartupFinished` activation event**. Activation is driven
  by `onView:agentArenaPrimaryView` (the user clicking the **A**
  icon), not at boot.

## Agent panel (one per agent, in the editor area)

The webview renders **only**:

1. **`AgentPaneHeader`** — avatar + `>_ Main Developer` + status badge
   (`Idle` / `Connecting` / `Running` / `Error`) + cwd + adapter banner +
   non-functional gear icon.
2. **`XtermTerminal`** — bespoke `@xterm/xterm` renderer (CD-07),
   handles direct keystrokes with `↑`/`↓` history, slash commands
   (`/help`, `/yolo on|off`, `/clear`), and streams `assistant.message_delta`
   chunks in real time (`streaming: true` per FR-012).
3. **`CommandInput`** — bottom send-on-Enter text field with paper-airplane
   send button. Submissions flow through the same `TerminalController`
   code path as direct xterm typing.

There is **no** in-panel sidebar, **no** `Swarm | Workflow` tabs, **no**
top brand bar. The activity-bar TreeView is the nav surface (CD-11).

## Permission modal flow

When the agent invokes a tool, `PromptUserPolicy` renders a VS Code
modal whose copy is built per `PermissionRequest.kind`:

| `kind`        | Title                              | Body lines                                                           |
|---------------|------------------------------------|----------------------------------------------------------------------|
| `shell`       | Run shell command?                 | `$ <fullCommandText>` · `<intention>` · `⚠ <warning>` (if any)       |
| `write`       | Write to file?                     | `File: <fileName>` · `<intention>` · `<diff (≤1200 chars)>`          |
| `read`        | Read file?                         | `Path: <path>` · `<intention>`                                       |
| `url`         | Fetch URL?                         | `URL: <url>` · `<intention>`                                         |
| `mcp`         | Run MCP tool?                      | `Tool: <serverName>/<toolName>` · `<args (JSON, ≤1200 chars)>`        |
| `custom-tool` | Run custom tool?                   | `Tool: <toolName>` · `<toolDescription>` · `<args>`                  |
| `memory`      | Save memory fact?                  | `Subject: <subject>` · `Fact: <fact>`                                |
| _other_       | Allow tool invocation?             | `Kind: <kind>` · best-effort string fields                           |

Approve once and the CLI proceeds. **Deny** → SDK receives
`{ kind: "denied-interactively-by-user", feedback }` (the real SDK
union, not the made-up `{ kind: "denied" }` from the pre-fix scaffold).
**Yolo on** → `YoloPolicy` auto-approves while still emitting the
canonical `aa.permission.resolved.v1` event with `source: "yolo"` so
the audit trail records the bypass.

## Lifecycle (one turn)

```
TreeView row click
       │
       ▼
agent-arena.openAgent("primary")  ──▶  AgentPanelManager.open("primary")
                                                │
                                                ├─▶ existing panel? reveal()
                                                └─▶ new AgentPanel(agent) → reveal
                                                          │
                                                          ▼
                                              webview.postMessage("agent.bootstrap")
                                                          │
                                                          ▼
                                            React renders + replays transcript
                                                          │
                            user types "echo howdy" + Enter ──▶ bus.send("prompt.submit", {promptText, agentId})
                                                          │            │
                                                          ▼            ▼
                                       MessageRouter.dispatch → Agent.submitPrompt(text, envelope.correlation_id)
                                                          │
                              Agent.ensureSession() ──▶ sdk.createSession({streaming:true, model, …, onPermissionRequest})
                                                          │
                                                          ▼
                                       sdk wires session.on("assistant.message_delta", ...) etc.
                                                          │
                                                          ▼
                                       session.send({prompt, mode:"enqueue"})
                                                          │
                              SDK ──▶ assistant.message_delta { deltaContent: "h" } ─┐
                                                                                     ├─▶ Agent fires onAssistantDelta
                              SDK ──▶ assistant.message_delta { deltaContent: "owdy" }┘
                                                                                     │
                                                                                     ▼
                                                                         AgentPanel postMessage("assistant.delta")
                                                                                     │
                                                                                     ▼
                                                                          TerminalController writes to xterm
                                  (if the agent invoked a shell tool first, PromptUserPolicy modal renders here
                                   per the table above; user clicks Allow → SDK proceeds with the tool call)
                              SDK ──▶ assistant.message { content: "howdy" }  (assembled final)
                                                                                     │
                                                                                     ▼
                                                                  TerminalController.onAssistantFinal(text)
                                                                  (writes CRLF only, since deltas already drew it;
                                                                   if streaming was off, writes text + CRLF)
                              SDK ──▶ session.idle  ──▶  Agent transitions to "idle"  ──▶  TreeView row updates
```

Every event in the chain carries the originating envelope's `correlation_id`
so the EI-1 log records a contiguous causal trace from `prompt.submit` to
`session.idle` (CD-04).

## Closing a panel (CD-11 §6)

```
User closes the editor tab
       │
       ▼
panel.onDidDispose ──▶ AgentPanel.handlePanelClose()
       │
       ├─▶ emits aa.webview.closed.v1
       │
       ├─▶ panel.dispose() (the WebviewPanel; no-op the underlying Agent)
       │
       └─▶ disposeEmitter.fire() ──▶ AgentPanelManager drops the entry
                                                │
                                                ▼
                                     Agent stays in the registry,
                                     SDK session keeps streaming
```

Re-clicking the TreeView row creates a fresh `AgentPanel` and the bootstrap
sends `transcript: [...]` — the React shell calls
`TerminalController.replayTranscript()` which prefers the consolidated
`final` text over per-chunk replay (A9 fix).

## Multi-agent shape (preview — lands in a follow-up spec)

The same shape scales to N agents. The TreeView gets one row per
`Agent`; the registry holds them; the panel manager opens one panel
per `agentId`. The Agent ↔ AgentPanel ↔ MessageRouter ↔ webview
quartet is identical for every agent.

```
AGENT ARENA: PRIMARY AGENT
  ○ Main Developer        Idle
  ◐ Background: Tests     Streaming response…    ← future
  ◯ Background: Build     Connecting             ← future
  + New Agent…                                   ← future
```

— copilot(developer:opus-4.7)
