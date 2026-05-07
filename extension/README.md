# Agent Arena (extension)

VS Code extension scaffolding the **Agent Arena** orchestration engine.

This is the `extension/` package — the shipped product. The repo root holds
governance (`.specify/`), specs (`specs/`), the wiki (`wiki/`), the
agent personas (`agents/`), and the visual prototype (`prototype/`).

## Quick start

```bash
cd extension
npm install        # ~1 minute
npm run launch     # builds host + webview, opens dev VS Code with the extension loaded
```

`npm run launch` opens a fresh VS Code window with this folder loaded as a
**dev extension**. Click the **A** icon in the Activity Bar to mount the
**Agent Arena** TreeView; the *Main Developer* row's first reveal opens
the agent panel automatically. Closing the panel does not disconnect the
agent — clicking the row again reveals the same panel and replays the
in-flight transcript (CD-11).

## What you'll see

The activity-bar **A** icon opens an **Agent Arena** TreeView listing the
registered agents (today: just *Main Developer*). Clicking the row
opens that agent's **`vscode.Terminal` tab in the panel area**, named
with the canonical Principle II identity (`copilot(developer)`,
`copilot(deputy)`, `copilot(solid-snake)`, …). The terminal is backed
by a `vscode.Pseudoterminal` driven by the Copilot SDK adapter — the
agent's streaming output lands directly in the buffer; the user's
keystrokes flow through `Pseudoterminal.handleInput` to the agent.
Closing the terminal tab does **not** disconnect the agent — the SDK
session keeps streaming, and re-opening the tab replays the in-flight
transcript so the user picks up mid-stream. This is the CD-11
*agent-as-state* model + CD-13's terminal substrate, and the keel for
multi-agent / background-agent work in follow-up specs.

The terminal buffer renders three things:

1. **A one-shot banner** at open() — agent name, adapter status (`connected
   to GitHub Copilot as <user>` / `demo mode (...)`), yolo state, cwd,
   and slash-command hints.
2. **The agent's streaming output** as `assistant.message_delta` chunks
   land via `writeEmitter.fire(chunk)`. ANSI escape sequences in the
   chunks render natively in the terminal.
3. **A native prompt** (`arena <cwd> ❯ `) bracketed by `OSC 633 ; A` /
   `; B` shell-integration markers. Slash commands (`/help`, `/yolo
   on|off`, `/clear`) handled locally by the Pseudoterminal IO; everything
   else goes to the agent via `agent.submitPrompt(text, correlationId)`.

Because the agent IS a real VS Code terminal, you get for free:

- **Native rendering** — terminal colors, font, scrollback (configurable
  up to `terminal.integrated.scrollback`), find (`Cmd/Ctrl+F`),
  copy/paste with bracketed-paste, drag-and-drop file paths, link
  auto-detection.
- **Shell-integration features** — once `OSC 633` is wired (and it is):
  command decorations in the gutter and the scrollbar overview ruler,
  command navigation (`Ctrl/Cmd+Up`/`Down`), command guide on hover,
  sticky scroll, quick fixes, run-recent-command (`Ctrl+Alt+R`).
