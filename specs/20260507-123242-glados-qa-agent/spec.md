# Feature Specification: GLaDOS-QA agent (directive + persona composition)

**Feature Branch**: `20260507-123242-glados-qa-agent`
**Created**: 2026-05-07
**Status**: Draft
**Input**: GitHub Issue [#3](https://github.com/jdylanmc/agent-arena/issues/3) — *GLaDOS QA Bot* (per Principle IV traceability)

## Overview

This spec scaffolds a new source-controlled agent — **GLaDOS-QA** —
that enforces quality and testability of the agent-arena codebase
autonomously, in the background. It also introduces a structural
change to the `agents/` directory: separating an agent's *directive*
(role) from its *persona* (voice) so the same role can be played by
different personas, and the same persona can play different roles.

The work is intentionally a **scaffolding-only** PR. It establishes
the agent's identity, surface paths, contracts, label set, and
issue-filing protocol. The agent's *first run* (under the first-run
posture defined by the directive) will discover which of its six
pillars are non-operational on the current `main` and file an opening
slate of Blocking Directives — that's the mechanism by which the
agent's full operationalization happens, not a follow-up
`/speckit.specify` from this spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-run audit and Blocking Directive slate (Priority: P1)

A maintainer merges the GLaDOS-QA scaffold to `main`, then triggers
GLaDOS-QA on the repository for the first time. With its reports
directory empty, GLaDOS-QA enters the **first-run posture**, walks
each of its six pillars, identifies which are non-operational, files
an opening slate of Blocking Directive issues against the repository
(at most 5 on this run), and posts an audit report to its reports
directory. No PR verdicts are rendered on this run.

**Why this priority**: This is the entire value of the directive +
persona separation and the Blocking Directive contract. The agent
becomes useful on day one without first requiring its full test
infrastructure to exist; it instead generates the inputs to the next
`/speckit.specify` cycles that will build that infrastructure. This
is the unblock for parallelizing QA infrastructure work.

**Independent Test**: A maintainer triggers
`> Initiate Aperture Science verification protocol` on a clean clone
of `main` immediately after this PR merges. Success looks like
(a) one report file appearing under `agents/glados-qa/reports/`,
(b) the report listing every pillar's operational state,
(c) at most 5 issues filed under the `glados-qa-blocked` label
matching the title contract, and (d) zero PR verdicts rendered.

**Acceptance Scenarios**:

1. **Given** an empty `agents/glados-qa/reports/` directory and a
   clean working tree, **When** GLaDOS-QA is invoked,
   **Then** GLaDOS-QA writes exactly one
   `YYYYMMDD-HHMMSS-glados-qa-report.md` audit report and files at
   most 5 Blocking Directives, applying no verdict labels on any PR.
2. **Given** an open Blocking Directive whose acceptance criteria are
   already satisfied by `main` (e.g. someone independently fixed it),
   **When** GLaDOS-QA runs, **Then** GLaDOS-QA closes the issue with
   a closing comment citing the satisfying commit sha.
3. **Given** an open Blocking Directive whose acceptance criteria are
   not yet satisfied, **When** GLaDOS-QA runs, **Then** GLaDOS-QA
   appends a Re-check log entry to the issue body and leaves it open.

---

### User Story 2 - Per-PR verdict loop with degraded pillars (Priority: P2)

After the first-run audit produces an opening slate of Blocking
Directives, GLaDOS-QA runs against open PRs. Some pillars are
operational (e.g. `tests-pass` if the test runner is wired up); some
are degraded (e.g. `coverage` if no coverage tool is configured yet).
GLaDOS-QA renders a verdict using only the operational pillars,
applies the appropriate labels, and lists every degraded pillar in a
dedicated section of the running checklist comment so reviewers know
what was *not* checked.

**Why this priority**: This validates the *Degraded operation* clause
— the principle that the directive's missing infrastructure must
never punish the PR author. P2 because it is meaningful only after
P1 has produced the opening Blocking Directive slate.

