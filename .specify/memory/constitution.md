<!--
SYNC IMPACT REPORT
==================
Version change: (initial) → 1.0.0
Bump rationale: Initial ratification of the Agent Arena Constitution per issue #1.

Pre-ratification revisions (still v1.0.0, not yet merged):
  - 2026-05-06: Renamed the mutating-agent role from "executor" → "developer"
    per maintainer feedback. The principle name "Single Execution Authority"
    is unchanged (it describes the abstract authority the developer holds).
  - 2026-05-06: Clarified the constitution's scope. The constitution governs
    *agents working on this codebase*, not the runtime behavior of the
    engine being built. Added a Scope section. Refactored Principle I to
    apply per local working tree (multiple cloud-agent developers across
    parallel PR checkouts is explicitly permitted). Refactored Principle VI
    to focus on source-control visibility and to permit cloud-agent
    background work on independent checkouts.
  - 2026-05-06: Removed the Product Constraints section. Product, runtime,
    and tech-stack decisions are spec-level concerns, not constitutional
    ones. Moved the dev-time role taxonomy (Developer / Advisor / Curator)
    into a new Agent Roles section. Generalized Principle V's lint-gate
    wording to refer to "the project's configured linter" instead of naming
    a specific tool. Moved the secrets/redaction rule into Development
    Workflow.
  - 2026-05-06: Removed the prescription that feature branches use
    sequential numbering — branch-naming strategy is a spec-kit
    configuration, not a constitutional rule. Added a Changelog discipline
    bullet to Development Workflow that adopts Keep a Changelog 1.1.0 and
    Semantic Versioning 2.0.0 for the project's `CHANGELOG.md`.
  - 2026-05-06: Removed the Agent Roles section. The enumeration of
    specific agent roles (developer, advisor, curator) is a spec-level
    product decision, not a constitutional one. Principle I now states
    the single-mutator-per-working-tree rule without binding it to a
    role name. Knowledge Base no longer enumerates a Curator agent or
    Ingest / Lint / Query skills — those land in the relevant feature
    spec. Added `wiki/bugs/` to the Knowledge Base structure: every
    reproduced and fixed bug MUST land there as a durable record
    (symptom, reproduction, root cause, fix, verification).
  - 2026-05-06: Reinforced in Scope and Principle I that autonomous
    background sub-agents — spawned by the human to pull issues and
    work them on independent machines (local or cloud) — are explicitly
    permitted; the single-mutator rule applies per working tree, with no
    cap on how many working trees may be active in parallel. Added a new
    Governance subsection establishing the **Deputy** agent as the
    formal owner and enforcer of the constitution. The deputy is
    source-controlled at `agents/deputy/persona.md` so any contributor
    or autonomous agent can scaffold a deputy session from a fresh
    checkout, and is invoked by the trigger phrase
    `> Start the deputy agent workflow`. The deputy is read-only and
    files attributed reports under `agents/deputy/reports/`. The deputy
    is a *governance* role — the rule that the constitution has an
    enforcer — not a product runtime role.
  - 2026-05-06: Switched Spec Kit branch & spec-directory naming from
    sequential numbering to **timestamp prefix** (`YYYYMMDD-HHMMSS-slug`).
    Two reasons: (a) parallel cloud agents on independent PR checkouts no
    longer race for the next sequential number, and (b) date-prefixed
    specs are chronologically sortable and let us revisit old specs and
    re-assert their primary assumptions and goals over time. The
    branch-naming strategy itself remains a Spec Kit configuration
    concern, not a constitutional rule.
  - 2026-05-06: Made changelog-entry attribution explicit. Principle II
    now lists "changelog entry" alongside commits, PR bodies, comments,
    and log entries, and defines the canonical inline trailer form
    (`— <provider>(<role>:<model>)`). The Changelog discipline bullet
    under Development Workflow grew an "Attribution per entry" sub-bullet
    requiring the trailer on every entry, with the deputy responsible
    for catching unattributed entries during review. Existing
    `[Unreleased]` entries in `CHANGELOG.md` were back-attributed to the
    developer agent that wrote them.

Modified principles: (none renamed; bodies of I, V, VI revised)
Added sections:
  - Scope (NEW)
  - Core Principles (I. Single Execution Authority, II. Attributed Identity,
    III. Test-First (NON-NEGOTIABLE), IV. Traceability to Originating Input,
    V. Gated Agent Output, VI. Observable & Interruptible Orchestration)
  - Knowledge Base (LLM Wiki)
  - Development Workflow
  - Governance
