# VS Code source — synthesis (theme, libraries, terminal integration)

The Microsoft VS Code source at [`microsoft/vscode`](https://github.com/microsoft/vscode) is a reference codebase for **how to build a Code-flavored UX**. Agent Arena lives inside VS Code's webview, so the closer we hew to its theme, libraries, and architectural patterns, the more native the plugin feels.

This page focuses on three things in priority order:
1. **Theme / branding** — what we adopt so Agent Arena visually belongs in VS Code.
2. **Core libraries + architectural patterns** — what we reuse so we don't reinvent infrastructure.
3. **Terminal integration** — deep-dive, because that's the current build focus.

Out of scope here: VS Code's webview internals, PTY plumbing, the Monaco editor — referenced briefly but not deep-dived.

- **Repo**: [`github.com/microsoft/vscode`](https://github.com/microsoft/vscode).
- **License**: MIT.
- **Status**: external reference — we don't vendor any source. Pointer files in [`wiki/raw/vscode-source/`](../raw/vscode-source/) cite specific files when we lean on a pattern.

> Raw doc snapshots: [`wiki/raw/vscode-source/`](../raw/vscode-source/).

## 1. Theme + branding (overall alignment)

### Color tokens

VS Code defines its UI in terms of **named color tokens**, not raw hex. The active theme (Dark+ Modern, Light+, etc.) maps each token to a value. Extensions reach these via `vscode.workspace.getConfiguration('workbench.colorCustomizations')` or by referencing them in webview CSS through the special `var(--vscode-<token>)` CSS variables that the webview iframe injects automatically.

**The tokens that matter for Agent Arena:**

| Token | Use |
|---|---|
| `--vscode-editor-background` | Main pane background (currently hardcoded `#1e1e1e`). |
| `--vscode-editor-foreground` | Main text color (currently `#d4d4d4`). |
| `--vscode-sideBar-background` | Sidebar (`PRIMARY AGENT` panel) background. |
| `--vscode-sideBarSectionHeader-foreground` | Sidebar section labels. |
| `--vscode-tab-activeBackground` / `inactiveBackground` | Swarm/Workflow tab strip. |
| `--vscode-tab-activeBorderTop` | Active-tab underline accent. |
| `--vscode-button-background` / `hoverBackground` | The send button + sidebar selection. |
| `--vscode-input-background` / `placeholderForeground` | Bottom command input. |
| `--vscode-terminal-foreground` + `terminal.ansi*` (16 colors) | xterm theme. |
| `--vscode-charts-green` / `red` / `yellow` | Status pills (Running / Error / YOLO). |
| `--vscode-focusBorder` | Focus outline on inputs + buttons. |

**What to do**: replace the hardcoded `#1e1e1e` / `#d4d4d4` / `#252526` / `#3c3c3c` in the React components with the corresponding `var(--vscode-*)` references. The webview iframe automatically injects these variables into `:root` and updates them when the theme changes — so a user toggling Light+ ↔ Dark+ would see Agent Arena follow without a reload.

### Iconography (Codicons)

VS Code ships its own icon font, **Codicons**: [`microsoft/vscode-codicons`](https://github.com/microsoft/vscode-codicons). The fluent set of ~600 SVGs covers every icon VS Code itself uses (gear, send, search, comment-discussion, robot, chevron, etc.) and the font is published as `@vscode/codicons` on npm.

Webviews can use Codicons by:
1. Including `@vscode/codicons/dist/codicon.css` (registers the font + the `.codicon-<name>` classes).
2. Adding the font file to `localResourceRoots` on the WebviewPanel.
3. Allowing the font in CSP: `font-src ${cspSource}`.

**What to do**: replace our hand-rolled `<svg>` icons (gear, send) with `<i class="codicon codicon-gear"></i>` and `<i class="codicon codicon-send"></i>`. The `MD` initials avatar can stay — it's branding, not chrome.

### Typography

VS Code's chrome font is the OS default UI font (Segoe UI on Windows, San Francisco on macOS, system font on Linux), exposed in webviews as `var(--vscode-font-family)` and `var(--vscode-font-size)`. The terminal/editor font is configurable but defaults to **Cascadia Code** (with ligatures) on Windows.

**What to do**: chrome elements (header, sidebar, tabs) should use `var(--vscode-font-family)` so Agent Arena reads as part of VS Code's UI. The xterm grid keeps `Cascadia Code` for monospace correctness — but reach `var(--vscode-editor-font-family)` first so user customization wins.

### Layout idioms

| Idiom | Where |
|---|---|
| Activity-bar entries are small + monochrome | Our `A` icon should match the codicon weight. |
| Sidebar section labels are uppercase, 10px, dimmed | Already matches (we use `text-[10px] uppercase tracking-wider text-[#969696]`). |
| Active item gets a 2px left-edge accent in a single accent color | Already matches. |
| Tabs use a 2px bottom-edge accent on the active tab only | Already matches. |
| Density: tight (8-12px row heights, 4-8px gutters) | Mostly matches. |
| Command Palette is the primary entry for everything | The `agent-arena.openPrimaryAgent` command satisfies this. |
| Status bar items are small, monochrome, action-oriented | The yolo status-bar item matches. |

### Design system reference

VS Code doesn't publish a "design system" doc per se, but the patterns are documented in:
- [`code.visualstudio.com/docs/getstarted/themes`](https://code.visualstudio.com/docs/getstarted/themes) — color tokens.
- [`code.visualstudio.com/api/extension-guides/webview#theming-webview-content`](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content) — how webviews adopt the active theme.
- [`microsoft.github.io/vscode-codicons/`](https://microsoft.github.io/vscode-codicons/) — the icon catalog.

## 2. Core libraries + architectural patterns

VS Code is built on a small set of libraries; we adopt the same ones where we benefit from compatibility.

| Library | What it does | We use it? |
|---|---|---|
| **[Electron](https://www.electronjs.org/)** | App shell — Chromium renderer + Node main process. | ❌ — we run inside VS Code, not as a standalone Electron app. |
| **[xterm.js](https://github.com/xtermjs/xterm.js)** | Terminal renderer (DOM/canvas/WebGL). The same library underpins VS Code's integrated terminal. | ✅ — `@xterm/xterm` + addon stack (see §3). |
| **[Monaco](https://microsoft.github.io/monaco-editor/)** | Code editor. | ⏳ — not in this scaffold; a future spec may embed Monaco for in-panel diff/code views. |
| **[zod](https://github.com/colinhacks/zod)** | Runtime schema validation. | ✅ — the post-message envelope (CD-04). |
| **React + Vite** | Webview UI. VS Code's own UI is *not* React (it's hand-rolled DOM); we chose React for our webview because the surface is small and we want fast iteration. | ✅ for our webview. |
| **TypeScript + esbuild** | Build pipeline. | ✅ — extension host bundle (esbuild → CJS). |
| **`@vscode/test-electron` + Mocha** | Integration testing. | ✅. |
| **vitest** | Unit testing. | ✅ (VS Code itself uses Mocha for unit tests; we use vitest because it's faster and works without an Electron host). |

### Architectural patterns we adopt

#### Multi-process boundary

VS Code splits work across processes: **renderer** (UI), **extension host** (your extension code), **pty host** (terminals), **shared worker** (heavy CPU). Communication is async via typed RPC.

Agent Arena mirrors the boundary at a smaller scale:
- **Extension host** (`extension/src/`) owns the SDK adapter, the canonical event log, and the WebviewPanel.
- **Webview iframe** (`extension/webview-src/`) owns the React tree + xterm.
- They talk **only** via the post-message envelope from CD-04. The webview never imports `vscode` or `@github/copilot-sdk` (ESLint enforces).

This is the same isolation discipline VS Code uses between renderer and extension host, just smaller.

#### Contribution-point registry

VS Code's `package.json` declares contributions (commands, views, configurations) in a JSON manifest, and the host wires them at activation time. Extensions never have to register globally-mutable state; the registry owns the lifecycle.

Agent Arena follows this exactly: every command, view container, view, viewsWelcome entry, and configuration setting is declared in `extension/package.json` under `contributes.*` — no runtime command registry mutations beyond what VS Code itself orchestrates.

#### Event-driven, dispose-safe lifecycle

VS Code APIs return `Disposable` objects (`{ dispose(): void }`) for every long-lived subscription, and extensions push them into `context.subscriptions` so deactivation is automatic and complete.

Agent Arena follows: every `onDidWrite`, `onDidReceiveMessage`, `panel.onDidDispose`, etc. is push-into-`subscriptions` or held by an explicit `Disposable[]` field on `PrimaryAgentPanel`.

#### Dependency injection by interface

VS Code's services are accessed by interface (`IInstantiationService`, `IFileService`, `ICommandService`), and concrete implementations are wired at startup. This is the same pattern we use with our `SdkAdapter` interface (the only file allowed to `import "@github/copilot-sdk"` is `CopilotSdkAdapter.ts`; everything else depends on the interface). See [`wiki/sources/copilot-sdk.md`](copilot-sdk.md) for our implementation.

#### Command-bus over global functions

Every user action in VS Code goes through `vscode.commands.executeCommand("foo.bar", ...)` rather than direct function calls. This makes commands palette-able, keybindable, and testable.

Agent Arena follows: even the "open primary agent" action is a command (`agent-arena.openPrimaryAgent`), invokable from the activity-bar TreeView's `viewsWelcome` link, the Command Palette, and (in tests) `vscode.commands.executeCommand`.

## 3. Terminal integration (deep-dive)

This is the section that informs the active build. Located in VS Code's source at [`src/vs/workbench/contrib/terminal/`](https://github.com/microsoft/vscode/tree/main/src/vs/workbench/contrib/terminal/).

### What VS Code's terminal actually is

It's a thin host class wrapping `@xterm/xterm`. Each open terminal has:
1. **One `Terminal` instance** from `xterm.js`.
2. **The addon stack** (see below).
3. **A PTY connection** via `node-pty` running in the pty-host process.
4. **Shell-integration hooks** that decorate the scrollback with command boundaries, exit codes, and cwd changes.
5. **Theme bindings** that mirror VS Code's color tokens onto xterm's `Theme` object.

For Agent Arena, **#3 (PTY) and #4 (shell integration) don't apply** — our "terminal" is a chat surface, not a shell. We adopt #1, #2, and #5.

### The addon stack

VS Code loads, in this order:

| Addon | Purpose | Agent Arena status |
|---|---|---|
| `@xterm/addon-fit` | Resize the grid to the container box. | ✅ |
| `@xterm/addon-web-links` | Detect URLs in scrollback, make them Ctrl+Click-able. | ✅ |
| `@xterm/addon-search` | Find within scrollback (`Ctrl+F` in VS Code). | ✅ (loaded; UI deferred) |
| `@xterm/addon-serialize` | Capture scrollback as a string. | ✅ (loaded; used by harness export later) |
| `@xterm/addon-unicode11` | Correct cell widths for emoji + Unicode 11 chars. | ✅ |
| `@xterm/addon-webgl` | GPU-accelerated rendering. | ⏳ deferred (CSP audit needed). |
| `@xterm/addon-canvas` | Canvas fallback when WebGL is unavailable. | ⏳ deferred (paired with WebGL). |
| `@xterm/addon-image` | Sixel/iTerm-image protocol. | ❌ out of scope for chat. |
| `@xterm/addon-ligatures` | Programming ligatures. | ⏳ deferred (needs WebGL). |

VS Code ships its own [`shellIntegrationAddon`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/xterm/shellIntegrationAddon.ts) for OSC 633/7 sequence parsing; Agent Arena doesn't need this (no shell), but a future *agent-integration sequence* (markers for tool-call start/end, success/failure) could follow the same pattern.

### Focus management

This is where VS Code's terminal subtly differs from a naïve xterm wrapper. The container element has a `mousedown` handler that calls `term.focus()` — even if the click lands on padding outside the canvas. Without this, clicking a margin pixel can leave xterm without DOM focus and the user can't type.

Agent Arena's port:

```ts
// XtermTerminal.tsx
const containerNode = containerRef.current;
const refocus = (): void => term.focus();
containerNode.addEventListener("mousedown", refocus);
```

This was the fix for "the terminal is not responsive" feedback on 2026-05-07.

### Theme integration

VS Code maps its color tokens onto xterm's `Theme` object via [`browser/terminalConfigHelper.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/terminalConfigHelper.ts):

```ts
const theme: ITheme = {
    background: getColor("terminal.background"),
    foreground: getColor("terminal.foreground"),
    cursor: getColor("terminalCursor.foreground"),
    selectionBackground: getColor("terminal.selectionBackground"),
    black: getColor("terminal.ansiBlack"),
    // … 16 ANSI colors
};
```

Agent Arena currently hardcodes the dark palette in `XtermTerminal.tsx`; reading these tokens from CSS variables (`var(--vscode-terminal-*)`) is a near-term improvement — it's a 20-line change inside the addon-load block.

### Files we cite as reference

- [`browser/xterm/xtermTerminal.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/xterm/xtermTerminal.ts) — VS Code's xterm wrapper class. Our `XtermTerminal.tsx` is the React port.
- [`browser/xterm/shellIntegrationAddon.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/xterm/shellIntegrationAddon.ts) — shell-integration sequence parser. Reference for a future agent-integration addon.
- [`browser/terminalConfigHelper.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/terminalConfigHelper.ts) — theme-token mapping.

## How Agent Arena uses this reference

| Concern | Where it lands in our code |
|---|---|
| xterm + addon stack | [`extension/webview-src/components/XtermTerminal.tsx`](../../extension/webview-src/components/XtermTerminal.tsx) |
| Click-to-refocus | Same file, the `mousedown` handler block |
| Color tokens (planned) | All `webview-src/components/*.tsx` — replace hardcoded hex with `var(--vscode-*)` |
| Codicons (planned) | `webview-src/components/CommandInput.tsx` (send icon) and `AgentPaneHeader.tsx` (gear icon) |
| Theme-aware xterm (planned) | `XtermTerminal.tsx` Theme object reads from CSS variables |
| Contribution-point manifest | [`extension/package.json`](../../extension/package.json) `contributes.*` |
| Disposable lifecycle | [`extension/src/panel/PrimaryAgentPanel.ts`](../../extension/src/panel/PrimaryAgentPanel.ts) — `disposables: vscode.Disposable[]` |
| Adapter DI | [`extension/src/sdk/SdkAdapter.ts`](../../extension/src/sdk/SdkAdapter.ts) (interface) + [`CopilotSdkAdapter.ts`](../../extension/src/sdk/CopilotSdkAdapter.ts) (concrete) |
| Command bus | All commands declared in `package.json`, registered in `extension.ts`, no direct calls |

## References

- Repo: https://github.com/microsoft/vscode
- Theme docs: https://code.visualstudio.com/docs/getstarted/themes
- Webview theming: https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content
- Codicon catalog: https://microsoft.github.io/vscode-codicons/
- Terminal contrib: https://github.com/microsoft/vscode/tree/main/src/vs/workbench/contrib/terminal/
- xterm.js: https://github.com/xtermjs/xterm.js
- Raw snapshots: [`wiki/raw/vscode-source/`](../raw/vscode-source/)

— copilot(developer:opus-4.7)
