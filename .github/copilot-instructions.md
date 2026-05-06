<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

## Read this first

This repository's binding rules live in the project constitution at
[`.specify/memory/constitution.md`](../.specify/memory/constitution.md).
The constitution is authoritative; this file defers to it. Read it
end-to-end before doing any work in this repository. If anything here
appears to conflict with the constitution, the constitution wins.

Every commit, PR body, comment, log entry, and changelog entry you author
MUST carry the canonical Principle II identity
`<provider>(<role>:<model>)` (e.g. `copilot(developer:opus-4.7-xhigh)`).
Anonymous output is forbidden.

## Spec Kit is the workflow

Adhering to Spec Kit is non-negotiable. Every feature change MUST flow
through it:

1. `/speckit.specify` — write or update the spec for the change you are
   about to make. The spec MUST link to the originating issue or wiki
   pointer (Principle IV — Traceability to Originating Input).
2. `/speckit.plan` — break the spec into a plan.
3. `/speckit.tasks` — generate tasks. Failing tests MUST be scheduled
   before their corresponding implementation (Principle III — Test-First,
   NON-NEGOTIABLE).
4. `/speckit.implement` — execute the tasks under the Red-Green-Refactor
   cycle.

Drive-by changes that bypass Spec Kit are out of scope; route them
through a spec.

Branch and spec-directory naming uses **timestamp prefix**
(`YYYYMMDD-HHMMSS-slug`), configured in
`.specify/extensions/git/git-config.yml`. Sequential numbering is
intentionally disabled so parallel agents on independent PR checkouts
never race for numbers, and so old specs sort chronologically and can be
revisited to re-assert their primary assumptions.

## The wiki

The repository's `wiki/` directory is the project's durable knowledge
base. Its purpose is to make agentic work auditable and re-usable across
sessions, across agents, and across machines. Treat it as the canonical
memory of the project.

- `wiki/index.md` — the entry point. Always start here.
- `wiki/raw/` — pointers to original source material the project has
  ingested (issues, PRs, external articles, design docs).
- `wiki/docs/` — synthesized, agent-readable knowledge pages
  (architecture decisions, third-party integration notes, persona
  behavior contracts).
- `wiki/bugs/` — every reproduced and fixed bug, captured as a durable
  record: symptom, reproduction, root cause, fix, verification.

Before answering a domain question, read `wiki/index.md` first; before
producing new analysis, check that it does not already live there. PRs
that introduce durable knowledge MUST update the wiki, and bug-fix PRs
MUST add a `wiki/bugs/` entry — see *Wiki upkeep* in the constitution's
Development Workflow section for the full contract.

(The `wiki/` directory itself is established by the first feature spec
referenced from issue #1 and may not yet be present on `main`.)

## Project agents

Source-controlled agent personas live under
[`agents/`](../agents/README.md). The **deputy** is the formal owner and
enforcer of the constitution; its persona, scope, output format, and
trigger phrase are all defined by *Constitution enforcement (the Deputy)*
in the constitution's Governance section. Do not paraphrase that
contract here — read it from the constitution.
