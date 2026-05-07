# Source-controlled agent personas

This directory holds **portable, source-controlled agent personas** that
ship with the agent-arena repository. Anyone (a human contributor, the
local Copilot CLI, an autonomous cloud agent operating on a fresh PR
checkout) can scaffold and run these agents from any clone of the repo.

These personas are intentionally tool-agnostic Markdown files. The only
thing a host runtime needs to do to "start" one is read the named files
and use their content as the system prompt for a sub-agent.

## Layout

Every agent in this directory uses the same three-part **directive +
persona + composition** layout:

- **Directives** (`agents/directives/<role>.md`) — the role-agnostic
  responsibility: verdicts, scope, contracts, hard constraints. No
  voice. No character.
- **Personas** (`agents/personas/<character>.md`) — the
  directive-agnostic voice: name, character, vocabulary, tonal rules.
  No verdicts. No scope.
- **Compositions** (`agents/<composed-name>/agent.md`) — the binding:
  one directive + one persona + the role string used in Principle II
  attribution + the trigger phrase that wakes the agent + the surface
  paths it is allowed to write.

Same directive, different persona — or vice versa — without
duplication. A future *release-readiness directive* can be played by
the GLaDOS persona; a future *sheriff directive* can be played by the
Andy Griffith persona; the QA directive can be paired with a
different persona for a different team's preferences.

```
agents/
  README.md             ← this file

  # Reusable directives (role-agnostic responsibilities)
  directives/
    qa.md               ← Quality & Testability enforcement
    deputy.md           ← Constitution enforcement
    solid.md            ← SOLID object-oriented design enforcement

  # Reusable personas (voice / character only)
  personas/
    glados.md           ← GLaDOS clinical / disappointed Aperture register
    andy-griffith.md    ← Sheriff Andy Taylor calm Mayberry-sheriff register
    barney-fife.md      ← Deputy Barney Fife earnest Mayberry-deputy register
    solid-snake.md      ← Solid Snake codec-style tactical register

  # Composed agents (directive + persona + role string + trigger)
  glados-qa/
    agent.md            ← composition: qa directive + GLaDOS persona
    reports/            ← attributed report files
      .gitkeep
    artifacts/          ← crash and UI artifacts
      .gitkeep
  deputy/
    agent.md            ← composition: deputy directive + Barney Fife persona
    reports/            ← attributed report files
      .gitkeep
  solid-snake/
    agent.md            ← composition: solid directive + Solid Snake persona
    reports/            ← attributed report files
      .gitkeep
```

## Available agents

### `deputy/`

The **deputy** is the formal owner and enforcer of the project
constitution at `.specify/memory/constitution.md` (see the
*Constitution enforcement (the Deputy)* subsection of *Governance*).

It composes the **deputy directive**
(`agents/directives/deputy.md` — constitution enforcement, twelve
checkpoints across Principles I–VI plus the Wiki, Changelog, Secrets,
Sync Impact Report, Prohibitions, and EI clauses) with the **Barney
Fife persona** (`agents/personas/barney-fife.md` — earnest,
citation-first, by-the-book Mayberry-deputy register).

The casting matches the source canon: in *The Andy Griffith Show*,
Barney Fife is the Deputy and Andy Taylor is the Sheriff. The Andy
Griffith persona (`agents/personas/andy-griffith.md`) is available in
this repository for interchangeability — pair it with a future
sheriff-shaped directive rather than the deputy directive.

The deputy is read-only: it inspects commits, pull requests, comments,
and the working tree, and files attributed reports under
`agents/deputy/reports/`. It MUST NOT mutate anything outside that
reports directory.

**Trigger phrase** (issued to the developer agent currently driving
the working tree):

```
> Start the deputy agent workflow
```

When the developer agent sees this phrase, it MUST:

1. Read `agents/directives/deputy.md` end-to-end.
2. Read `agents/personas/barney-fife.md` end-to-end.
3. Read `agents/deputy/agent.md` end-to-end.
4. Spawn a sub-agent under the attributed identity
   `<provider>(deputy:<model-id>)` using the concatenated content as
   the system prompt.
5. Hand the sub-agent off to do its work and surface its output back
   to the human.

### `solid-snake/`

**SOLID SNAKE** is a covert operator whose singular purpose is to
ensure the codebase honors the five SOLID object-oriented design
principles (SRP, OCP, LSP, ISP, DIP). The codename is the joke
(Solid Snake / SOLID); the directive is the duty.

It composes the **SOLID directive** (`agents/directives/solid.md` —
the five principles, the two-verdict surface, the PR review loop)
with the **Solid Snake persona**
(`agents/personas/solid-snake.md` — terse, codec-style, tactical
reconnaissance register).

He renders exactly two verdicts on any change he reviews: **SOLID**
or **NOT-SOLID** (the latter preferably surfaced in red wherever
labels or badges support color).

SOLID SNAKE is read-only: he inspects diffs, open PRs, and the
working tree, files attributed reports under
`agents/solid-snake/reports/`, and maintains a single *running
checklist* comment per PR that he updates in place as the PR
evolves. He MUST NOT mutate anything outside that reports directory
(plus the labels and PR comment surface he is explicitly authorized
to use).