- **Terminal inline chat** (`Cmd/Ctrl+I` inside the agent's tab) —
  Copilot helps you reason about the agent's output without leaving
  the buffer.
- **`@terminal` chat participant + `#terminalSelection` /
  `#terminalLastCommand` chat context refs** — the agent's tab is a
  first-class chat participant.

When the agent invokes a tool (shell command, file write/read, URL
fetch, MCP / custom tool, memory save), the `PromptUserPolicy` modal
renders the SDK's `PermissionRequest` per-kind: e.g., a shell request
shows **Run shell command? · `$ echo howdy` · echo something to
stdout**. Approve once and the CLI proceeds. Toggle yolo via the
status-bar item or `/yolo on` to bypass for the rest of the session.

## Adapter modes

On first invocation the extension picks a **production** or **demo**
adapter (CD-03 / T035 / `selectAdapter.ts`):

- **`copilot`** — if you're signed in to GitHub Copilot. The bundled
  `@github/copilot-<platform>-<arch>` binary is spawned via the
  `CopilotSdkAdapter` and your prompts go to a real model. The banner
  reads *connected to GitHub Copilot as `<your-login>`*.
- **`fake-demo`** — fallback when the CLI fails to start or auth is
  missing. The `FakeSdkAdapter` auto-responds in canned chunks so the
  round-trip surface is still visible. The banner reads
  *demo mode (...)* with the fallback reason.

The canonical EI-1 event log is written to
`<vscode log dir>/Agent Arena/agent-arena.events.jsonl`. Run
**Agent Arena: Show Trace Log** (`Cmd/Ctrl+Shift+P`) to open it.

## Build, test, lint

```bash
npm run typecheck      # tsc --noEmit on host + webview projects
npm test               # vitest unit tests
npm run lint           # ESLint flat config; enforces SDK adapter boundary
npm run build          # esbuild (extension host) + vite (webview)
npm run package        # vsce package → agent-arena-0.0.1.vsix
```

CI runs on `ubuntu-latest` and `windows-latest` and blocks merges on lint,
typecheck, test, or `vsce package` failures (FR-032/033/034). Live-SDK
verification is a documented manual step (below) — CI never spawns the
real Copilot CLI (FR-033).

## Manual live-SDK verification (FR-035 / SC-002)

The production `CopilotSdkAdapter` is wired (T035), but talking to a real
model requires the user be signed in to GitHub Copilot. Verify
end-to-end:

1. **Sign in** to GitHub Copilot (`Cmd/Ctrl+Shift+P` →
   *GitHub Copilot: Sign In*). Make sure the `gh` CLI is signed in too,
   since the bundled CLI uses stored OAuth or `gh CLI auth` per
   `useLoggedInUser: true`.
2. **Build + install** the `.vsix`:
   ```bash
   cd extension
   npm install
   npm run package    # → agent-arena-0.0.1.vsix
   code --install-extension agent-arena-0.0.1.vsix
   ```
3. **Reload** VS Code.
4. **Open** the Agent Arena panel (Activity Bar **A** icon, or
   *Agent Arena: Open Primary Agent* from the Command Palette).
5. **Verify the banner reads**
   `connected to GitHub Copilot as <your-login> (user)`. If it reads
   `demo mode`, the CLI failed to start or auth is missing — check
   `agent-arena.events.jsonl` for the `aa.sdk.adapter.selected.v1` event
   payload.
6. **Submit** `Reply: pong`.
7. **Observe** `pong` rendered within 60 seconds (SC-002).
8. **Confirm** the trace log records, in causal order, every event listed
   in FR-021 + SC-003.

Evidence to attach to the verification PR: verifier name + GitHub
handle, OS, VS Code version, SDK version (`@github/copilot-sdk` from
`package.json`), start/end timestamps, the trace excerpt for that
round-trip, and the `.vsix` SHA.

## Architecture (one paragraph)

The extension host (`src/`) is a Node.js process inside VS Code's Electron
runtime. It owns the `SdkAdapter` instance (the seam to
`@github/copilot-sdk`), the canonical EI-1 `EventEmitter`, and the
`AgentRegistry` + `AgentTerminalManager` keel from CD-11 + CD-13. Each
`Agent` owns one SDK session, its transcript buffer, status, and yolo
binding; the `AgentTerminal` is a render-only `vscode.Terminal` (CD-13)
backed by an extension-implemented `vscode.Pseudoterminal` that subscribes
to its `Agent` on reveal and unsubscribes on close — the agent keeps
streaming and re-opening the terminal replays the in-flight transcript.
The `PseudoterminalIO` module under `panel/io/` is pure logic (no
`vscode` import) — it owns the line buffer, history, slash-command
dispatch, banner + prompt rendering, and OSC 633 shell-integration
emission; the host wraps it in a real `Pseudoterminal` and forwards
keystrokes + Agent events through it. The activity-bar TreeView is
populated from the registry and fires `agent-arena.openAgent` on row
click, idempotently revealing the existing terminal tab or creating
one. Permission decisions go through `PermissionPolicy` resolved per
agent on every tool invocation (FR-019 / R-06): `PromptUserPolicy`
renders a VS Code modal with per-kind copy built from the SDK's
`PermissionRequest` (`shell` → command + intention; `write` → file +
diff; `read`, `url`, `mcp`, `custom-tool`, etc.); `YoloPolicy`
auto-approves while still emitting the canonical audit event. A yolo
toggle takes effect on the next tool call without restarting the
session. There is no webview, no React, no xterm.js, no postMessage
protocol — the agent surface IS a native VS Code terminal.

## Layout

```
extension/
├── src/                     # extension host (esbuild → dist/extension.cjs)
│   ├── extension.ts         # activate/deactivate; lazy adapter selection
│   ├── activate/            # command + view registration
│   ├── panel/               # AgentTerminal + AgentTerminalManager (CD-13)
│   │   └── io/              # PseudoterminalIO + oscSequences (pure logic, no vscode)
│   ├── state/               # Agent (CD-11 keel), AgentRegistry, YoloStore + status-bar item
│   ├── sdk/                 # SdkAdapter interface + CopilotSdkAdapter + FakeSdkAdapter + selectAdapter
│   ├── permission/          # PermissionPolicy + YoloPolicy + PromptUserPolicy + DefaultPolicyResolver
│   ├── telemetry/           # canonical event shape + EventEmitter
│   └── shared/              # id minting helpers
├── test/
│   └── unit/                # vitest
├── icons/                   # activity-bar.svg
├── scripts/
│   └── launch.mjs           # absolute-path dev-host launcher (Windows-safe)
├── package.json
└── README.md (this file)
```

## License

MIT — see [LICENSE](./LICENSE). Copyright © 2026 Dylan McCurry.