**Independent Test**: A test PR with a small, demonstrably-passing
change is opened against a working tree where `coverage` and
`sensory-analysis` pillars are degraded. Success looks like
(a) GLaDOS-QA posts a single running checklist comment listing the
operational pillars run and the degraded pillars skipped,
(b) the verdict reflects only the operational pillars' results, and
(c) the PR is not penalized (it can still earn `QA-VERIFIED`
when the operational pillars pass).

**Acceptance Scenarios**:

1. **Given** a PR with passing tests and degraded `coverage` /
   `sensory-analysis` pillars, **When** GLaDOS-QA runs the review
   loop, **Then** the verdict is `QA-VERIFIED` and the running
   checklist comment lists `## Degraded pillars` containing
   `coverage` and `sensory-analysis` with links to the corresponding
   open Blocking Directives.
2. **Given** a PR whose tests fail on attempt 1 and pass on attempts
   2 and 3 with no code-level explanation, **When** GLaDOS-QA runs,
   **Then** the verdict is `QA-DISAPPOINTMENT`, the `QA-FLAKY`
   annotation label is applied, the test is recorded under the
   `flakiness` pillar, and `QA-VERIFIED` is **not** applied.
3. **Given** a PR introducing 42 net-new lines none of which are
   covered by any test, **When** GLaDOS-QA runs and the `coverage`
   pillar is operational, **Then** the labels applied are
   `QA-DISAPPOINTMENT` and `CODE-COVERAGE-UNTESTED`.

---

### User Story 3 - Plug-and-play composition (Priority: P3)

A future maintainer wishes to give GLaDOS a different responsibility
(e.g. release-readiness review). They create a new directive at
`agents/directives/release-readiness.md` and a new composition file
at `agents/glados-release/agent.md` binding that directive with the
existing `agents/personas/glados.md`. The original `glados-qa`
composition keeps working, unchanged.

**Why this priority**: P3 because it validates the architectural
investment in the directive / persona split. The split has zero
value if it isn't reusable. P3 not P1 because the split's value to
the *current* PR is in the cleaner organization and the documentation
of the pattern; the *next* composition is hypothetical.

**Independent Test**: A second composition file is created in a
follow-up PR that reuses `agents/personas/glados.md` with a different
directive. The original GLaDOS-QA agent continues to operate with no
changes to its files.

**Acceptance Scenarios**:

1. **Given** the persona file `agents/personas/glados.md` and the
   directive file `agents/directives/qa.md`, **When** the composition
   `agents/glados-qa/agent.md` is read, **Then** the agent's role
   string, trigger phrase, and surface paths are fully specified
   without modifying either the persona or the directive.
2. **Given** a hypothetical future composition that pairs
   `agents/personas/glados.md` with a different directive, **When**
   the new composition file is added, **Then** no edits to
   `agents/personas/glados.md` are required.

---

### Edge Cases

- **Persona / directive disagreement**: per the composition's boot
  sequence, the directive wins (the persona only governs voice);
  the run report flags the disagreement.
- **Constitution / directive disagreement**: the constitution wins;
  the run report flags it for amendment via a normal PR.
- **Idempotency conflict**: an open Blocking Directive with the exact
  matching title already exists; GLaDOS-QA comments on the existing
  issue rather than opening a duplicate.
- **Per-run cap exceeded**: more than 5 candidate Blocking Directives
  are identified on a single run; the agent files 5 (in pillar order)
  and notes the deferred candidates in the run report.
- **Stale Blocking Directive**: an open issue has not been
  re-verified for 7+ days; the agent appends a staleness note to its
  Re-check log and flags it in the run report (does not auto-close).
- **Label does not exist in the repository**: the agent notes the
  intended label at the top of the running checklist comment and
  proceeds; label creation is a one-time setup task.
- **Crash with no reproducible repro command**: the crash is itself a
  finding (unreliable evidence); cross-cited under the `flakiness`
  pillar.
- **A second SOLID SNAKE / deputy / GLaDOS-QA comment race on the
  same PR**: each agent owns its own running checklist comment; the
  three never edit each other's comments. A PR may simultaneously
  carry verdicts from each agent.

## Requirements *(mandatory)*

### Functional Requirements

#### Directory and file structure

