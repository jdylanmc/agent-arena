# VS Code Extensions API — synthesis

The VS Code Extensions API is the contract between an extension package
and the VS Code host process. Agent Arena uses a focused subset of it;
this page documents what we actually depend on.

- **Docs**: https://code.visualstudio.com/api
- **API reference**: https://code.visualstudio.com/api/references/vscode-api
- **Contribution points**: https://code.visualstudio.com/api/references/contribution-points
- **Activation events**: https://code.visualstudio.com/api/references/activation-events
- **VS Code engine version pinned**: `^1.95.0` (extension's `engines.vscode`).
- **License of the API**: extensions are MIT-friendly; the VS Code source itself is MIT.

> Raw doc snapshots: [`wiki/raw/vscode-extensions-api/`](../raw/vscode-extensions-api/).

## Activation lifecycle

A VS Code extension exports two functions from its `main` entry point
(CJS for now — VS Code's extension host doesn't yet support ESM
extensions across all targets):

```ts
export async function activate(context: vscode.ExtensionContext): Promise<void>;
export async function deactivate(): Promise<void>;
```

`context.subscriptions` is a disposable bin — every disposable pushed
into it is disposed on deactivate.

**Activation events** (`package.json` → `activationEvents`) gate when
`activate()` is called. Agent Arena uses:

- `onView:agentArenaPrimaryView` — the activity-bar view binds activation.
- `onCommand:agent-arena.openPrimaryAgent` — the Command Palette entry binds activation.

Avoid `onStartupFinished` / `*` — they spawn the CLI on every VS Code launch and slow startup.

## Contribution points used

| Contribution | Purpose | Where in `package.json` |
|---|---|---|
| `viewsContainers.activitybar` | Adds an "A" entry to the activity bar (FR-005). | `contributes.viewsContainers.activitybar[0]` |
| `views` | Registers the `agentArenaPrimaryView` TreeView under the activity-bar entry. | `contributes.views.agentArena[0]` |
| `viewsWelcome` | Markdown content shown when the TreeView is empty (CD-07's auxiliary entry). | `contributes.viewsWelcome[0]` |
| `commands` | `agent-arena.openPrimaryAgent`, `agent-arena.showTraceLog`, `agent-arena.toggleYolo`, `agent-arena.harness.export`, `agent-arena.harness.import`. | `contributes.commands[]` |
| `configuration` | `agentArena.primaryAgent.model` setting (FR-013). | `contributes.configuration` |

## Runtime APIs Agent Arena depends on

### Webviews (CD-07)

```ts
const panel = vscode.window.createWebviewPanel(
  viewType, title,
  { viewColumn, preserveFocus },
  {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
  },
);
panel.webview.html = htmlString;            // CSP-locked, see below
panel.webview.postMessage(envelope);
panel.webview.onDidReceiveMessage(handler);
panel.onDidDispose(() => ...);
```

**CSP requirement**: every webview HTML response MUST set
`Content-Security-Policy`. The constraint:

```
default-src 'none';
script-src ${webview.cspSource} 'nonce-<nonce>';
style-src ${webview.cspSource} 'unsafe-inline';
font-src ${webview.cspSource};
img-src ${webview.cspSource} https: data:;
connect-src 'none';
```

Without CSP, VS Code emits a "webview created without CSP" warning that
ships in the user's developer console.

`webview.asWebviewUri(localUri)` rewrites local file URIs into
`vscode-webview://...` URIs that the sandboxed iframe can load.

### Native terminals + Pseudoterminal (CD-07 reversal — the substrate)

The CD-07 reversal (this PR's pivot) replaces the WebviewPanel render
surface with a `vscode.Terminal` backed by an extension-implemented
`Pseudoterminal`. Each agent gets one terminal tab; the tab name carries
the canonical Principle II identity (`copilot(developer)`,
`copilot(deputy)`, `copilot(solid-snake)`, …) so the user can switch
between agents the same way they switch between shells. The native
terminal control inherits theme colors, font, scrollback, find,
copy/paste, link detection, terminal-inline-chat, and (when we emit
`OSC 633`) command decorations + navigation + sticky scroll + quick
fixes for free. See [`vscode-terminals.md`](vscode-terminals.md) for
the user-facing feature surface and the OSC-633 catalog.

#### `window.createTerminal`

```ts
const term: vscode.Terminal = vscode.window.createTerminal({
  name: 'copilot(developer)',          // tab label
  pty: agentPseudoterminal,            // our Pseudoterminal — drives the buffer
  iconPath: new vscode.ThemeIcon('robot'),
  color: new vscode.ThemeColor('terminal.ansiBlue'),
  location: vscode.TerminalLocation.Panel,   // or Editor, or { viewColumn }
  isTransient: false,                  // persist across window reload
  hideFromUser: false,
});
term.show(/* preserveFocus */ false);
```

`TerminalOptions` covers shell-launching variants; **`ExtensionTerminalOptions`**
(used here via the `pty` field) is the variant for extension-driven
buffers. Other useful fields:

- `isTransient` — when true, the terminal is dropped on window reload
  (default false; we want our agent terminals persistent across reloads).
- `hideFromUser` — when true, the tab doesn't render in the tabs UI.
  Useful for headless background agents that don't want a visible
  surface.
- `env` — only for shell terminals (`shellPath`); ignored when `pty`
  is set.

`TerminalLocation`: `Panel = 1` (default — sits in the bottom panel),
`Editor = 2` (sits as an editor tab in the editor area). Or pass a
`{ viewColumn, preserveFocus }` object for explicit editor-area
placement.

#### `Pseudoterminal` interface (the contract)

```ts
class AgentPseudoterminal implements vscode.Pseudoterminal {
  // Host listens; we fire to write content into the terminal buffer.
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  readonly onDidWrite = this.writeEmitter.event;

  // Host listens; firing closes the terminal. Optional exit code.
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();
  readonly onDidClose = this.closeEmitter.event;

  // Host listens; firing renames the tab.
  private readonly nameEmitter = new vscode.EventEmitter<string>();
  readonly onDidChangeName = this.nameEmitter.event;

  // Optional: tell the host we want a different size than the user's setting.
  // private readonly dimsEmitter = new vscode.EventEmitter<vscode.TerminalDimensions | undefined>();
  // readonly onDidOverrideDimensions = this.dimsEmitter.event;

  // Called once when the terminal is created. Initial dimensions may be undefined
  // before the first render; the terminal will call setDimensions() when it knows.
  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.writeBanner();
    this.writePrompt();
  }

  // Called once when the user closes the tab (or when the host disposes the terminal).
  // We MUST clean up emitters here.
  close(): void {
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
    this.nameEmitter.dispose();
  }

  // User input — keystrokes (UTF-8 chunks). Includes raw escape sequences for
  // cursor keys, Ctrl+C (\x03), Ctrl+L (\x0c), bracketed-paste sequences, etc.
  handleInput(data: string): void {
    // Buffer input → on Enter, agent.submitPrompt(text).
  }

  // Re-flow / resize hint. Optional — we can ignore if we're not using
  // column-aware rendering.
  setDimensions(dimensions: vscode.TerminalDimensions): void { /* … */ }
}
```

The `Pseudoterminal` is **fully driven by us** — the host doesn't
spawn a process; we own the buffer. We write strings into the buffer
via `writeEmitter.fire(text)` (raw bytes — ANSI escapes work). We
receive user keystrokes via `handleInput(data)`. To plug into VS Code's
shell-integration features, we emit the `OSC 633` sequences ourselves
(catalog in [`vscode-terminals.md`](vscode-terminals.md)).

#### `Terminal` (the host-side handle)

```ts
interface Terminal {
  readonly name: string;
  readonly processId: Thenable<number | undefined>;   // undefined for Pseudoterminal
  readonly creationOptions: TerminalOptions | ExtensionTerminalOptions;
  readonly exitStatus: TerminalExitStatus | undefined;
  readonly state: TerminalState;                      // shell + interactedWith + isInteractedWith
  readonly shellIntegration: TerminalShellIntegration | undefined;
  sendText(text: string, addNewLine?: boolean): void; // injects into our handleInput
  show(preserveFocus?: boolean): void;
  hide(): void;
  dispose(): void;
}
```

`sendText` is how external code (commands, other extensions) injects
input — useful for "pre-fill the agent's input with this prompt" UX.
`dispose()` triggers our `Pseudoterminal.close()`.

#### Terminal lifecycle events on `vscode.window`

```ts
window.onDidOpenTerminal: Event<Terminal>;
window.onDidCloseTerminal: Event<Terminal>;
window.onDidChangeActiveTerminal: Event<Terminal | undefined>;
window.onDidChangeTerminalState: Event<Terminal>;        // shell detection, interaction
window.onDidStartTerminalShellExecution: Event<TerminalShellExecutionStartEvent>;
window.onDidEndTerminalShellExecution: Event<TerminalShellExecutionEndEvent>;
window.activeTerminal: Terminal | undefined;
window.terminals: readonly Terminal[];
```

`onDidCloseTerminal` is how we learn the user closed our agent's
terminal — we drop the AgentTerminal manager entry but the underlying
Agent stays alive (CD-11 §6 unchanged). Re-opening the agent
re-creates the Terminal and replays the in-flight transcript by
emitting it into the buffer.

#### Link providers (optional CD-07-reversal extension point)

```ts
window.registerTerminalLinkProvider({
  provideTerminalLinks(context: TerminalLinkContext, token: CancellationToken)
    : ProviderResult<TerminalLink[]>,
  handleTerminalLink(link: TerminalLink): ProviderResult<void>,
});
```

Lets us mint clickable links inside the agent's output — e.g., when
the agent writes "see file://D:/repo/src/foo.ts:42", the host
auto-detects file links, but a custom provider could surface
agent-specific affordances (e.g., "rerun this prompt", "open the
permission decision in the EI-1 log viewer").

#### Profile providers (optional — discoverable in the `+ ▼` dropdown)

```ts
window.registerTerminalProfileProvider('agent-arena.primary', {
  provideTerminalProfile(token): ProviderResult<TerminalProfile>,
});
```

Combined with a `terminal.profiles.<os>` contribution in
`package.json`, this puts "New Primary Agent Terminal" in the terminal
profiles dropdown alongside PowerShell, bash, etc. Optional for the
scaffold — the activity-bar TreeView already covers "spawn the agent."

#### Quick-fix providers (optional — leverages the lightbulb surface)

```ts
window.registerTerminalQuickFixProvider('agent-arena.fix-perm', {
  provideTerminalQuickFixes(commandMatchResult, token): ProviderResult<…>,
});
```

When the agent writes output matching a configured pattern (e.g., a
permission-denied error on a tool call), surface a Quick Fix to
re-prompt the agent with `yolo on` or to open the permission settings.

### Status bar items (CD-05 yolo affordance)

```ts
const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
item.text = '$(rocket) yolo on';
item.command = 'agent-arena.toggleYolo';
item.show();
```

Status-bar items respect the active editor / workspace; they are NOT
synced via Settings Sync (which is what CD-05 wants).

### Modal dialogs (FR-019 default `PromptUserPolicy`)

```ts
const choice = await vscode.window.showInformationMessage(
  message,
  { modal: true },
  'Allow', 'Deny',
);
```

Returns the chosen button label (`string`) or `undefined` if dismissed.
Agent Arena treats `undefined` as deny (safe default).

### Memento (CD-05 yolo persistence)

```ts
context.workspaceState.get<T>(key, defaultValue);
context.workspaceState.update(key, value);
```

`workspaceState` is per-workspace, never synced across machines. CD-05 mandates this is where yolo lives.

### Configuration (FR-013 model setting)

```ts
const cfg = vscode.workspace.getConfiguration('agentArena');
const model = cfg.get<string>('primaryAgent.model', 'gpt-5');
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('agentArena.primaryAgent.model')) { ... }
});
```

### Logging

```ts
context.logUri        // <vscode-log-dir>/<extension-id>/
context.globalStorageUri  // long-lived per-extension storage
```

Agent Arena writes the canonical EI-1 log to `${context.logUri}/agent-arena.events.jsonl`.

## Packaging + distribution

- **Builder**: `@vscode/vsce` (`vsce package` → `*.vsix`).
- **Manifest validation**: vsce checks `engines.vscode`, `publisher`, `name`, `version`, `main`, `activationEvents`, `contributes`.
- **Marketplace**: `vsce publish` (requires a Personal Access Token with `extensions:write` for the publisher).
- **Side-load**: `code --install-extension <file>.vsix`.

## Test infrastructure

- **`@vscode/test-electron`**: spawns a headless VS Code instance for end-to-end tests. Used for activation tests + command tests.
- **`@vscode/test-cli`**: thin CLI over `test-electron`.
- **`vitest`**: unit tests (no VS Code instance — all `vscode` imports must be stubbed/mocked).

## Known constraints

- **Extension host runs Electron, not Node**. `process.execPath` is `Code.exe` / `code-electron`, NOT a Node binary. Spawning child JS processes via `process.execPath` fails — use the OS-specific binary directly.
- **CJS-only**: extensions must export `activate` from a CJS entry. We bundle our TypeScript ESM source with esbuild → `dist/extension.cjs`. ESM-only dependencies (e.g., `@github/copilot-sdk`) MUST be loaded via dynamic `import()` from CJS.
- **Webviews are sandboxed iframes**: cannot import `vscode`, cannot read the file system except via `vscode-webview://` URIs minted from `localResourceRoots`. All host ↔ webview communication is post-message.
- **`activate()` is awaited** but VS Code times out at ~5s per extension — long-running work should be deferred to lazy invocation.

## How Agent Arena uses this API

| Concern | File |
|---|---|
| Activation entry | [`extension/src/extension.ts`](../../extension/src/extension.ts) |
| Activity-bar view + welcome | [`extension/src/activate/registerView.ts`](../../extension/src/activate/registerView.ts) |
| Command registration | [`extension/src/activate/registerCommands.ts`](../../extension/src/activate/registerCommands.ts) |
| WebviewPanel + CSP HTML template *(deprecated by CD-07 reversal — being replaced by AgentTerminal)* | [`extension/src/panel/AgentPanel.ts`](../../extension/src/panel/AgentPanel.ts) |
| Status-bar (yolo) | [`extension/src/state/yoloStatusBar.ts`](../../extension/src/state/yoloStatusBar.ts) |
| Memento (yolo) | [`extension/src/state/yolo.ts`](../../extension/src/state/yolo.ts) |
| Modal dialogs (permission) | [`extension/src/permission/PromptUserPolicy.ts`](../../extension/src/permission/PromptUserPolicy.ts) |
| Webview side *(deprecated — being deleted by CD-07 reversal)* | [`extension/webview-src/`](../../extension/webview-src/) |

## References

- API root: https://code.visualstudio.com/api
- Activation events: https://code.visualstudio.com/api/references/activation-events
- Contribution points: https://code.visualstudio.com/api/references/contribution-points
- Webview API guide: https://code.visualstudio.com/api/extension-guides/webview
- Tree View API: https://code.visualstudio.com/api/extension-guides/tree-view
- Status Bar API: https://code.visualstudio.com/api/extension-guides/status-bar
- Test extensions: https://code.visualstudio.com/api/working-with-extensions/testing-extension
- Raw snapshots: [`wiki/raw/vscode-extensions-api/`](../raw/vscode-extensions-api/)

— copilot(developer:opus-4.7)
