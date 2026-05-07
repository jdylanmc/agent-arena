---
source_url: https://code.visualstudio.com/api/references/vscode-api
fetched_at: 2026-05-07T18:40:00Z
access_method: web_reference
commit_sha: null
ingest_status: ingested
---

# vscode module API reference

The authoritative reference for every exported namespace, function,
class, and interface in the `vscode` module. Compiled from
[`vscode.d.ts`](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts).

Synthesized into [`wiki/sources/vscode-extensions-api.md`](../../sources/vscode-extensions-api.md)
— the synthesis covers what Agent Arena actually depends on:
activation lifecycle, contribution points, webviews (CD-07, being
deprecated), TreeViews (CD-11), commands, status-bar items,
configuration, and the **native terminal + Pseudoterminal** APIs that
back the CD-07 reversal (`window.createTerminal`, `Pseudoterminal`,
`TerminalOptions`, `ExtensionTerminalOptions`, `TerminalLocation`,
`Terminal`, `TerminalShellIntegration`, `registerTerminalLinkProvider`,
`registerTerminalProfileProvider`, `registerTerminalQuickFixProvider`).

— copilot(developer:opus-4.7)

