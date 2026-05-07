# prototype/swarm-primary-asbuilt.md

ASCII wireframe of what the **scaffold** ships **today**, post the
CD-13 reversal of CD-07. The picture in
[`prototype/swarm-primary.png`](swarm-primary.png) remains a frame of
reference (per CD-08 §8 strike), but the actual behavior is below.

## Constraints honored

- **CD-10 (seamless VS Code extension)** — the extension feels like a
  first-class part of VS Code: activity-bar TreeView for navigation,
  native `vscode.Terminal` in the panel area for each agent surface,
  status-bar item for yolo, no in-panel branding, no in-panel tabs,
  no React shell.
- **CD-11 (single-window-per-agent)** — Activity Bar TreeView IS the
  navigation. Each TreeView row maps to one persistent `Agent`.
  Clicking the row reveals the existing terminal tab or creates a
  new one (idempotent). Closing the terminal tab does NOT disconnect
  the agent — the Agent's SDK session keeps streaming, and the next
  reveal replays the in-flight transcript via the Pseudoterminal.
- **CD-13 (the agent surface IS a `vscode.Terminal`)** — each agent
  is a `vscode.window.createTerminal({ pty, name, ... })` instance,
  named with the canonical Principle II identity. The `pty` is an
  extension-implemented `vscode.Pseudoterminal` driven by the SDK
  adapter. OSC 633 sequences light up shell-integration features
  (command decorations, navigation, sticky scroll, quick fixes).
- **CD-12 (scaffold scope narrowing)** — only the primary agent is
  registered today; multi-agent / background agents land in a
  follow-up spec. The shape doesn't change when N agents arrive —
  one TreeView row + one Agent + one terminal tab per agent.

