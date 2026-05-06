# Changelog

All notable changes to **agent-arena** are documented in this file.

The format is based on [Keep a Changelog 1.1.0][kac], and this project
adheres to [Semantic Versioning 2.0.0][semver].

The constitution at [`.specify/memory/constitution.md`][constitution]
mandates this discipline (see *Changelog discipline* under
*Development Workflow*). Every PR that introduces a user-visible change
MUST add an entry under `[Unreleased]` in the appropriate group, **and
every entry MUST end with an attributed-identity trailer** in the
canonical Principle II inline form — an em-dash followed by
`<provider>(<role>:<model>)`, e.g. `— copilot(developer:opus-4.7-xhigh)`.
Human-authored entries use `— @<github-handle>`. Multi-author entries
list each identity, comma-separated. Bullets without a trailer are a
Principle II violation and the deputy will flag them.

## [Unreleased]

### Added

- Spec Kit scaffolding (`.specify/`, `.github/agents/`, `.github/prompts/`,
  `.vscode/settings.json`). — copilot(developer:opus-4.7-xhigh)
- Project Constitution v1.0.0 (`.specify/memory/constitution.md`) defining
  Single Execution Authority, Attributed Identity, Test-First, Traceability
  to Originating Input, Gated Agent Output, and Observable & Interruptible
  Orchestration. The constitution governs the development of this codebase;
  product roles, services, and tech stack are defined in feature specs. — copilot(developer:opus-4.7-xhigh)
- Knowledge-base scaffolding rules: `wiki/index.md`, `wiki/raw/`,
  `wiki/docs/`, and `wiki/bugs/` (the last for accumulated bug reports
  with confirmed fixes). — copilot(developer:opus-4.7-xhigh)
- **Deputy agent**: source-controlled persona at `agents/deputy/persona.md`,
  reports directory at `agents/deputy/reports/`, top-level
  `agents/README.md` explainer, and trigger-phrase recognition wired
  into `.github/copilot-instructions.md`. The deputy is the formal
  owner and enforcer of the constitution; invoke with
  `> Start the deputy agent workflow`. — copilot(developer:opus-4.7-xhigh)
- **Changelog attribution rule.** Principle II of the constitution now
  explicitly covers changelog entries, and the *Changelog discipline*
  bullet under *Development Workflow* requires every bullet to end
  with the canonical inline-trailer identity. The deputy enforces
  this on every run (checklist item 8). — copilot(developer:opus-4.7-xhigh)
- `README.md` describing project structure and the Spec Kit workflow. — copilot(developer:opus-4.7-xhigh)
- This `CHANGELOG.md`, following Keep a Changelog 1.1.0. — copilot(developer:opus-4.7-xhigh)

### Changed

- Spec Kit branch & spec-directory naming switched from **sequential
  numbering** (`001-add-user-auth`) to **timestamp prefix**
  (`YYYYMMDD-HHMMSS-add-user-auth`). Parallel cloud agents no longer
  race for the next sequential number, and date-prefixed specs let us
  revisit old specs chronologically and re-assert their primary
  assumptions and goals over time. Affects `.specify/init-options.json`,
  `.specify/extensions/git/git-config.yml`,
  `.specify/extensions/git/config-template.yml`, and
  `.specify/extensions/git/extension.yml`. — copilot(developer:opus-4.7-xhigh)

[Unreleased]: https://github.com/jdylanmc/agent-arena/commits/main
[kac]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html
[constitution]: .specify/memory/constitution.md
