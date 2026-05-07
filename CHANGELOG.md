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

- **GLaDOS-QA composed agent** — a source-controlled agent that
  enforces quality and testability of the codebase autonomously, in
  the background. Renders two mutually-exclusive verdicts
  (**QA-VERIFIED** ✅ / **QA-DISAPPOINTMENT** ❌) plus an orthogonal
  **QA-FLAKY** ⚠ annotation label that always coexists with
  `QA-DISAPPOINTMENT` (a test that passes on retry without
  explanation is never benign). Code-coverage labels (`CODE-COVERAGE-HELD` /
  `CODE-COVERAGE-DROPPED` / `CODE-COVERAGE-UNTESTED`) explain the verdict's
  relationship to coverage. Six pillars: `tests-pass`, `coverage`,
  `crash-triage`, `sensory-analysis`, `flakiness`, `test-first`.
  Maintains **two PR comments updated in place** per PR — a
  *running checklist* tracking pillar findings, and a dedicated
  *coverage report* posted on every PR (including PRs where
  coverage held) — and files attributed reports under
  `agents/glados-qa/reports/` plus crash and UI artifacts under
  `agents/glados-qa/artifacts/`. Identity:
  `copilot(glados-qa:<model>)`. Trigger phrase:
  `> Initiate Aperture Science verification protocol`. Operates
  independently of the deputy and SOLID SNAKE. Originating input:
  issue #3. Spec: `specs/20260507-123242-glados-qa-agent/spec.md`. — copilot(developer:opus-4.7)
- **Directive / persona composition layout** under `agents/`. Splits
  an agent's role-agnostic *directive* (responsibilities, verdicts,
  contracts, hard constraints) from its directive-agnostic *persona*
  (name, voice, vocabulary, tonal rules), then composes them in a
  per-agent file. The split lets the same directive be played by
  different personas, and the same persona play different
  directives. Adds three new directories — `agents/directives/`,
  `agents/personas/`, and the composed `agents/glados-qa/` — and
  documents the new pattern alongside the legacy single-file persona
  layout in `agents/README.md`. Existing deputy and SOLID SNAKE
  personas remain on the legacy layout (the split is opt-in).
  — copilot(developer:opus-4.7)