## Top-level layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◀ ▶ 🔍 [...]                                              agent-arena      ◎ │   ← VS Code title bar (built-in)
├─┬────────────────────┬───────────────────────────────────────────────────────┤
│📁│ AGENT ARENA: PRIMARY│  ← Editor area (your code)                          │
│🔍│  AGENT             │                                                      │
│⌥ │                    │                                                      │
│🐞│ ○ Main Developer   │                                                      │
│⚙ │   Idle             │                                                      │
│💬│                    │                                                      │
│A │                    │                                                      │
│  │                    ├──────────────────────────────────────────────────────┤
│  │                    │ PROBLEMS  OUTPUT  DEBUG  TERMINAL  PORTS         + ▼ │   ← Native terminal panel
│  │                    ├────────────────────────────────────────┬─────────────┤
│  │                    │                                        │ ▶_ copilot( │
│  │                    │ Agent Arena · Main Developer · gh-cli  │    developer│   ← Tabs on right side
│  │                    │ · yolo OFF                             │ ─────────── │     (one per agent)
│  │                    │ cwd: D:\git\agent-arena                │ ▶_ copilot( │
│  │                    │ Type a prompt, /help for commands.     │    deputy)  │
│  │                    │                                        │ ─────────── │
│  │                    │ arena D:\…\agent-arena ❯ echo howdy    │ ▶_ copilot( │
│  │                    │ ● howdy                                │   solid-    │
│  │                    │                                        │   snake)    │
│  │                    │ arena D:\…\agent-arena ❯ ▌             │ ─────────── │
│  │                    │                                        │ ▶_ pwsh ext │
│  │                    │                                        │             │
├─┴────────────────────┴────────────────────────────────────────┴─────────────┤
│ × 0 ⚠ 0  ↻                                                  🛡 AA       🤖   │   ← VS Code status bar
└──────────────────────────────────────────────────────────────────────────────┘
                                                                ▲
                                                 YoloStatusBar item — click to toggle
```

The blue `●` next to `howdy` is the **OSC-633-driven success decoration**
in the gutter. Failed turns get a red ✗. The same dots show in the
scrollbar's overview ruler. None of this is custom — it's free with
the substrate.

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
  if the terminal tab exists, focus it; otherwise create one and
  reveal.
- **First-visibility-of-session auto-opens** the primary terminal so
  the user drops into the agent without an extra click (CD-10 §4 +
  CD-11 §3).
- **No `onStartupFinished` activation event**. Activation is driven
  by `onView:agentArenaPrimaryView` (the user clicking the **A**
  icon) or by `onCommand:agent-arena.openAgent` from the Command
  Palette.

## Agent terminal (one tab per agent)

The terminal buffer renders **only**:

1. **One-shot banner** at `Pseudoterminal.open()`:
   ```
   Agent Arena · Main Developer · connected to GitHub Copilot as <user> (gh-cli) · yolo OFF
   cwd: D:\git\agent-arena
   Type a prompt and press Enter. /help for slash commands. ↑/↓ history, Ctrl+C abort, Ctrl+L clear.
   ```
   Plus the `OSC 633 ; P ; HasRichCommandDetection=True` and
   `OSC 633 ; P ; Cwd=<path>` properties so VS Code knows our
   working directory and unlocks Rich shell-integration quality.

2. **Per-turn flow** — the OSC 633 markers fire in this order:
   - `A` before the visible prompt prefix
   - `B` after the prompt prefix
   - `E ; <escapedCommandLine> ; <nonce>` on Enter (explicit command)
   - `C` immediately after `E` (pre-execution)
   - then streaming `assistant.message_delta` chunks land in the
     buffer
   - `D ; 0` on `session.idle` (success) or `D ; 1` on `session.error`
   - new prompt drawn (back to `A`)

3. **Slash commands** (`/help`, `/yolo on|off`, `/clear`) — handled
   by `PseudoterminalIO`, never go to the agent. Slash dispatch does
   NOT emit `OSC 633 ; E` or `; C` (no agent execution to mark).

There is **no** in-panel sidebar, **no** `Swarm | Workflow` tabs,
**no** top brand bar, **no** React-rendered per-agent header, **no**
bottom `<CommandInput>` row. The activity-bar TreeView is the
navigation surface (CD-11) and the terminal buffer IS the agent
surface (CD-13).

## Permission modal flow

When the agent invokes a tool, `PromptUserPolicy` renders a VS Code
modal whose copy is built per `PermissionRequest.kind` — same per-kind
table as before the CD-13 reversal (this is orthogonal to the terminal
substrate):

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
union). **Yolo on** → `YoloPolicy` auto-approves while still emitting
the canonical `aa.permission.resolved.v1` event with `source: "yolo"`.

## Lifecycle

The TreeView row click → `agent-arena.openAgent("primary")` →
`AgentTerminalManager.open("primary")` flow is unchanged from the
WebviewPanel era; the manager just creates a `vscode.Terminal` instead
of a `WebviewPanel`. The Pseudoterminal's `open()` ships the bootstrap
+ replayable transcript to `PseudoterminalIO`. User keystrokes flow
into `Pseudoterminal.handleInput` → `PseudoterminalIO.handleInput` —
on Enter, `OSC 633 ; E` + `; C` fire, then `agent.submitPrompt(text,
nonce)` runs. Agent events (delta / final / error / status) flow back
through `AgentTerminal`'s subscriptions into `PseudoterminalIO`'s
output methods, which write to the buffer via `writeEmitter.fire`.

Every emit downstream of the user's prompt-submit carries the
originating nonce as the `correlation_id`, so the EI-1 log records a
contiguous causal trace from prompt-submit to session.idle (CD-04).

## Closing a terminal tab (CD-11 §6)

The user closes the terminal tab → `window.onDidCloseTerminal` fires →
`AgentTerminal.handleClose()` emits `aa.webview.closed.v1` (legacy
event-name kept for log continuity), disposes view subscriptions and
the Pseudoterminal emitters, then fires `disposeEmitter`. The
`AgentTerminalManager` drops the entry. **The Agent stays in the
registry, the SDK session keeps streaming.** Re-clicking the TreeView
row creates a fresh `AgentTerminal`; `Pseudoterminal.open()` ships
`replay` containing the agent's in-memory transcript, and
`io.open(bootstrap, replay)` walks each prior turn (preferring
`final` over `chunks`) before drawing the next prompt.

## Multi-agent shape (preview — lands in a follow-up spec)

The same shape scales to N agents. The TreeView gets one row per
`Agent`; the registry holds them; the manager opens one terminal
tab per `agentId`. The Agent ↔ AgentTerminal ↔ Pseudoterminal
quartet is identical for every agent.

```
AGENT ARENA: PRIMARY AGENT
  ○ Main Developer        Idle
  ◐ Background: Tests     Streaming response…    ← future
  ◯ Background: Build     Connecting             ← future
  + New Agent…                                   ← future
```

And in the terminal panel:

```
TERMINAL                                    + ▼
┌─────────────────────────────────────┬──────────────────┐
│                                     │ ▶_ copilot(      │
│ <active agent's terminal buffer>    │    developer)    │
│                                     │ ──────────────── │
│                                     │ ▶_ copilot(      │
│                                     │    background-1) │   ← future
│                                     │ ──────────────── │
│                                     │ ▶_ copilot(      │
│                                     │    background-2) │   ← future
│                                     │                  │
└─────────────────────────────────────┴──────────────────┘
```

— copilot(developer:opus-4.7)
