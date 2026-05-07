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

### Pseudoterminals (alternative surface — not used in Agent Arena, retained for traceability)

```ts
class MyPty implements vscode.Pseudoterminal {
  onDidWrite: vscode.Event<string>;       // emitter.event
  onDidClose?: vscode.Event<void>;
  open(initialDimensions): void;
  close(): void;
  handleInput?(data: string): void;
  setDimensions?(dimensions): void;
}
const term = vscode.window.createTerminal({ name, pty });
```

Agent Arena originally used this (CD-06) but pivoted to a WebviewPanel
in CD-07 for layout flexibility.

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
| WebviewPanel + CSP HTML template | [`extension/src/panel/PrimaryAgentPanel.ts`](../../extension/src/panel/PrimaryAgentPanel.ts) |
| Status-bar (yolo) | [`extension/src/state/yoloStatusBar.ts`](../../extension/src/state/yoloStatusBar.ts) |
| Memento (yolo) | [`extension/src/state/yolo.ts`](../../extension/src/state/yolo.ts) |
| Modal dialogs (permission) | [`extension/src/permission/PromptUserPolicy.ts`](../../extension/src/permission/PromptUserPolicy.ts) |
| Webview side (sandboxed) | [`extension/webview-src/`](../../extension/webview-src/) |

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