Removed sections:
  - Product Constraints (deferred to feature specs; not a constitutional
    concern)
  - Agent Roles (deferred to feature specs; the constitution no longer
    enumerates a fixed role taxonomy)

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — no change required
  - ✅ .specify/templates/spec-template.md — no change required
  - ✅ .specify/templates/tasks-template.md — no change required
  - ✅ README.md — updated to disambiguate product runtime (parallel agents)
    from dev-time discipline (single developer per working tree)
  - ✅ CHANGELOG.md — created at repo root with `[Unreleased]` section
    capturing pre-1.0 work, per Keep a Changelog 1.1.0; existing entries
    back-attributed with Principle II inline-trailer identities
  - ✅ agents/deputy/persona.md — source-controlled deputy persona
  - ✅ agents/deputy/reports/ — directory for deputy reports (with .gitkeep)
  - ✅ agents/README.md — top-level explainer for source-controlled agents
  - ✅ .github/copilot-instructions.md — trigger phrase registered for
    any developer agent on a fresh checkout
  - ✅ .specify/init-options.json — branch_numbering switched to timestamp
  - ✅ .specify/extensions/git/git-config.yml — branch_numbering switched
  - ✅ .specify/extensions/git/config-template.yml — branch_numbering switched
  - ✅ .specify/extensions/git/extension.yml — defaults updated
  - ⚠ /wiki/ scaffold — DEFERRED. Knowledge-base directory will land in
    the first feature spec ("scaffold") referenced by issue #1.
  - ⚠ Scaffold spec — MUST capture the tech stack (TypeScript, esbuild,
    vitest, ESLint, npm), the VS Code extension contribution model, and
    the service architecture that previously lived in Product Constraints.

Follow-up TODOs: (none)
-->

# Agent Arena Constitution

## Scope

This constitution governs **agents working on this codebase** — the
development of Agent Arena itself. It applies to every entity that produces
commits, pull requests, comments, inbox entries, or documentation in this
repository: human contributors, the coding agent the human is operating, and
any autonomous cloud agents acting on this repository (pull-request bots,
automated reviewers, scheduled tasks).

It does NOT define the runtime behavior of the engine being built. Agent
Arena is, by design, an orchestration engine for many agents running in
parallel; that capability is a product requirement, not a constitution
violation. Where the engine's runtime behavior diverges from the
development-time discipline below, the divergence is an intentional product
decision documented in a feature spec, not an amendment to this document.

Two corollaries follow:

- **"Single Execution Authority" applies per local working tree.** On any
  given local clone of this repository, exactly one agent may mutate files
  at a time. Multiple autonomous agents MAY operate in parallel across
  different machines and different working trees — including background
  sub-agents the human has spawned to autonomously pull issues and work
  them, each on its own independent clone of the repository. The
  constitution does not cap how many such agents exist; it only constrains
  how many are mutating any *single* working tree (always: exactly one).
- **The constitution stops at this repository.** It does not govern what
  an end-user installation of the shipped product does once it is
  orchestrating their own workspace.

Product, runtime, and tech-stack decisions (extension architecture,
languages, build tools, lint tools, test runners, package managers, service
contracts) are spec-level concerns and live under `specs/`, not here.

## Core Principles

### I. Single Execution Authority (NON-NEGOTIABLE)

All meaningful changes to a working tree MUST flow through a single,
explicitly designated execution authority. Within any one local working
tree of this repository, exactly one agent is permitted to mutate that
tree's state (files, source control, build artifacts, configuration).
Every other agent observing the same working tree operates in read-only
mode.

Multiple working trees MAY exist across the project at once — a human's
local checkout, autonomous background sub-agents that the human has
spawned to pull issues and work them on independent machines (local or
cloud), automated reviewers running in CI, and so on. The single-mutator
rule applies independently within each working tree, and there is no
limit on how many working trees may be active concurrently. Background
sub-agents acting on their own checkouts are not violations of this
principle; they are precisely the case it permits.

The mutating agent MAY hand authority to a different agent, but the
handoff MUST be explicit, attributed, and visible in the orchestration
timeline. Concurrent mutation by two agents within the same working tree
is a constitution violation regardless of intent.