- **QA directive** (`agents/directives/qa.md`). Role-agnostic
  Quality & Testability enforcement directive. Defines the six
  pillars, the two-verdict surface (`QA-VERIFIED` /
  `QA-DISAPPOINTMENT`), the orthogonal `QA-FLAKY` annotation label
  (always forces `QA-DISAPPOINTMENT`), the code-coverage labels, the
  three-attempt flakiness budget (1 fail + 2 retries; flakiness is
  never benign — a test that passes on retry without explanation
  fails the `flakiness` pillar), the **dedicated coverage report
  comment** posted on every PR and updated in place (distinct from
  the running checklist; required even when coverage held), the
  crash artifact contract (exit code, signal, `correlation_id`,
  last 100 log lines, env fingerprint, repro command, repro
  attempts), the test-vs-code failure classification
  (`code-failure` / `test-failure` / `infra-failure`), the
  **Blocking Directive** issue contract (title form, mandatory
  labels, body sections, idempotency by title, per-run cap of 5,
  re-check loop with 7-day stale-issue safeguard), the **degraded
  operation** clause (a pillar with an open Blocking Directive is
  skipped for the run; the agent continues rendering verdicts using
  the remaining operational pillars; PRs are never penalized for
  the directive's missing infrastructure), and the **first-run
  posture** (empty reports directory triggers a full pillar audit
  before any PR verdicts). Persona-agnostic. — copilot(developer:opus-4.7)
- **GLaDOS persona** (`agents/personas/glados.md`). Voice-only
  Aperture Science register: clinical, composed, quietly
  disappointed; never insults the subject; never loses composure;
  never gloats on a sign-off. Includes vocabulary table mapping
  generic concepts to GLaDOS-flavored terms (chamber / experiment /
  subject / artifacts / sign-off / disappointment / inconclusive /
  redundancy allowance / logged operational deficiency / unmonitored
  axis / reference profile / measurement) for use in narrative
  prose only — machine-readable identifiers (label names, JSON keys,
  file paths) stay in directive form. No copyrighted material from
  the source setting; voice and vocabulary only.
  Directive-agnostic — pluggable into future non-QA directives.
  — copilot(developer:opus-4.7)
- **GLaDOS-QA composition** (`agents/glados-qa/agent.md`). Binds the
  QA directive and the GLaDOS persona, names the role string
  `glados-qa` for Principle II attribution, names the trigger phrase
  `> Initiate Aperture Science verification protocol`, names the
  reports and artifacts directories, defines the authorized label
  set, defines the issue-filing surface (issues authored by an
  identity matching `<provider>(glados-qa:<model>)` only),
  documents two admissible issue-filing mechanisms (direct GitHub
  API with a fine-grained `issues:write` token vs staging
  directory under `agents/glados-qa/issues/staging/`), and
  documents the cross-agent independence boundary with deputy and
  SOLID SNAKE. — copilot(developer:opus-4.7)
- **SOLID SNAKE agent persona** under `agents/solid-snake/`— a
  read-only, source-controlled agent designed to be spawned
  autonomously in the background to monitor the repository for SOLID
  object-oriented design violations (SRP, OCP, LSP, ISP, DIP). Renders
  exactly two verdicts (**SOLID** / **NOT-SOLID**, the latter rendered
  red where surfaces support color), maintains a single in-place
  *running checklist* PR comment per PR that he updates as the PR
  evolves, applies `SOLID` / `NOT-SOLID` labels, and files attributed
  reports under `agents/solid-snake/reports/`. Identity:
  `copilot(solid-snake:<model>)`. Trigger phrase:
  `> Start the SOLID SNAKE agent workflow`. `agents/README.md` updated
  to list him under *Available agents*. — copilot(developer:opus-4.7-xhigh)
- **Engineering Invariants section** in the constitution (between
  Prohibitions and Knowledge Base). Holds binding architectural
  properties of the shipped product that the constitutional dev model
  depends on. Numbered sequentially (EI-1, EI-2, ...) for precise
  citation. Specs MAY refine but MAY NOT relax. — copilot(developer:opus-4.7-xhigh)
- **EI-1: Full agent-observable execution.** Mandates structured
  single-line JSON logs against a canonical schema documented in
  `wiki/docs/log-schema.md`, stable namespaced/versioned event
  identifiers (e.g. `agent.invoke.started.v1`), end-to-end
  `correlation_id` propagation across agents/processes/async boundaries,
  zero ad-hoc `console.log`/`print` (lint enforced), and the
  operational bar that any failure MUST be diagnosable from logs
  alone. — copilot(developer:opus-4.7-xhigh)
- **EI-2: JSON state harnesses.** Mandates that all behavior-relevant
  application state is representable as a single round-trippable
  JSON harness, with replace-semantics `loadHarness`, in-process
  `unload`, top-level `harness_version`, deterministic field ordering
  for diffing, and source-controlled scenario fixtures under
  `tests/harnesses/` (subject to P-1). — copilot(developer:opus-4.7-xhigh)
- Deputy checklist grew item 12 to verify EI compliance on every run
  (`agents/deputy/persona.md`). — copilot(developer:opus-4.7-xhigh)
- **Prohibitions section** in the constitution, sitting between Core
  Principles and Knowledge Base. Negative rules (what agents MUST NOT
  do), numbered sequentially (P-1, P-2, ...) for precise citation by
  the deputy. Violations are hard merge blockers. — copilot(developer:opus-4.7-xhigh)
- **P-1: No real malicious data in tests, fixtures, or source.** First
  prohibition. Forbids committing functional attack payloads (prompt
  injection, XSS, SQLi, command injection, secret-extraction probes,
  etc.) into the repository — including tests, fixtures, docs, READMEs,
  and changelog entries. Synthetic placeholders are required; real
  payloads, when genuinely needed, MUST live in a gated adversarial
  corpus outside source control and be referenced by hash/ID. Includes
  a remediation requirement for already-committed violations (history
  rewrite + force-push, not just `HEAD` removal). The deputy's per-run
  checklist grew item 11 to scan for prohibition violations. — copilot(developer:opus-4.7-xhigh)
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

- **P-1 self-application carve-out** (resolves #6). Added a
  *Self-application exception* clause to P-1 in
  `.specify/memory/constitution.md`. The literal instruction-override
  probe that appears in P-1's own teaching prose and `❌` code example
  is now explicitly exempted from the P-1 prohibition, scoped strictly
  to the P-1 section of the constitution document. The exception does
  not extend to any other documentation, test, fixture, comment, or
  commit anywhere else in the repository, and drift outside that
  section is a P-1 violation in the normal way. Chosen as **Fix B**
  from the deputy's two-option recommendation in issue #6 (Fix A
  would have required a history rewrite + force-push to `main`).
  Trade-off acknowledged: prohibitions now admit a single,
  minimally-scoped self-application carve-out. — copilot(developer:opus-4.7)
- `.github/copilot-instructions.md` rewritten for clarity. Dropped the
  sub-agent-spawning procedural prose (deputy invocation is owned by
  the constitution, not by host-runtime instructions). New structure:
  constitution pointer with attribution reminder, "Spec Kit is the
  workflow" (non-negotiable adherence), "The wiki" (purpose and
  structure of the knowledge base), and a one-paragraph `agents/`
  pointer that defers to the constitution's Governance section for
  deputy details. — copilot(developer:opus-4.7-xhigh)
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
