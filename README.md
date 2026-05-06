# agent-arena

An orchestration engine for managing multiple autonomous agents — delivered
as a Visual Studio Code extension. Agent Arena turns a single human prompt
into an attributed, gated, observable collaboration between a designated
**developer** agent and any number of read-only **advisor** agents, with a
dedicated **curator** agent maintaining an internal LLM wiki.

> *"Agents may act autonomously, but execution is controlled, attributed,
> observable, and always interruptible by the human."*

## Project Structure

This repository is governed by [Spec Kit](https://github.com/github/spec-kit).
The authoritative documents are:

- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) —
  the project constitution. Read it before making any architectural,
  product, or implementation decision.
- `.specify/templates/` — Spec Kit templates for specs, plans, tasks, and
  checklists.
- `specs/` — feature specifications (created with `/speckit.specify`).
- `wiki/` — Karpathy-style LLM wiki maintained by the curator agent
  (lands in the first feature spec; see [issue #1][issue-1]).

## Spec Kit Workflow

Use these slash commands inside a Spec Kit-aware coding agent:

1. `/speckit.constitution` — review or amend the constitution.
2. `/speckit.specify` — create a feature spec on a numbered branch.
3. `/speckit.clarify` — de-risk ambiguous areas (optional).
4. `/speckit.plan` — produce an implementation plan.
5. `/speckit.tasks` — generate actionable, test-first tasks.
6. `/speckit.implement` — execute the plan.

## Tooling

- TypeScript (VS Code extension target)
- esbuild for bundling
- vitest for tests (Test-Driven Development is non-negotiable —
  see Principle III of the constitution)
- ESLint for linting
- npm for package management

[issue-1]: https://github.com/jdylanmc/agent-arena/issues/1
