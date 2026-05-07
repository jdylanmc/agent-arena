# Agent Arena — Wiki

The project's durable knowledge base, per `constitution.md` Principle IV
(Traceability) and the wiki upkeep contract in *Development Workflow*.
Every PR that introduces durable knowledge MUST update this wiki; every
bug-fix PR MUST add a `wiki/bugs/` entry.

## Layout

| Directory | Purpose |
|---|---|
| `wiki/sources/` | Synthesized, agent-readable knowledge pages — one per upstream source (SDK, third-party API, design doc). |
| `wiki/raw/<source>/` | Immutable source-pointer files for ingested upstream material. Provenance (URL, captured-at date, access method, commit SHA, ingest status) only — not the doc body. |
| `wiki/docs/` | Architecture decisions, integration notes, persona behavior contracts (project-internal). |
| `wiki/bugs/` | Every reproduced and fixed bug, captured as a durable record: symptom, reproduction, root cause, fix, verification. |
| `wiki/glossary/` | Project terminology. |

## Sources (synthesis pages)

| Page | Subject | FR / CD |
|---|---|---|
| [`sources/copilot-sdk.md`](sources/copilot-sdk.md) | `@github/copilot-sdk` — JSON-RPC SDK for programmatic control of the GitHub Copilot CLI | FR-027 |
| [`sources/vscode-extensions-api.md`](sources/vscode-extensions-api.md) | VS Code Extensions API — contribution points + runtime APIs | FR-028 |
| [`sources/vscode-source.md`](sources/vscode-source.md) | VS Code source itself — theme/branding alignment, core libraries + architectural patterns, terminal-integration deep-dive | reference |
| [`sources/vscode-copilot.md`](sources/vscode-copilot.md) | GitHub Copilot integration in VS Code — auth providers, chat-extensions API, inline-completions, telemetry posture | reference, CD-10 |
| [`sources/vscode-terminals.md`](sources/vscode-terminals.md) | VS Code integrated terminal — user-facing feature surface + `OSC 633` shell-integration protocol; informs the CD-07 reversal toward `vscode.Pseudoterminal` | reference, CD-07 reversal |

## Glossary

| Term | Page |
|---|---|
| Bot Fight | [`glossary/bot-fight.md`](glossary/bot-fight.md) — historical alias for Agent Arena |

## Bugs

(none yet — first bug-fix PR populates this directory per the constitution's *Wiki upkeep* contract.)

## Adding to the wiki

1. **New source ingestion.** Create `wiki/sources/<source>.md` (synthesis), seed `wiki/raw/<source>/` with pointer files (one per snapshot — see existing `wiki/raw/copilot-sdk/*.md` for the schema), cross-link from this index.
2. **New decision / pattern.** Create `wiki/docs/<topic>.md`, cross-link from this index.
3. **Bug fix.** Create `wiki/bugs/YYYYMMDD-<short-slug>.md` — symptom, reproduction, root cause, fix, verification. Cross-link from this index.

The wiki is authored under the canonical Principle II identity. Every page MUST end with an attribution footer (`— copilot(developer:opus-4.7)` or equivalent) so authorship is traceable.

— copilot(developer:opus-4.7)