Rationale: Concurrent autonomous mutation of the same working tree
produces unattributable, irreversible state. A single execution authority
per working tree is the only structure that keeps human authority
meaningful and conflict resolution tractable while still permitting
parallel cloud agents on independent pull-request checkouts.

### II. Attributed Identity

Every action, message, comment, commit, pull request body, log entry,
changelog entry, and artifact produced by an agent MUST carry an agentic
identity in the canonical format `<provider>(<role>:<model>)` — for example
`copilot(security:opus-4.6)` or `copilot(developer:gpt-5.4)`. Anonymous
agent output is forbidden.

Identity MUST be present at the point of authorship. Adding it after the fact
during review does not satisfy this principle.

The canonical inline form, used wherever the identity rides alongside the
content it authored (changelog bullets, inbox entries, deputy report
findings, agent-authored comments), is an em-dash followed by the identity
in parentheses-free form, e.g. `— copilot(developer:opus-4.7-xhigh)`. When
a single artifact has multiple agent authors they MUST all be listed,
comma-separated.

Rationale: Origin is the foundation of trust, accountability, and replay. An
unattributed action cannot be audited, reverted with confidence, or weighted
against other agents' input.

### III. Test-First (NON-NEGOTIABLE)

Agent Arena follows strict Test-Driven Development. For every behavior change:

1. A failing test MUST be written first.
2. The user (or the developer on the user's behalf) MUST acknowledge the test
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

- **Lint gate**: All lint checks configured for this repository MUST pass
  with zero errors. (The specific linter and its configuration are defined
  in the scaffold spec, not here.)
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

All agent activity on this codebase MUST be visible, inspectable, and
explainable through standard source-control and orchestration surfaces:
commit messages, pull-request descriptions and comments, attributed
review feedback, and the project's wiki. The human MUST be able to
pause, stop, or redirect any agent at any time, and resumption MUST
restore prior context.

No agent process may silently mutate any local working tree other than
its own designated checkout. Background work IS permitted — for
example, autonomous cloud agents operating on their own pull-request
checkouts — but its proposed effect on this repository MUST surface
as a pull request, attributed comment, or other reviewable artifact,
never as an unannounced edit on someone else's machine.

Rationale: Autonomy without observability is opacity, and opacity destroys
the human's ability to remain the final authority. The product's central
philosophy — *"Agents may act autonomously, but execution is controlled,
attributed, observable, and always interruptible by the human"* — is
operationally enforced by this principle for the development of this
codebase. The shipped product is responsible for enforcing equivalent
guarantees at runtime through its own feature specs.

## Knowledge Base (LLM Wiki)

Agent Arena uses a Karpathy-style LLM wiki as its durable, AI-maintained
knowledge base. The wiki lives at the repository root under `wiki/` with the
following structure:

- `wiki/index.md` — master content catalog. The first file every agent
  reads. Updated on every wiki change.
- `wiki/raw/*.md` — immutable source pointer files. Each pointer records
  provenance (URL, captured-at date, access method) and ingest status.
- `wiki/docs/*.md` — agent-owned synthesized knowledge pages.
- `wiki/bugs/*.md` — accumulated bug reports with their confirmed fixes.
  Every bug reported against this project that is reproduced and
  resolved MUST land here as a durable record containing symptom,
  reproduction, root cause, fix, and verification, so future agents
  recognize the same class of bug on sight and avoid re-introducing it.

The wiki is canonical. Where the wiki covers a concept, specs and source
code MUST reference it rather than restate. Conversely, durable knowledge
surfaced in a chat, PR review, or bug investigation MUST be ingested into
the wiki rather than left only in transient context. The wiki itself is a
permanent constitution-level artifact: no feature may delete or disable it.

The concrete agents, services, and skills that maintain the wiki are
defined in the relevant feature spec, not here.

## Development Workflow

- **Branching**: Feature work flows through Spec Kit. `/speckit.specify`
  creates the spec and a feature branch; the branch is the unit of review.
  The exact branch-naming strategy is a Spec Kit configuration concern
  (`.specify/extensions/git/git-config.yml`) and not constitutional.
- **Test-first execution**: Implementation MUST follow the Red-Green-Refactor
  cycle defined in Principle III. Tasks generated by `/speckit.tasks` MUST
  schedule failing tests before their corresponding implementation tasks.
- **Pull requests**: Every meaningful change ships as a pull request. PR
  bodies MUST link to the originating issue or wiki pointer (Principle IV)
  and MUST be authored under an attributed agent identity (Principle II).
- **Gates before merge**: The configured linter and the unit test suite
  MUST pass before a PR is mergeable. The repository is responsible for
  enforcing this in CI; agents are responsible for not requesting merge
  until the gates are green.
- **Secrets discipline**: Secrets, tokens, and credentials MUST NOT be
  committed to the repository, written to logs, or embedded in agent
  transcripts (commits, PR descriptions, comments, inbox entries, wiki
  pages). Redaction is the responsibility of every component that emits
  human-readable output.
- **Wiki upkeep**: Any PR that introduces durable knowledge (architecture
  decisions, third-party integration notes, persona behavior contracts)
  MUST also produce or update a `wiki/raw/` pointer and the corresponding
  `wiki/docs/` page, and MUST update `wiki/index.md`. Bug-fix PRs MUST
  add (or update) a `wiki/bugs/` entry capturing symptom, reproduction,
  root cause, fix, and verification.
- **Changelog discipline**: A `CHANGELOG.md` is maintained at the
  repository root following [Keep a Changelog 1.1.0][kac]. The
  project follows [Semantic Versioning 2.0.0][semver]. The discipline:
  - **For humans, not machines.** Entries describe noteworthy changes
    in plain language. Commit log dumps are not changelogs.
  - **Unreleased section first.** Every PR that introduces a
    user-visible change MUST add an entry under `[Unreleased]` in the
    appropriate group: `Added`, `Changed`, `Deprecated`, `Removed`,
    `Fixed`, or `Security`.
  - **Attribution per entry (Principle II).** Every changelog bullet
    MUST end with an agentic identity trailer in the canonical
    Principle II inline form — an em-dash followed by
    `<provider>(<role>:<model>)`, e.g.
    `— copilot(developer:opus-4.7-xhigh)`. Bullets authored by multiple
    agents list each identity, comma-separated. Bullets authored by a
    human carry the human's name in the same trailer position
    (e.g. `— @jdylanmc`). Anonymous changelog entries are a Principle II
    violation and MUST be rejected at PR review by the developer or by
    the deputy.
  - **One entry per version, latest first.** Releases promote the
    `[Unreleased]` section to a new dated, versioned section at the top
    of the file; older versions stay in place.
  - **ISO 8601 dates.** Every released version carries a `YYYY-MM-DD`
    release date.
  - **Linkable versions.** Every version heading has a corresponding
    compare link at the bottom of the file.
  - **Deprecations are never silent.** Removed or breaking changes MUST
    appear in the changelog under `Deprecated` for at least one release
    before they appear under `Removed`.
  - The `CHANGELOG.md` covers the **shipped product**. The constitution's
    own version history lives in the Sync Impact Report at the top of
    this document and is governed separately by Governance below.

[kac]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html

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

**Constitution enforcement (the Deputy)**: This constitution is owned and
enforced by a designated **deputy** agent. The deputy's persona is
source-controlled at `agents/deputy/persona.md` so that any contributor
or autonomous agent can scaffold and run a deputy session from a fresh
checkout, including agents working on independent cloud-side checkouts.

The deputy operates strictly read-only against any working tree it is
attached to: it reads commits, pull requests, comments, the working
tree, and the constitution itself, and files attributed reports under
`agents/deputy/reports/`. The deputy MUST NOT mutate anything outside
its own reports directory.

The deputy is invoked by the trigger phrase
**`> Start the deputy agent workflow`** issued to whichever developer
agent is currently driving the working tree. The developer agent MUST
recognize this trigger, load the persona, and spawn a deputy sub-agent
under the attributed identity `<provider>(deputy:<model-id>)`.

Any agent or human MAY propose constitutional amendments via the normal
amendment procedure above, but the deputy is the formal owner of
constitutional *interpretation*: when an attributed deputy report cites
a violation, the burden falls on the cited agent (or human) to either
correct the behavior or argue in PR review why the deputy's reading is
wrong. The deputy itself is bound by this constitution and MAY NOT
amend it unilaterally.

**Version**: 1.0.0 | **Ratified**: 2026-05-06 | **Last Amended**: 2026-05-06