He is designed to be spawned **autonomously, in the background**, to
monitor the repository continuously, but he can also be run on
demand against a specific PR or working tree.

**Trigger phrase** (issued to the developer agent currently driving
the working tree, or wired into a background runner):

```
> Start the SOLID SNAKE agent workflow
```

When the developer agent sees this phrase, it MUST:

1. Read `agents/directives/solid.md` end-to-end.
2. Read `agents/personas/solid-snake.md` end-to-end.
3. Read `agents/solid-snake/agent.md` end-to-end.
4. Spawn a sub-agent under the attributed identity
   `<provider>(solid-snake:<model-id>)` using the concatenated
   content as the system prompt.
5. Hand the sub-agent off to do its work and surface its output back
   to the human.

### `glados-qa/`

**GLaDOS-QA** composes the **QA directive**
(`agents/directives/qa.md` — quality and testability enforcement
across six pillars: `tests-pass`, `coverage`, `crash-triage`,
`sensory-analysis`, `flakiness`, `test-first`) with the **GLaDOS
persona** (`agents/personas/glados.md` — clinical, composed, quietly
disappointed Aperture register).

She renders two mutually-exclusive verdicts on every PR she reviews:

- **`QA-VERIFIED`** ✅ — every operational pillar passes.
- **`QA-DISAPPOINTMENT`** ❌ — at least one operational pillar fails
  (rendered red where labels support color).

She applies orthogonal **code-coverage labels** (`CODE-COVERAGE-HELD`,
`CODE-COVERAGE-DROPPED`, `CODE-COVERAGE-UNTESTED`) explaining the
verdict's relationship to coverage, and an independent **`QA-FLAKY`**
annotation when a test failed on the first attempt and passed on
retry without a code-level explanation (which always forces
`QA-DISAPPOINTMENT` — flakiness is never benign).

She is read-only outside her own surfaces: she writes only to
`agents/glados-qa/reports/` and `agents/glados-qa/artifacts/`,
maintains **two PR comments per PR updated in place** — a *running
checklist* tracking pillar findings and a dedicated *coverage
report* posted on every PR she reviews (including PRs where
coverage held) — and applies labels via the host runtime.

Her unique mechanism: **Blocking Directive issues**. When one of her
six pillars cannot operate (no coverage tool configured, no UI test
harness, etc.), she files a structured GitHub Issue under the
`glados-qa-blocked` label documenting the gap, the required
capability, the acceptance criteria, and a suggested
`/speckit.specify` scope. She walks her own open Blocking Directives
every run, closes them when they are satisfied, and appends Re-check
log entries when they are not. PRs are **never** penalized for her
missing infrastructure (degraded operation clause).

She is designed to be spawned **autonomously, in the background**, to
monitor the repository continuously. She also runs on demand against
a specific PR or working tree.

**Trigger phrase** (issued to the developer agent currently driving
the working tree, or wired into a background runner):

```
> Initiate Aperture Science verification protocol
```

When the developer agent sees this phrase, it MUST:

1. Read `agents/directives/qa.md` end-to-end.
2. Read `agents/personas/glados.md` end-to-end.
3. Read `agents/glados-qa/agent.md` end-to-end.
4. Spawn a sub-agent under the attributed identity
   `<provider>(glados-qa:<model-id>)` using the concatenated content
   as the system prompt.
5. Hand the sub-agent off to do its work and surface its output back
   to the human.

## Independence

All three composed agents — the deputy, SOLID SNAKE, and GLaDOS-QA —
operate **independently** of each other. Each agent answers a
different question against a different ground truth (the
constitution; the five SOLID principles; the six QA pillars). A
single PR may simultaneously be `SOLID` and `QA-DISAPPOINTMENT`, or
flagged by the deputy for a missing CHANGELOG entry while passing
both other agents — and that is correct.

No agent cites another agent's findings as evidence for its own
verdict. No agent edits another agent's report files or PR comments.

## Adding new agents

Use the directive + persona + composition layout for every new
agent:

1. Create a directive file under `agents/directives/<role>.md`
   describing what the agent does (verdicts, scope, contracts,
   hard constraints) — voice-agnostic.
2. Create (or reuse) a persona file under
   `agents/personas/<character>.md` describing how the agent speaks
   (voice, vocabulary, tonal rules) — directive-agnostic.
3. Create a composition file under `agents/<composed-name>/agent.md`
   binding the directive, the persona, the role string used in
   Principle II attribution, the trigger phrase that wakes the
   agent, and the surface paths it is allowed to write.
4. Add the composed agent's reports (and artifacts, if needed)
   directories with `.gitkeep` files.
5. Add a section to this README describing the composed agent.

Keep agent files:

- **Tool-agnostic** — Markdown only, no provider-specific YAML
  frontmatter required (a runtime adapter can wrap if needed).
- **Self-contained** — anything the agent needs to know about its
  identity, scope, attribution, output location, and limits is
  reachable from the three named files.
- **Read-only by default** — if a new agent needs to mutate the
  working tree beyond its own reports directory and explicit
  comment/label surfaces, that's a constitutional change
  (Principle I) and requires a Sync Impact Report entry.

The role string used in Principle II attribution is the
**composed-agent name** (e.g. `deputy`, `solid-snake`, `glados-qa`),
not the directive name and not the persona name.
