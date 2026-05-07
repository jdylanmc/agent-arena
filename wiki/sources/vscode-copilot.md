# GitHub Copilot in VS Code — integration deep-dive

This is the synthesis page for **how Copilot is integrated into VS Code itself** — distinct from [`wiki/sources/copilot-sdk.md`](copilot-sdk.md), which covers the standalone `@github/copilot-sdk` package. The two surfaces share infrastructure (the same backend models, the same auth providers) but adopt different VS Code APIs.

Agent Arena's job is to feel like a **first-class Copilot surface** — same auth flow, same telemetry posture, same command-palette idioms, same status-bar conventions. CD-10 makes this binding. This page documents the patterns to mimic.

- **Repo (Copilot extension)**: closed-source, but its `package.json` + activation events are observable in any VS Code install.
- **Repo (Copilot Chat extension)**: closed-source. Public API for chat-extensions is documented at [`code.visualstudio.com/api/extension-guides/chat`](https://code.visualstudio.com/api/extension-guides/chat).
- **Repo (`vscode` proper)**: [`microsoft/vscode`](https://github.com/microsoft/vscode) — hosts the **chat-extensions API**, the **language-model API**, and the **inline-completions API** that Copilot consumes.

> Raw doc snapshots: [`wiki/raw/vscode-copilot/`](../raw/vscode-copilot/).

## The four surfaces Copilot ships in VS Code

| Surface | API | Where it appears | What we adopt |
|---|---|---|---|
| **Inline completions** | `vscode.languages.registerInlineCompletionItemProvider` | Ghost text in the editor as you type. | Pattern: a registered provider hooked into a language API. We don't need this surface for the scaffold, but the registration idiom is the model. |
| **Copilot Chat** | `vscode.chat.createChatParticipant` (the chat-extensions API) | The Chat view, `@copilot` participant, slash commands. | The `@`-prefixed participant idiom + slash commands map directly onto our future *background-agent* surface. |
| **Code actions / lenses** | `vscode.languages.registerCodeActionProvider` | "Quick Fix" lightbulb + lensed actions. | Future spec — Agent Arena agents may surface as code actions ("Have Main Developer reproduce this bug"). |
| **Standalone CLI** (`@github/copilot-sdk`) | spawn a JSON-RPC server | Programmatic access from any Node app. | This is what `CopilotSdkAdapter` wraps. |

The SDK is the most distant from VS Code's UI affordances; the chat-extensions API is the closest. CD-08's React shell with sidebar + `>_  Main Developer` per-agent header is visually closer to the Chat view than to inline completions.

## Auth flow (and why it matters for us)

VS Code's authentication is a **provider model**: extensions register an `AuthenticationProvider`, and other extensions (or VS Code itself) request sessions via `vscode.authentication.getSession(providerId, scopes, ...)`.

Two providers matter for Copilot:

1. **`github`** — GitHub's main OAuth provider. Built into VS Code. Returns a `vscode.AuthenticationSession` with a token + scopes. Used by the Copilot extension for chat + inline completions.
2. **`microsoft`** — Microsoft Entra (formerly Azure AD). Used by Copilot Enterprise tenants for SSO.

The standalone Copilot CLI binary (`@github/copilot/copilot.exe`) does **NOT** read these VS Code-managed sessions. It has its own auth: stored OAuth under `~/.copilot/`, the `gh CLI` credential helper, or the `GH_TOKEN`/`GITHUB_TOKEN` env vars (priority order in [`wiki/sources/copilot-sdk.md`](copilot-sdk.md)).

**Implication for Agent Arena**: a user signed into VS Code's GitHub Copilot extension is **not automatically signed into the Copilot CLI** that our `CopilotSdkAdapter` spawns. There are two ways to bridge this:

- **Pull a token from VS Code's auth provider** at adapter-start time and pass it via the SDK's `githubToken` constructor option:
  ```ts
  const session = await vscode.authentication.getSession("github", [
      "read:user", "user:email"
  ], { createIfNone: false });
  if (session) {
      new CopilotClient({ githubToken: session.accessToken, /* ... */ });
  }
  ```
  Caveat: the scopes VS Code grants the `github` provider may not match what the CLI expects. We'd request the same scopes the Copilot extension uses (Copilot extension's manifest in any installed VS Code lists them in the activation handshake).

- **Defer to `gh CLI auth`** and document that the user must run `gh auth login` once. Simpler; documented in `extension/README.md`.

Agent Arena currently uses option B (`useLoggedInUser: true` on the SDK client). Option A is a future improvement — it removes the manual `gh auth login` step and makes the adapter feel like the Copilot extension's auth flow.

## Telemetry pipeline

VS Code's Copilot extension routes events through:
1. **`vscode.env.telemetryConfiguration`** — VS Code's user-controlled telemetry kill-switch. Honored by the extension; if the user disables telemetry in VS Code, Copilot's pipeline goes silent.
2. **A logger via `vscode.window.createOutputChannel(..., { log: true })`** — writes to a `LogOutputChannel` the user can open via *Output → GitHub Copilot*.
3. **OpenTelemetry to GitHub's collector** — the SDK's bundled CLI emits OTel spans/events to GitHub-internal infrastructure when authenticated.

**Pattern Agent Arena adopts**:
- **Honor `vscode.env.isTelemetryEnabled`** — when false, the canonical EI-1 log still writes locally (it's diagnostic, not telemetry), but any future external pipeline MUST gate on this flag.
- **Expose a `LogOutputChannel`** alongside the JSONL log so users have a familiar VS Code surface for diagnostics. Currently we only expose the file via *Agent Arena: Show Trace Log*; adding `vscode.window.createOutputChannel("Agent Arena", { log: true })` would let users tail events without leaving the workbench.
- **Set the SDK's telemetry source name to `"agent-arena"`** so GitHub's pipeline can attribute events to our extension when (eventually) that field is exposed on `CopilotClientOptions`.

## Command-palette + status-bar idioms

The Copilot extension contributes ~30 commands of the shape `github.copilot.*` (e.g. `github.copilot.openSettings`, `github.copilot.chat.startSession`). Every user-visible action — sign in, sign out, open chat, accept inline completion, reject inline completion — is a command.

Status-bar layout:
- **Left side** (high priority) — `Copilot` text + status icon (idle / thinking / disabled / signed-out). Click opens a quickpick with sign-in / settings / status.
- The icon uses the `$(copilot)` codicon (yes, Copilot has its own codicon).

**Pattern Agent Arena adopts**:
- All commands are `agent-arena.<verb>.<noun>` (`agent-arena.openPrimaryAgent`, `agent-arena.showTraceLog`, `agent-arena.toggleYolo`, `agent-arena.harness.export`, `agent-arena.harness.import`). Already in place per CD-10 §3.
- The yolo status-bar item already follows the pattern — left-aligned, click-to-toggle. We'd add an *adapter status* indicator next to it (idle / connecting / error / demo) once we polish the surface.
- Per CD-10 §2, future status-bar icons should reach codicons (e.g. `$(comment-discussion)` or `$(robot)` for the agent state) instead of bespoke SVGs.

## Chat-extensions API (the model for our background-agent future spec)

`vscode.chat.createChatParticipant(id, handler)` is VS Code's contract for adding a chat participant. The participant declares:

- **A unique ID** (e.g. `"github.copilot.chat"`).
- **A handler function** that receives `(request: ChatRequest, context: ChatContext, stream: ChatResponseStream, token: CancellationToken)` and writes responses by calling `stream.markdown(...)` / `stream.button(...)` / `stream.reference(...)`.
- **Slash commands** registered as `participant.iconPath`, `participant.followupProvider`, etc.

Why we don't use this *yet*: CD-08 reserves the `Workflow` tab + future background agents for a follow-up spec. When that spec lands, mapping background agents to chat participants would let the user invoke them from VS Code's Chat view (e.g. `@codereviewer review this PR`) — and that's a VS Code-native idiom, not bespoke. Reference for that future spec.

## Files / docs we cite as reference

Pointer files in [`wiki/raw/vscode-copilot/`](../raw/vscode-copilot/) carry the URLs. The most relevant:

- **Copilot extension overview**: [`code.visualstudio.com/docs/copilot/overview`](https://code.visualstudio.com/docs/copilot/overview).
- **Chat extensions API guide**: [`code.visualstudio.com/api/extension-guides/chat`](https://code.visualstudio.com/api/extension-guides/chat).
- **Inline-completions API**: [`code.visualstudio.com/api/references/vscode-api#InlineCompletionItemProvider`](https://code.visualstudio.com/api/references/vscode-api#InlineCompletionItemProvider).
- **Authentication API**: [`code.visualstudio.com/api/references/vscode-api#authentication`](https://code.visualstudio.com/api/references/vscode-api#authentication).
- **Language model API**: [`code.visualstudio.com/api/extension-guides/language-model`](https://code.visualstudio.com/api/extension-guides/language-model).
- **Telemetry / privacy**: [`code.visualstudio.com/api/extension-guides/telemetry`](https://code.visualstudio.com/api/extension-guides/telemetry).
- **Copilot CLI README**: [`docs.github.com/en/copilot/concepts/cli`](https://docs.github.com/en/copilot/concepts/cli).

## How Agent Arena uses this reference

| Concern | Where it lands in our code |
|---|---|
| SDK adapter wrapping the standalone CLI | [`extension/src/sdk/CopilotSdkAdapter.ts`](../../extension/src/sdk/CopilotSdkAdapter.ts) |
| Adapter selector with auth probe | [`extension/src/sdk/selectAdapter.ts`](../../extension/src/sdk/selectAdapter.ts) |
| Future: pull token from `vscode.authentication.getSession("github", ...)` | Same file, replacing `useLoggedInUser` |
| Command surface | [`extension/package.json`](../../extension/package.json) `contributes.commands` |
| Status-bar idiom | [`extension/src/state/yoloStatusBar.ts`](../../extension/src/state/yoloStatusBar.ts) |
| Telemetry honor `vscode.env.isTelemetryEnabled` | Future — gate inside [`extension/src/telemetry/EventEmitter.ts`](../../extension/src/telemetry/EventEmitter.ts) |
| Future: chat-extensions participants for background agents | Future spec, hooked into `vscode.chat.createChatParticipant` |

— copilot(developer:opus-4.7)
