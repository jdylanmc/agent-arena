<!--
SYNC IMPACT REPORT
==================
Version change: (initial) → 1.0.0
Bump rationale: Initial ratification of the Agent Arena Constitution per issue #1.

Modified principles: (none — initial)
Added sections:
  - Core Principles (I. Single Execution Authority, II. Attributed Identity,
    III. Test-First (NON-NEGOTIABLE), IV. Traceability to Originating Input,
    V. Gated Agent Output, VI. Observable & Interruptible Orchestration)
  - Product Constraints
  - Knowledge Base (LLM Wiki)
  - Development Workflow
  - Governance
Removed sections: (none — initial)

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — no change required (already
    references "Constitution Check" generically; constitution principles
    are evaluated at plan time without template edits)
  - ✅ .specify/templates/spec-template.md — no change required
  - ✅ .specify/templates/tasks-template.md — no change required
  - ✅ README.md — updated to point at the constitution and wiki
  - ⚠ /wiki/ scaffold — DEFERRED. Knowledge-base directory and curator agent
    will land in the first feature spec ("scaffold") referenced by issue #1.

Follow-up TODOs: (none)
-->

# Agent Arena Constitution

## Core Principles

### I. Single Execution Authority (NON-NEGOTIABLE)

All meaningful changes to the workspace MUST flow through a single, explicitly
designated execution authority. At any moment exactly one agent — the
**executor** — is permitted to mutate workspace state (files, source control,
build artifacts, configuration). Every other agent is a read-only advisor.

The executor MAY hand authority to a different agent, but the handoff MUST be
explicit, attributed, and visible in the orchestration timeline. Concurrent
mutation by two agents is a constitution violation regardless of intent.

Rationale: Concurrent autonomous mutation produces unattributable, irreversible
state. A single execution authority is the only structure that keeps the
human's authority meaningful and conflict resolution tractable.

### II. Attributed Identity

Every action, message, comment, commit, pull request body, log entry, and
artifact produced by an agent MUST carry an agentic identity in the canonical
format `<provider>(<role>:<model>)` — for example `copilot(security:opus-4.6)`
or `copilot(executor:gpt-5.4)`. Anonymous agent output is forbidden.

Identity MUST be present at the point of authorship. Adding it after the fact
during review does not satisfy this principle.

Rationale: Origin is the foundation of trust, accountability, and replay. An
unattributed action cannot be audited, reverted with confidence, or weighted
against other agents' input.

### III. Test-First (NON-NEGOTIABLE)

Agent Arena follows strict Test-Driven Development. For every behavior change:

1. A failing test MUST be written first.
2. The user (or the executor on the user's behalf) MUST acknowledge the test
   captures the intended behavior.
3. The test MUST be observed to fail (Red).
4. Implementation makes the test pass with no other meaningful change (Green).
5. Refactor while keeping all tests green.

All code MUST be testable. Code paths that cannot be exercised by automated
tests are not acceptable; they MUST be refactored until they are.

Rationale: Agentic code generation amplifies both productivity and the rate at
which silent regressions are introduced. Test-first is the only discipline
that keeps an autonomously-edited codebase trustworthy.

### IV. Traceability to Originating Input

Every execution MUST be traceable to an explicit originating input — a GitHub
issue, a `wiki/raw/` pointer, an approved spec under `specs/`, or a user
prompt that has been recorded as a raw pointer. Code, tests, and
documentation MUST reference back to the spec, issue, or wiki page that
justifies them.

A change with no recorded originating input MUST NOT be merged.

Rationale: Without a paper trail back to intent, the codebase becomes a
collection of plausible-looking edits whose justification has evaporated.
Traceability is what makes "why is this here?" answerable months later.

### V. Gated Agent Output

All agent-generated work MUST pass through a series of gating mechanisms
before it is accepted into the main branch. The gates are intentionally
fluid and may be expanded over time, but the following gates are permanent
and non-removable:

- **Lint gate**: ESLint MUST pass with zero errors.
- **Test gate**: The full unit test suite MUST pass.
- **Attribution gate**: Every commit, PR description, and inline comment
  authored by an agent MUST carry the identity defined in Principle II.
- **Traceability gate**: The change MUST link to its originating input
  (Principle IV).

Additional gates (type-checks, integration tests, coverage thresholds,
security scans, persona-specific reviewer bots) MAY be added by amendment
or by feature-spec mandate. Gates MAY NOT be removed without a MAJOR
constitution version bump.

Rationale: Gating is what converts "agent suggested an edit" into "the
project has accepted an edit." Without enforced gates, autonomy degrades
into unreviewed churn.

### VI. Observable & Interruptible Orchestration

All agent activity and system decisions MUST be visible, inspectable, and
explainable from inside the host environment (the VS Code extension UI and
its underlying logs). The human MUST be able to pause, stop, or redirect any
agent at any time, and resumption MUST restore prior context.

No background process may directly alter the workspace. Background work is
permitted, but its proposed mutations MUST be queued for the executor and
remain visible to the human until accepted.

Rationale: Autonomy without observability is opacity, and opacity destroys
the human's ability to remain the final authority. The product's central
philosophy — *"Agents may act autonomously, but execution is controlled,
attributed, observable, and always interruptible by the human"* — is
operationally enforced by this principle.

## Product Constraints

- Agent Arena is delivered as a **Visual Studio Code extension**. The
  extension is the host surface for all orchestration UI, agent transcripts,
  inbox, wiki views, and gating dashboards.
- Implementation language is **TypeScript**. Bundling uses **esbuild**.
  Testing uses **vitest**. Linting uses **ESLint**. Package management uses
  **npm**.
- The extension MUST follow VS Code's contribution model. Major capabilities
  (agent registry, executor, advisor sessions, wiki curator, inbox,
  orchestration timeline) MUST be registered as discrete services with
  explicit, typed contracts — not wired together through ad-hoc globals.
- Agents are typed by role. Initial roles are:
  - **Executor** — the one agent currently authorized to mutate state.
  - **Advisor** — read-only reviewer, scoped to specific surfaces (security,
    tests, design, etc.). Advisors emit attributed recommendations to the
    executor's inbox; they do not write to the workspace.
  - **Curator** — owns the `wiki/` knowledge base. May write only inside
    `wiki/`, and only via the Ingest, Lint, and Query skills.
- Agents communicate exclusively through typed messages. Attributed inbox
  entries are the canonical advisor-to-executor channel.
- Secrets, tokens, and credentials MUST NOT be committed to the repository,
  written to logs, or embedded in agent transcripts. Redaction is the
  responsibility of every component that emits human-readable output.

## Knowledge Base (LLM Wiki)

Agent Arena uses a Karpathy-style LLM wiki as its durable, AI-maintained
knowledge base. The wiki lives at the repository root under `wiki/` with the
following structure:

- `wiki/index.md` — master content catalog. The first file every agent
  reads. Updated on every wiki change.
- `wiki/raw/*.md` — immutable source pointer files. Each pointer records
  provenance (URL, captured-at date, access method) and ingest status.
- `wiki/docs/*.md` — agent-owned synthesized knowledge pages.

The wiki is maintained by the **Curator** agent. The Curator exposes three
skills:

- **Ingest** — incorporate new source material into a `wiki/raw/` pointer
  and one or more `wiki/docs/` pages.
- **Lint** — health-check the wiki for stale pages, orphans, broken
  cross-references, missing concepts, and missing index entries.
- **Query** — answer domain questions by reading `wiki/index.md` and the
  relevant linked pages, and file novel answers back as new pages.

Specs and source code MUST cross-reference the wiki where it is the
authoritative source for a concept. Conversely, durable knowledge surfaced
in a chat or PR review MUST be ingested into the wiki rather than left only
in transient context. The wiki itself is a permanent constitution-level
artifact: no feature may delete or disable it.

The concrete `wiki/` directory and Curator agent definition will land in the
first feature spec referenced by issue #1.

## Development Workflow

- **Branching**: Feature work flows through Spec Kit. `/speckit.specify`
  creates the spec and a numbered branch (sequential numbering); the
  branch is the unit of review.
- **Test-first execution**: Implementation MUST follow the Red-Green-Refactor
  cycle defined in Principle III. Tasks generated by `/speckit.tasks` MUST
  schedule failing tests before their corresponding implementation tasks.
- **Pull requests**: Every meaningful change ships as a pull request. PR
  bodies MUST link to the originating issue or wiki pointer (Principle IV)
  and MUST be authored under an attributed agent identity (Principle II).
- **Gates before merge**: ESLint and the unit test suite MUST pass before a
  PR is mergeable. The repository is responsible for enforcing this in CI;
  agents are responsible for not requesting merge until the gates are green.
- **Wiki upkeep**: Any PR that introduces durable knowledge (architecture
  decisions, third-party integration notes, persona behavior contracts)
  MUST also produce or update a `wiki/raw/` pointer and the corresponding
  `wiki/docs/` page, and MUST update `wiki/index.md`.

## Governance

This constitution supersedes all other practices, conventions, and
preferences. When a spec, plan, code review, or agent recommendation
conflicts with the constitution, the constitution wins; the conflicting
artifact MUST be updated or rejected.

**Amendment procedure**: Constitution changes are made via pull request
against `.specify/memory/constitution.md`. The PR MUST include a Sync
Impact Report (the HTML comment at the top of this file), MUST justify the
version bump, and MUST update any dependent templates or documentation
flagged by the report.

**Versioning policy**: The constitution uses semantic versioning.

- **MAJOR** — backward-incompatible removal or redefinition of a principle,
  or removal of a permanent gate.
- **MINOR** — addition of a new principle or section, or material expansion
  of an existing one.
- **PATCH** — clarifications, wording, typo fixes, non-semantic refinements.

**Compliance review**: Every pull request review MUST verify that the
change complies with the active constitution. Reviewers MUST cite the
specific principle a change violates when blocking, and MUST cite the
principle a change satisfies when explicitly approving a non-obvious design
choice.

**Runtime guidance**: Day-to-day agent behavior, repository conventions,
and tool-specific rules live in `AGENTS.md` and `.github/copilot-instructions.md`.
Those files MUST defer to this constitution; where they appear to conflict,
this document is authoritative.

**Version**: 1.0.0 | **Ratified**: 2026-05-06 | **Last Amended**: 2026-05-06