- **FR-001**: The repository MUST contain a directive file at
  `agents/directives/qa.md` describing the role-agnostic QA
  responsibility (six pillars, two verdicts, code labels,
  Blocking Directive contract, re-check loop, degraded operation,
  first-run posture, hard constraints).
- **FR-002**: The repository MUST contain a persona file at
  `agents/personas/glados.md` describing the GLaDOS character (voice,
  vocabulary, tonal rules, sample register), with no operational
  rules (no pillars, no verdicts, no labels, no contracts, no paths).
- **FR-003**: The repository MUST contain a composition file at
  `agents/glados-qa/agent.md` binding the QA directive and the GLaDOS
  persona, naming the role string `glados-qa`, the trigger phrase
  `> Initiate Aperture Science verification protocol`, the reports
  directory `agents/glados-qa/reports/`, and the artifacts directory
  `agents/glados-qa/artifacts/`.
- **FR-004**: The repository MUST contain placeholder
  `agents/glados-qa/reports/.gitkeep` and
  `agents/glados-qa/artifacts/.gitkeep` files so the directories are
  present from the very first run.

#### Verdicts and labels

- **FR-005**: GLaDOS-QA MUST render exactly one of two
  mutually-exclusive verdict labels on each PR it reviews:
  `QA-VERIFIED` or `QA-DISAPPOINTMENT`.
- **FR-006**: GLaDOS-QA MUST apply exactly one of three code labels
  orthogonal to the verdict label: `CODE-COVERAGE-HELD`, `CODE-COVERAGE-DROPPED`, or
  `CODE-COVERAGE-UNTESTED`.
- **FR-007**: When `CODE-COVERAGE-DROPPED` or `CODE-COVERAGE-UNTESTED` is applied,
  the verdict label MUST be `QA-DISAPPOINTMENT` (coverage failure
  forces QA-DISAPPOINTMENT).
- **FR-008**: When the verdict flips, the prior verdict label MUST be
  removed in the same operation.
- **FR-008a**: GLaDOS-QA MUST apply the `QA-FLAKY` annotation label
  whenever a test failed on the first attempt and subsequently
  passed within the rerun budget without a code-level explanation.
  `QA-FLAKY` is an annotation, not a verdict; it coexists with the
  verdict label and forces the verdict to `QA-DISAPPOINTMENT`.

#### Flakiness budget

- **FR-009**: When a test fails on the first attempt, GLaDOS-QA MUST
  rerun it up to two more times (3 attempts total).
- **FR-010**: A test that passes 3/3 after the first failure MUST
  fail the `flakiness` pillar; the verdict MUST be
  `QA-DISAPPOINTMENT` and the `QA-FLAKY` annotation label MUST be
  applied.
- **FR-011**: A test that fails on every attempt MUST fail the
  `tests-pass` pillar; the verdict MUST be `QA-DISAPPOINTMENT`.
- **FR-012**: A test that fails some attempts and passes others
  ("mixed") MUST fail both the `tests-pass` and `flakiness` pillars;
  the verdict MUST be `QA-DISAPPOINTMENT` and the `QA-FLAKY`
  annotation label MUST be applied.

#### Running checklist comment

- **FR-013**: Each PR GLaDOS-QA reviews MUST carry **exactly two**
  GLaDOS-QA comments, both created on first review and updated in
  place thereafter: (a) a *running checklist* comment tracking
  pillar findings across the six pillars, and (b) a dedicated
  *coverage report* comment. GLaDOS-QA MUST NOT post additional
  comments on the same PR.
- **FR-014**: The running checklist comment MUST contain a
  `## Degraded pillars` section listing every pillar with an open
  Blocking Directive on this run (with links).
- **FR-014a**: The coverage report comment MUST be posted on every
  PR GLaDOS-QA reviews, including PRs where the verdict is
  `QA-VERIFIED` and where coverage held. It MUST be updated in
  place on every subsequent review (never appended, never
  duplicated). It MUST contain the structure documented under
  *Coverage report comment* in `agents/directives/qa.md` (Updated
  timestamp, Base/Head/Delta header, applied code-coverage label,
  Net-new lines table, Uncovered ranges, Project totals, Notes).
