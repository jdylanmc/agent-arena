# VS Code Terminal — User-facing surface + shell-integration substrate

**Sources** ([raw](../raw/vscode-terminals/)):
- [`raw/vscode-terminals/terminal-basics.md`](../raw/vscode-terminals/terminal-basics.md)
  — `code.visualstudio.com/docs/terminal/basics`
- [`raw/vscode-terminals/shell-integration.md`](../raw/vscode-terminals/shell-integration.md)
  — `code.visualstudio.com/docs/terminal/shell-integration`

**Related**: [`vscode-extensions-api.md`](vscode-extensions-api.md) (the
extension-author API surface — `Pseudoterminal`, `TerminalLink`,
`TerminalProfile`, etc.); [`vscode-source.md`](vscode-source.md) (the
underlying renderer + theme tokens).

---

## Why this matters to Agent Arena (CD-07 reversal — same ideas, more sophisticated substrate)

The scaffold's current per-agent UI is a `vscode.WebviewPanel` rendering
xterm.js inside a React shell (CD-07). That choice traded native
terminal feel for control over the surface. The **CD-07 reversal**
(this PR's pivot) keeps the CD-11 keel — Agent / AgentRegistry /
manager pattern, activity-bar TreeView for navigation, persistent
agent across surface close, idempotent open — and **swaps the render
surface to a `vscode.Terminal` backed by a `vscode.Pseudoterminal`**.

The framing is "agent-arena is an extension on top of the VS Code
**terminal area**, not a replacement for it." Each agent surfaces as
**one terminal tab in the panel area**, named with the canonical
Principle II identity (`copilot(developer)`, `copilot(deputy)`,
`copilot(solid-snake)`, …). The user switches between agents the same
way they switch between shells — terminal tabs on the right side of
the panel. Multi-agent isn't a future vision, it's the natural shape
of the substrate: each `Agent` instance gets one `vscode.Terminal`,
the tabs UI handles selection, splits give side-by-side views,
group-decorations give visual cohesion.

Pseudoterminal API mechanics live in
[`vscode-extensions-api.md`](vscode-extensions-api.md) under
*Native terminals + Pseudoterminal*; this page covers the
**user-facing feature surface** the integrated terminal exposes
(decorations, navigation, IntelliSense, links, find, copy/paste,
inline chat) and the **shell-integration escape sequences** (`OSC 633`)
that the Pseudoterminal emits to plug into those features for free.

What stays the same:
- Agent / AgentRegistry / per-agent persistent state (CD-11 §4–§7)
- Activity-bar TreeView as the launch + status surface
- PermissionPolicy + per-kind modal (uses VS Code's modal dialog,
  not a terminal-side prompt — orthogonal to the rendering substrate)
- EI-1 canonical event log
- SDK adapter seam (`SdkAdapter` interface; `CopilotSdkAdapter` is
  still the production driver)
- Yolo store + status-bar item

What changes:
- `AgentPanel` (WebviewPanel + React + xterm.js) → `AgentTerminal`
  (Pseudoterminal + `vscode.window.createTerminal`)
- `AgentPanelManager` → `AgentTerminalManager` (same shape, different
  payload type)
- `webview-src/` directory deleted — no React, no xterm.js, no CSP
  helpers, no Vite webview build step
- `TerminalController` (webview-side input/history/slash-command logic)
  → reborn as the body of the `Pseudoterminal.handleInput` handler
- Per-agent banner stops being a React component; becomes the one-shot
  intro text written to the buffer at `open()` plus the terminal
  tab's own name + icon

What we gain (and the user loses no functionality):
- Native font, scrollback (configurable up to `terminal.integrated.scrollback`),
  find (`Cmd+F`), copy/paste with bracketed-paste support, link
  auto-detection, drag-and-drop file paths, theme alignment
- Shell-integration features once `OSC 633` sequences are emitted:
  command decorations (success/fail dots in the gutter + scrollbar
  overview ruler), command navigation (`Ctrl/Cmd+Up`/`Down`), command
  guide (vertical bar on hover), sticky scroll, quick fixes,
  run-recent-command (`Ctrl+Alt+R`), go-to-recent-directory
- **Terminal-inline-chat** (`Cmd/Ctrl+I` inside the terminal): Copilot
  helps the user reason about agent output without leaving the buffer
- **`@terminal` chat participant**: `@terminal /explain that error`
  pulls our agent's output as context
- **`#terminalSelection` / `#terminalLastCommand`**: chat references
  to the agent's tab

---

## Native terminal feature surface (what we get for free)

When an agent runs inside `vscode.window.createTerminal({ pty: … })`,
the user gets every one of the following without extra code on our
side:

| Feature | Source | Notes |
|---|---|---|
| Tabs UI on the right with name, icon, color, group decoration | basics — *Managing terminals* | Set name + icon via `TerminalOptions.name` / `iconPath` / `color`. |
| Split panes / groups | basics — *Groups (split panes)* | `Ctrl+Shift+5` (Win/Linux) or `Cmd+\` (mac); drag-rearrange. |
| Editor-area placement (terminal as an editor tab) | basics — *Terminals in editor area* | Pass `location: vscode.TerminalLocation.Editor` (or `{ viewColumn }`). User can also drag a panel-terminal into the editor area. |
| New-window terminal | basics — *Terminals in new windows* | "Move Terminal to New Window" command. |
| Buffer + scrollback (default 1000 lines) | basics — *Navigating the buffer* | `terminal.integrated.scrollback` setting. |
| **Command navigation** (`Ctrl/Cmd+Up`/`Down`) | basics + shell-integration | Requires shell integration's prompt-start (`OSC 633;A`) markers to know where commands begin. |
| **Link auto-detection** (URI, file, folder, word) | basics — *Links* | URI/URL, file, folder, word links handled in priority order. Word-link search uses `terminal.integrated.wordSeparators`. |
| **Extension link providers** | basics — *Extensions handling links* | Register via `vscode.window.registerTerminalLinkProvider`. |
| Find in terminal (`Ctrl/Cmd+F`) | basics — *Find* | Free; no opt-in. |
| Run-selected-text from editor | basics — *Run selected text* | `workbench.action.terminal.runActiveFile` etc. |
| Copy/paste with platform-standard shortcuts | basics — *Copy & paste* | Bracketed-paste mode honored when shell signals support. |
| Drag-and-drop file paths into the terminal | basics — *Drag and drop file paths* | Path is auto-escaped for the active shell. |
| Tasks integration | basics — *Automating terminals with tasks* | Not relevant to us today; future spec. |
| Working-directory tracking in tab | shell-integration — *Current working directory detection* | We emit `OSC 633;P;Cwd=<path>` to drive it. |
| Maximise the terminal panel | basics — *Maximizing the terminal* | Built-in. |
| **Terminal inline chat** (`Cmd/Ctrl+I`) | basics — *GitHub Copilot in the terminal* | Copilot helps with shell commands inside the terminal. |
| **`@terminal` chat participant** | basics — *GitHub Copilot in the terminal* | `@terminal list the 5 largest files`, `@terminal /explain top` etc. |
| **`#terminalSelection` / `#terminalLastCommand` chat context refs** | basics — *Reference terminal context in chat* | Chat panel can pull selected text or last command from the terminal. |

The Copilot-in-the-terminal entries are the punchline of the user's
pivot: by becoming a real terminal, our agent's output is automatically
consumable by Copilot's terminal-aware chat surface — without us
shipping any code.

---

## Shell-integration substrate (`OSC 633`)

Shell integration is the mechanism that elevates a terminal from "just
shows characters" to "knows where commands start, where they end, what
their exit code was, what the cwd is." When our Pseudoterminal emits
the right escape sequences in the right order, VS Code lights up:

- left-margin **command decorations** (blue circle = success, red
  circle with cross = failure) plus matching dots in the scrollbar's
  overview ruler
- **command navigation** (`Ctrl/Cmd+Up`/`Down`) jumps between command
  starts; `Shift+Ctrl/Cmd+Up`/`Down` selects to the command
- **command guide** — the vertical bar that highlights the
  command + output region on hover
- **sticky scroll** — the running command's prompt stays at the top of
  the viewport while output scrolls
- **quick fixes** (lightbulb actions on detected output patterns)
- **run-recent-command** quick pick (`Ctrl+Alt+R`) sources from
  per-session history + cross-session per-shell history + common
  shell history file
- **go-to-recent-directory** quick pick (`Cmd+G` / `Ctrl+G`)
- **IntelliSense** (`Ctrl+Space` to trigger; auto-suggest by setting)
- **enhanced accessibility** — accessible-buffer command navigation,
  audio cue on command failure, better arrow/backspace handling
- **enhanced PowerShell shortcuts** — `Ctrl+Space`, `Alt+Space`,
  `Shift+Enter`, `Shift+End`, `Shift+Home`

VS Code reports a **shell-integration quality** in the tab hover:
`None`, `Basic`, or `Rich`. Rich requires the sequences to arrive in
the expected order (`A, B, E, C, D` per turn).

### `OSC 633` sequence catalog

The VS-Code-specific protocol. `ST` is the string terminator (`\x1b\\`
or `\x07`). Other terminals should ignore these; the docs recommend
gating emission on `$TERM_PROGRAM == "vscode"`.

| Sequence | Meaning | When we'd emit it |
|---|---|---|
| `OSC 633 ; A ST` | Mark prompt start | Right before we render the agent's "ready" prompt line. |
| `OSC 633 ; B ST` | Mark prompt end | Right after the prompt prefix, before user-typed input. |
| `OSC 633 ; E ; <commandline> [; <nonce>] ST` | Explicitly set the command line | When we receive the user's full submitted prompt (preferred over inferring from A/B/C). The `nonce` lets VS Code trust the line for richer features (e.g., quick-fix safety). |
| `OSC 633 ; C ST` | Mark pre-execution | Right after the user submits and before the agent starts streaming. |
| `OSC 633 ; D [; <exitcode>] ST` | Mark execution finished | When the SDK fires `session.idle` or `session.error`. Pass `0` for success, non-zero on error. |
| `OSC 633 ; P ; Cwd=<path> ST` | Set CWD | Once on session start (with the agent's working directory) and any time it changes. |
| `OSC 633 ; P ; IsWindows=True\|False ST` | Tell VS Code the terminal is using a Windows backend | Heuristic to relax sequence-position assumptions on Windows. We emit `False` since we drive the buffer ourselves. |
| `OSC 633 ; P ; HasRichCommandDetection=True ST` | Promise that we'll always emit A/B/E/C/D in order | We emit this once at startup if we honor the discipline. Unlocks "Rich" quality. |

### Command-line escaping

Within `OSC 633 ; E`, the command line uses `\xAB` (hex, case-insensitive)
escapes. Required escapes:
- `\` → `\\`
- `\n` → `\x0a`
- `;` → `\x3b`
- Any character with code ≤ `0x20`

### Compatibility sequences

VS Code also accepts:

- **Final Term `OSC 133`** — `A` (prompt start), `B` (prompt end),
  `C` (pre-exec), `D[;exitcode]` (done). Simpler than `OSC 633` —
  no command-line capture, no property-set. We could use these
  exclusively if we didn't care about the explicit commandline /
  cwd hints, but `OSC 633` strictly supersets and is the recommended
  surface inside VS Code.
- **iTerm2 `OSC 1337 ; CurrentDir=<Cwd> ST`** — sets cwd. Equivalent
  to `OSC 633 ; P ; Cwd=…`.

---

## How shell integration is normally installed (informational)

For real shells (bash/fish/pwsh/zsh on macOS/Linux; Git Bash and pwsh
on Windows), VS Code injects the shell-integration script via env vars
and shell args:

- Auto-injection toggled by `terminal.integrated.shellIntegration.enabled`.
- Manual install: source the script located by `code --locate-shell-integration-path <shell>` from the shell's rc file.
- Inline-install for performance: resolve the path ahead of time, embed
  the literal path in the rc file.

**This does not apply to our extension-driven Pseudoterminal** —
auto-injection only targets shells launched by VS Code as real
processes. Our terminal isn't a real shell, so we emit the OSC
sequences ourselves directly into the buffer.

---

## IntelliSense in the terminal

Triggered by `Ctrl+Space` (or auto-suggest per
`terminal.integrated.suggest.quickSuggestions`). Suggestion sources
include built-in providers (file/folder paths, common commands) and
extension-contributed providers via
`terminal.integrated.suggest.providers`.

For our agent's first cut we don't ship a suggest provider — the
user's input is a free-form prompt, not a shell command. A future
spec could contribute a suggest provider that surfaces e.g. the agent's
slash-command set or known prompt templates.

---

## What's NOT free from the native terminal

Our agent is not a real shell. The following do not apply because we
don't have a real PTY behind the buffer:

- Auto-injected shell-integration script (we emit sequences manually).
- The default profiles dropdown (we contribute our own
  `TerminalProfileProvider` only if we want to be discoverable from
  the `+ ▼` dropdown — optional).
- `cd` directory tracking via real shell (we control cwd ourselves;
  emit `OSC 633 ; P ; Cwd=…` on changes).
- Fixed-dimension terminal (`Set Fixed Dimensions`) — works for any
  terminal, but our Pseudoterminal has to honor `setDimensions` if
  it cares about column-aware rendering.
- Run-selected-text-from-editor sending into our terminal — works,
  but the user should expect the text to be *submitted as a prompt*
  in our case rather than executed as a command. Behavior alignment
  is a UX decision, not a technical one.

---

## Implementation notes for the CD-07 reversal

**Shape: extension over the native terminal area, one tab per agent.**

1. Replace `AgentPanel` (the WebviewPanel + xterm React shell) with an
   `AgentTerminal` that owns a `vscode.window.createTerminal({ pty,
   name: <canonical-identity>, iconPath, location: TerminalLocation.Panel })`.
   Tab name follows Principle II canonical form: `copilot(developer)`,
   `copilot(deputy)`, `copilot(solid-snake)`, etc. (matching the user's
   actual operating model — see Wiki Inbox/screenshots for context).
2. Implement `Pseudoterminal` with `onDidWrite`, `onDidClose`,
   `onDidChangeName`, `open()`, `close()`, `handleInput(data)`,
   `setDimensions(...)`.
3. On `open()`, write a one-shot banner to the buffer (cwd, adapter
   status, yolo state) — no per-agent React header needed; the tab
   name + the banner already convey identity. Then emit `OSC 633 ; A`
   prompt-start, `OSC 633 ; P ; Cwd=<path>`, `OSC 633 ; P ; HasRichCommandDetection=True`,
   then the visible prompt prefix (e.g. `arena ▸ `), then `OSC 633 ; B`
   prompt-end.
4. On `handleInput`, accumulate the line buffer, echo characters to
   the terminal (or honor bracketed-paste), handle backspace + arrow
   keys for history (slash commands `/help`, `/yolo`, `/clear` survive
   from the old TerminalController), and on Enter:
   - emit `OSC 633 ; E ; <escapedPromptText> ; <nonce>` (explicit
     command line, with nonce so VS Code unlocks Rich features)
   - emit `OSC 633 ; C` (pre-execution marker)
   - call `agent.submitPrompt(text, correlationId)`
5. Subscribe to `agent.onAssistantDelta` → `writeEmitter.fire(chunk)`
   for streaming deltas — raw chunks land in the buffer; ANSI sequences
   inside the chunks render natively.
6. Subscribe to `agent.onAssistantFinal` → ensure trailing CRLF; write
   the text if nothing was streamed (mirrors the A2 fix in the
   adversarial-review sweep).
7. Subscribe to `agent.onStatusChange` → on `idle` emit
   `OSC 633 ; D ; 0 ST` (success exit code), redraw the prompt;
   on `error` emit `D ; 1`. The exit code drives the gutter
   decoration color.
8. Permission modal stays exactly as-is (CD-07-reversal-orthogonal —
   modals are a `vscode.window.showInformationMessage` concern).
9. The activity-bar TreeView still fires `agent-arena.openAgent` per
   row click. `AgentPanelManager` becomes `AgentTerminalManager` —
   `Map<agentId, AgentTerminal>`, idempotent `open()`. When the user
   closes the terminal tab, `onDidCloseTerminal` fires; the manager
   drops the entry but the underlying Agent stays alive (CD-11 §6
   unchanged). Re-opening creates a new Terminal and replays the
   in-flight transcript via `writeEmitter.fire(...)`.
10. Delete `webview-src/` entirely once the rip-out is complete;
    drop the `@xterm/*` runtime deps + Vite plugins from `package.json`;
    drop the Vite webview build pipeline; CSP / nonce / HTML helpers
    go away. The `extension.cjs` bundle gets meaningfully smaller.
11. The `TerminalController` slash-command surface (`/help`, `/yolo`,
    `/clear`) survives the rip-out — those are agent-level UX, not
    xterm-level. We re-implement them in the Pseudoterminal's input
    handler. Output to a real terminal can use ANSI directly the same
    way we do today.

What we lose:
- The custom React-rendered `AgentPaneHeader` (avatar + status badge
  + cwd + adapter banner + gear). Replaced by the terminal tab name +
  icon (`new vscode.ThemeIcon('robot')`) + the one-shot banner written
  into the buffer at `open()`. The TreeView row already shows status +
  name + colored status dot.
- The bottom React `<CommandInput>` row. Replaced by the terminal's
  native input line (which is part of the buffer anyway).
- The settings gear icon (was non-functional anyway).

What we gain (recap):
- Native font, scrollback, find, link detection, copy-paste.
- Shell-integration features once `OSC 633` is wired.
- Terminal-inline-chat integration with our buffer.
- `@terminal` / `#terminalSelection` / `#terminalLastCommand` chat
  participants seeing our agent's output.
- VS Code theme alignment automatically (terminal colors, font).
- The shape scales naturally to multi-agent: every new `Agent`
  instance is one new terminal tab. No new UI surface needed.

---

— copilot(developer:opus-4.7)
