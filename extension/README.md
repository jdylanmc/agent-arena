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
**dev extension**. The extension auto-opens the **Primary Agent** panel
beside the welcome page on first activation. Click the **A** icon in the
Activity Bar to re-open the panel after dismissing it.

## What you'll see

The visual contract is captured at
[`prototype/swarm-primary.png`](../prototype/swarm-primary.png) and codified
as **CD-08** in
[`specs/20260506-144809-scaffold-application/spec.md`](../specs/20260506-144809-scaffold-application/spec.md).
The primary-agent surface is a `vscode.WebviewPanel` opened in the editor
area (CD-07) with five layers:

1. **Top brand bar** — *Agent Arena* with the `A` icon.
2. **Tabs row** — `Swarm | Workflow`. *Swarm* is active; *Workflow* renders a
   stub placeholder until a future spec ships the editor.
3. **Left sidebar** — `PRIMARY AGENT` section with one entry (*Main
   Developer*); shows avatar, status, and a colored status dot. The
   `BACKGROUND AGENTS` section from the prototype is reserved for a future
   spec.
4. **Per-agent header** — avatar + `>_ Main Developer` + `Running` /
   `Idle` / `Connecting` / `Error` + cwd + adapter status + a settings
   gear (non-functional in this scaffold).
5. **Terminal** — bespoke `@xterm/xterm` renderer inside the React shell
   (CD-07). Accepts direct keystrokes with ↑/↓ history, slash commands
   (`/help`, `/yolo on|off`, `/clear`), and streams the agent's response.
6. **Bottom command input** — convenience text field with submit-on-Enter
   and a paper-airplane send button. Submissions flow through the same
   `TerminalController` code path as direct xterm typing.

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
`@github/copilot-sdk`), the canonical EI-1 `EventEmitter`, the
`PrimaryAgentPanel` (a `vscode.WebviewPanel` orchestrator per CD-07), and
the activity-bar TreeView placeholder. The webview (`webview-src/`) is a
sandboxed React + Tailwind app that renders the prototype-based UI shell
from CD-08 with `@xterm/xterm` as the terminal renderer. Host and webview
communicate **only** through the versioned postMessage envelope defined
in
[`contracts/webview-protocol.md`](../specs/20260506-144809-scaffold-application/contracts/webview-protocol.md);
both sides validate every envelope at runtime via Zod. SDK events
(OpenTelemetry from the bundled CLI) and extension-emitted events flow
through one canonical JSONL log per CD-01. Permission decisions go
through `PermissionPolicy` (with `YoloPolicy` and `PromptUserPolicy` as
default implementations) resolved per agent on every tool invocation
(FR-019 / R-06), so a yolo toggle takes effect on the next tool call
without restarting the session.

## Layout

```
extension/
├── src/                     # extension host (esbuild → dist/extension.cjs)
│   ├── extension.ts         # activate/deactivate
│   ├── activate/            # command + view registration
│   ├── panel/               # PrimaryAgentPanel (WebviewPanel orchestrator, CD-07)
│   ├── sdk/                 # SdkAdapter interface + CopilotSdkAdapter + FakeSdkAdapter + selectAdapter
│   ├── permission/          # PermissionPolicy + YoloPolicy + PromptUserPolicy + DefaultPolicyResolver
│   ├── protocol/            # MessageEnvelope (Zod) + per-type schemas
│   ├── telemetry/           # canonical event shape + EventEmitter
│   ├── harness/             # AgentArenaHarness shape + serializer
│   ├── state/               # YoloStore (workspaceState) + status-bar item
│   ├── webview/             # MessageRouter (Zod-validated post-message dispatch)
│   └── shared/              # id minting helpers
├── webview-src/             # React + Tailwind webview (vite → dist/webview/)
│   ├── App.tsx              # CD-08 shell: AppHeader / Tabs / Sidebar / AgentPaneHeader / xterm / CommandInput
│   ├── main.tsx
│   ├── components/          # AppHeader, TabsRow, Sidebar, AgentPaneHeader, CommandInput, XtermTerminal, WorkflowStub
│   ├── lib/                 # TerminalController (input buffer, history, slash commands)
│   ├── protocol/            # build-time mirror of src/protocol/
│   └── styles/              # tailwind.css
├── test/
│   └── unit/                # vitest
├── tests/
│   └── harnesses/           # EI-2 harness fixtures (constitution.md:584-588)
├── icons/                   # activity-bar.svg
├── scripts/
│   └── launch.mjs           # absolute-path dev-host launcher (Windows-safe)
├── package.json
└── README.md (this file)
```

## License

MIT — see [LICENSE](./LICENSE). Copyright © 2026 Dylan McCurry.
