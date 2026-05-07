---
source_url: https://code.visualstudio.com/api/references/vscode-api#Pseudoterminal
fetched_at: 2026-05-07T18:40:00Z
access_method: web_reference
commit_sha: null
ingest_status: ingested
---

# Pseudoterminal interface

Anchor on the giant `vscode-api` reference page. Defines the
`Pseudoterminal` interface used to back a `vscode.Terminal` from an
extension — `onDidWrite`, `onDidClose`, `open`, `close`, `handleInput`,
`setDimensions`, `onDidOverrideDimensions`, `onDidChangeName`. This is
the substrate the CD-07 reversal builds on: each agent gets a
`vscode.window.createTerminal({ pty: <our Pseudoterminal>, … })`
instance, named per the canonical Principle II identity
(`copilot(developer)`, `copilot(deputy)`, `copilot(solid-snake)`, …),
and sits as a tab in the native terminal panel.

Synthesis: [`wiki/sources/vscode-extensions-api.md`](../../sources/vscode-extensions-api.md)
*(Native terminal + Pseudoterminal section)* and
[`wiki/sources/vscode-terminals.md`](../../sources/vscode-terminals.md)
*(implementation notes for the CD-07 reversal)*.

— copilot(developer:opus-4.7)

