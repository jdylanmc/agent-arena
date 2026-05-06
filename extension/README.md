# Agent Arena (extension)

VS Code extension scaffolding the **Agent Arena** orchestration engine.

This is the `extension/` package — the shipped product. The repo root holds
governance (`.specify/`), specs (`specs/`), the wiki (`wiki/`), and the
agent personas (`agents/`).

## See it in action (visual demo)

The extension currently ships in **demo mode**: the in-memory
`FakeSdkAdapter` substitutes for the real Copilot SDK so you can see the
end-to-end round-trip without a Copilot subscription. Production
`CopilotSdkAdapter` lands in task T035.

```bash
cd extension
npm install        # ~1 minute
npm run build      # ~3 seconds — produces dist/extension.js + dist/webview/
```

Then in VS Code:

1. Open this `extension/` folder in VS Code.
2. Press **F5** (or *Run → Start Debugging*). VS Code launches an
   **Extension Development Host** with Agent Arena loaded.
3. In the new window, click the **Agent Arena** icon in the Activity Bar
   (left edge, "A" letterform).
4. The **Primary Agent** view opens. Type a prompt and press **Enter**.

You'll see:

- A header row with **Primary Agent · ● idle** that flips to **● running**
  while the demo agent generates a response.
- Your message rendered in a bubble on the right.
- The agent's response **streamed in chunks** (the demo simulates ~25ms
  per chunk so the streaming is visible).
- The header flips back to **● idle** when the response completes.

Try `Reply: pong` for the canonical `pong` round-trip, or any other
prompt — the demo replies with a canned acknowledgement explaining what
demo mode is.

The canonical EI-1 event log is written to
`<vscode log dir>/Agent Arena/agent-arena.events.jsonl`. Run the
`Agent Arena: Show Trace Log` command (Cmd/Ctrl+Shift+P) to open it.

## Build, test, lint

```bash
npm run typecheck      # tsc --noEmit on host + webview projects
npm test               # vitest unit tests (91 tests)
npm run lint           # ESLint flat config; enforces SDK adapter boundary
npm run build          # esbuild (extension host) + vite (webview)
npm run package        # vsce package → agent-arena-0.0.1.vsix
```

## Manual live-SDK verification (FR-035, SC-002)

When the production `CopilotSdkAdapter` lands (T035), the manual
verification ritual will:

1. Sign in to GitHub Copilot (`Cmd/Ctrl+Shift+P` → *GitHub Copilot: Sign In*).
2. Build + install the `.vsix` (`code --install-extension agent-arena-0.0.1.vsix`).
3. Reload VS Code.
4. Open the Agent Arena view.
5. Submit `Reply: pong`.
6. Observe `pong` rendered within 60 seconds (SC-002).
7. Confirm the trace log records, in causal order, every event listed in
   FR-021 + SC-003.

Evidence to attach to the verification PR: verifier name + GitHub
handle, OS, VS Code version, SDK version, start/end timestamps, the
trace excerpt for that round-trip, and the `.vsix` SHA.

## Architecture (one paragraph)

The extension host (`src/`) is a Node.js process inside VS Code. It
owns the `SdkAdapter` instance (the seam to `@github/copilot-sdk`),
the canonical EI-1 `EventEmitter`, the supervisor state machine, and
the `PrimaryAgentViewProvider`. The webview (`webview-src/`) is a
sandboxed React + Tailwind app that renders the *Primary Agent
terminal*. Host and webview communicate **only** through the versioned
postMessage envelope defined in
[`contracts/webview-protocol.md`](../specs/20260506-144809-scaffold-application/contracts/webview-protocol.md);
both sides validate every envelope at runtime via Zod. SDK telemetry
(OpenTelemetry from the bundled CLI) and extension-emitted events
flow through one canonical JSONL log per CD-01.

## Layout

```
extension/
├── src/                     # extension host (esbuild → dist/extension.js)
│   ├── extension.ts         # activate/deactivate
│   ├── activate/            # command + view + setting registration
│   ├── sdk/                 # SdkAdapter interface + FakeSdkAdapter + lifecycle
│   ├── permission/          # PermissionPolicy interface (impls land in T036-T041)
│   ├── protocol/            # MessageEnvelope (Zod) + per-type schemas
│   ├── telemetry/           # canonical event shape + EventEmitter
│   ├── harness/             # AgentArenaHarness shape + serializer
│   ├── webview/             # ViewProvider + messageRouter
│   └── shared/              # id minting helpers
├── webview-src/             # React + Tailwind webview (vite → dist/webview/)
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/          # StatusHeader, MessageList, PromptInput
│   ├── protocol/            # build-time mirror of src/protocol/
│   └── styles/              # tailwind.css
├── test/
│   ├── unit/                # vitest (91 tests)
│   ├── integration/         # @vscode/test-cli (lands T049+)
│   └── fixtures/
├── tests/
│   └── harnesses/           # EI-2 harness fixtures (constitution.md:549)
├── icons/                   # activity-bar.svg
├── package.json
└── README.md (this file)
```

## License

MIT — see [LICENSE](./LICENSE). Copyright © 2026 Dylan McCurry.