- **FR-014b**: When the `coverage` pillar is degraded, the coverage
  report comment MUST still be posted; its data sections are
  replaced with a single block linking to the Blocking Directive.
  The comment MUST NOT be suppressed under degradation.

#### Blocking Directives

- **FR-015**: GLaDOS-QA MUST file Blocking Directive issues only for
  its own enabling infrastructure (the six pillars). Application
  bugs, feature requests, and developer preferences are explicitly
  out of scope.
- **FR-016**: Issue titles MUST match the form
  `[GLADOS-QA-BLOCKED] <pillar> — <one-line gap summary>`.
- **FR-017**: Every Blocking Directive MUST carry the labels
  `glados-qa-blocked`, `pillar:<name>`, and either `severity:hard`
  or `severity:soft`.
- **FR-018**: The issue body MUST contain the mandatory sections
  documented in `agents/directives/qa.md` (Filed by, Pillar blocked,
  Scope of impact, First observed, Last verified against, Re-check
  cadence, Symptom, Required capability, Acceptance criteria,
  Suggested spec scope, Verdict impact, Related, Re-check log).
- **FR-019**: GLaDOS-QA MUST be idempotent by title: before opening a
  new issue, it searches for an open issue with the exact same title
  under `glados-qa-blocked` and comments on it instead of opening a
  duplicate.
- **FR-020**: GLaDOS-QA MUST cap new Blocking Directives at 5 per
  run, prioritized by pillar order; deferred candidates are noted in
  the run report.
- **FR-021**: GLaDOS-QA MUST walk every open `glados-qa-blocked`
  issue per run, re-verify against the current working tree, and
  either close the issue (when acceptance criteria are met) or
  append a Re-check log entry.
- **FR-022**: An open Blocking Directive that has not been
  re-verified for 7+ days MUST be flagged in the run report as
  stale; it is not auto-closed.
- **FR-023**: GLaDOS-QA MUST NOT close, edit, or comment on issues
  not authored by an identity matching `<provider>(glados-qa:*)`.

#### Degraded operation and first-run posture

- **FR-024**: When a pillar has an open Blocking Directive,
  GLaDOS-QA MUST treat that pillar as degraded for the run, skip its
  check, and continue rendering verdicts using the remaining
  operational pillars.
- **FR-025**: A degraded pillar MUST NOT block `QA-VERIFIED` on
  its own; degraded pillars are surfaced in the
  `## Degraded pillars` section of the running checklist comment.
- **FR-026**: When `agents/glados-qa/reports/` is empty (only
  `.gitkeep` present), GLaDOS-QA MUST enter the first-run posture:
  full pillar audit, opening Blocking Directive slate (subject to
  the per-run cap of 5), one audit report, no PR verdicts.

#### Attribution and surfaces

- **FR-027**: Every report, comment, label, log line, issue body,
  and artifact GLaDOS-QA authors MUST carry the
  `<provider>(glados-qa:<model-id>)` attribution per Principle II.
- **FR-028**: GLaDOS-QA MUST NOT modify any file outside
  `agents/glados-qa/reports/` and `agents/glados-qa/artifacts/`.
- **FR-029**: GLaDOS-QA MUST NOT modify, skip, or disable any test
  in product code; MUST NOT silently update Golden Master baselines;
  MUST NOT push report commits without human approval.

#### Documentation

- **FR-030**: `agents/README.md` MUST document the new
  directive / persona / composition pattern and list GLaDOS-QA under
  *Available agents* with its trigger phrase, role string, and
  reports directory.
- **FR-031**: `CHANGELOG.md` MUST contain a `[Unreleased] / Added`
  bullet describing the new agent, ending with the canonical
  Principle II inline-trailer attribution.

### Key Entities

- **Directive** — a role-agnostic Markdown file under
  `agents/directives/` describing what an agent does (verdicts,
  pillars, contracts, hard constraints). Composable with any
  persona.
- **Persona** — a directive-agnostic Markdown file under
  `agents/personas/` describing how an agent speaks (name, voice,
  vocabulary, tonal rules). Composable with any directive.
- **Composition** — a Markdown file under `agents/<composed-name>/`
  binding one directive and one persona, naming the role string,
  trigger phrase, and surface paths. The composed agent is the
  thing that actually runs.
- **Blocking Directive** — a GitHub Issue authored by GLaDOS-QA
  documenting that one of her pillars cannot operate on the current
  working tree. The mechanism by which the agent advocates for its
  own enabling infrastructure.
- **Pillar** — one of six operational axes GLaDOS-QA evaluates
  (`tests-pass`, `coverage`, `crash-triage`, `sensory-analysis`,
  `flakiness`, `test-first`). Each pillar can be operational or
  degraded on any given run.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After this PR merges, an empty-state invocation of
  GLaDOS-QA on a fresh clone of `main` produces exactly one audit
  report file under `agents/glados-qa/reports/` and zero PR
  verdicts.
- **SC-002**: After this PR merges, an empty-state invocation of
  GLaDOS-QA produces an opening slate of Blocking Directive issues
  (at most 5), each matching the title contract and carrying the
  three mandatory labels.
- **SC-003**: A second `agents/<composed-name>/agent.md` file added
  in a follow-up PR can reuse the existing
  `agents/personas/glados.md` without any edits to the persona file.
- **SC-004**: The deputy and SOLID SNAKE personas continue to
  operate unchanged after this PR (no edits to their persona files,
  reports directories, or trigger phrases).
- **SC-005**: A PR with degraded `coverage` and operational
  `tests-pass` can earn `QA-VERIFIED` when its tests pass —
  i.e. the directive's missing infrastructure does not penalize PR
  authors.

## Assumptions

- The agent-arena codebase will at some point gain a configured test
  runner, coverage tool, UI test harness, and CI runner. The
  Blocking Directive contract assumes these are *expected* future
  capabilities and that filing issues against them is the correct
  way to advocate for them. (PR #5, the
  `scaffold-application` PR, is the in-flight work that will
  introduce many of them.)
- The host runtime can spawn sub-agents and surface their output
  back to the human (GitHub Copilot CLI's `task` tool, Claude's
  sub-agents, etc.). This is a runtime capability, not a spec
  decision.
- Existing deputy and solid-snake personas continue to use their
  legacy `agents/<name>/persona.md` layout. The directive / persona
  split is opt-in for new agents; we do not refactor existing
  personas in this PR.
- The repository's GitHub configuration grants the host runtime the
  scoped permissions GLaDOS-QA needs (issues:write for issue filing,
  pull-requests:write for label and comment operations). Mechanism
  details (direct API vs staging directory) are deferred to the
  composition file's *Issue-filing mechanism* section and the run
  report.
- The labels named in this spec are created in the repository as a
  one-time setup task; until they exist, GLaDOS-QA notes the
  intended label at the top of the running checklist comment and
  continues without applying it.

## Traceability

- **Originating input**: GitHub Issue
  [#3](https://github.com/jdylanmc/agent-arena/issues/3) — *GLaDOS QA Bot*.
- **Constitution**: `.specify/memory/constitution.md` — Principle II
  (Attributed Identity), Principle III (Test-First), Principle IV
  (Traceability to Originating Input), Principle V (Gated Agent
  Output), Principle VI (Observable & Interruptible Orchestration),
  EI-1 (Full agent-observable execution; canonical log envelope and
  `correlation_id` propagation are inputs to the `crash-triage`
  pillar's artifact contract), EI-2 (JSON state harnesses; harness
  versions are part of the crash artifact's `env_fingerprint`),
  P-1 (No real malicious data in tests, fixtures, or source).
- **Related agents**: `agents/deputy/persona.md`,
  `agents/solid-snake/persona.md` (independence boundary documented
  in the composition file).
- **Related PR**: #5 (`scaffold-application`, in-flight) — the test
  runner, coverage tool, and UI test harness it will introduce are
  candidate inputs to GLaDOS-QA's pillars; gaps in #5 will become
  Blocking Directive subjects on GLaDOS-QA's first run.
