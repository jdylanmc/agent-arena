# Source-controlled agent personas

This directory holds **portable, source-controlled agent personas** that
ship with the agent-arena repository. Anyone (a human contributor, the
local Copilot CLI, an autonomous cloud agent operating on a fresh PR
checkout) can scaffold and run these agents from any clone of the repo.

These personas are intentionally tool-agnostic Markdown files. The only
thing a host runtime needs to do to "start" one is read the persona
file and use its content as the system prompt for a sub-agent.

## Two layouts (both supported)

This directory supports two layouts:

### 1. Single-file persona (legacy, used by deputy and SOLID SNAKE)

The original layout: each agent owns a directory containing a single
`persona.md` that bundles the agent's identity, role, scope, output
contract, and voice. Deputy and SOLID SNAKE remain on this layout for
now.

### 2. Directive + persona composition (new, used by GLaDOS-QA)

A newer layout that separates an agent's *directive* (role —
responsibilities, verdicts, contracts, hard constraints) from its
*persona* (voice — name, character, vocabulary, tonal rules), then
**composes** them in a per-agent file. Same directive, different
persona — or vice versa — without duplication.

This split lets us, for example, plug the GLaDOS persona into a
future release-readiness directive without rewriting either, or pair
the QA directive with a different persona for a different team's
preferences.

```
agents/
  README.md             ← this file

  # Reusable directives (role-agnostic responsibilities)
  directives/
    qa.md               ← Quality & Testability enforcement directive

  # Reusable personas (voice / character only)
  personas/
    glados.md           ← GLaDOS clinical / disappointed Aperture register

  # Composed agents (directive + persona + role string + trigger)
  glados-qa/
    agent.md            ← composition: qa directive + GLaDOS persona
    reports/            ← attributed report files
      .gitkeep
    artifacts/          ← crash and UI artifacts
      .gitkeep

  # Legacy single-file personas (still supported)
  deputy/
    persona.md          ← the deputy's identity, scope, and rules
    reports/            ← the deputy's attributed report files
      .gitkeep
  solid-snake/
    persona.md          ← SOLID SNAKE's identity, scope, and rules
    reports/            ← SOLID SNAKE's attributed report files
      .gitkeep
```

## Available agents

### `deputy/`

The **deputy** is the formal owner and enforcer of the project
constitution at `.specify/memory/constitution.md` (see the
*Constitution enforcement (the Deputy)* subsection of *Governance*).

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

1. Read `agents/deputy/persona.md` end-to-end.
2. Spawn a sub-agent under the attributed identity
   `<provider>(deputy:<model-id>)` using the persona content as the
   system prompt.
3. Hand the sub-agent off to do its work and surface its report back
   to the human.

### `solid-snake/`

**SOLID SNAKE** is a covert operator whose singular purpose is to
ensure the codebase honors the five SOLID object-oriented design
principles (SRP, OCP, LSP, ISP, DIP). He renders exactly two verdicts
on any change he reviews: **SOLID** or **NOT-SOLID** (the latter
preferably surfaced in red wherever labels or badges support color).

SOLID SNAKE is read-only: he inspects diffs, open PRs, and the working
tree, files attributed reports under `agents/solid-snake/reports/`,
and maintains a single *running checklist* comment per PR that he
updates in place as the PR evolves. He MUST NOT mutate anything
outside that reports directory.

He is designed to be spawned **autonomously, in the background**, to
monitor the repository continuously, but he can also be run on demand
against a specific PR or working tree.

**Trigger phrase** (issued to the developer agent currently driving
the working tree, or wired into a background runner):

```
> Start the SOLID SNAKE agent workflow
```

When the developer agent sees this phrase, it MUST:

1. Read `agents/solid-snake/persona.md` end-to-end.
2. Spawn a sub-agent under the attributed identity
   `<provider>(solid-snake:<model-id>)` using the persona content as
   the system prompt.
3. Hand the sub-agent off to do its work and surface its report back
   to the human.

### `glados-qa/`

**GLaDOS-QA** is a composed agent that pairs the **QA directive**
(`agents/directives/qa.md` — quality and testability enforcement
across six pillars: `tests-pass`, `coverage`, `crash-triage`,
`sensory-analysis`, `flakiness`, `test-first`) with the **GLaDOS
persona** (`agents/personas/glados.md` — clinical, composed, quietly
disappointed Aperture register).

She renders three mutually-exclusive verdicts on every PR she
reviews:

- **`QA-VERIFIED`** ✅ — every operational pillar passes.
- **`DISAPPOINTMENT`** ❌ — at least one operational pillar fails
  (rendered red where labels support color).
- **`FLAKY`** ⚠ — a test failed on the first attempt and passed on a
  retry without a code-level explanation; does not block merge by
  itself.

She applies orthogonal coverage labels (`COVERAGE-HELD`,
`COVERAGE-DROPPED`, `COVERAGE-UNTESTED`) explaining the verdict.

She is read-only outside her own surfaces: she writes only to
`agents/glados-qa/reports/` and `agents/glados-qa/artifacts/`,
maintains a single *running checklist* comment per PR (updated in
place), and applies labels via the host runtime.

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

GLaDOS-QA operates **independently** of the deputy and SOLID SNAKE.
Each agent answers a different question against a different ground
truth. A single PR may simultaneously be `SOLID` and
`DISAPPOINTMENT`, or vice versa, and that is correct.

## Adding new agents

You have two options:

### Option A — Single-file persona (legacy)

Create a new directory under `agents/<name>/` and drop a
`persona.md` in it. Use this when the agent's role and voice are
tightly coupled and you do not anticipate reusing either separately.

### Option B — Directive + persona composition (preferred for new agents)

1. Create a directive file under `agents/directives/<role>.md`
   describing what the agent does (verdicts, scope, contracts,
   hard constraints) — voice-agnostic.
2. Create (or reuse) a persona file under
   `agents/personas/<character>.md` describing how the agent speaks
   (voice, vocabulary, tonal rules) — directive-agnostic.
3. Create a composition file under `agents/<composed-name>/agent.md`
   binding the directive, the persona, the role string used in
   Principle II attribution, and the trigger phrase that wakes the
   agent.
4. Add the composed agent's reports (and artifacts, if needed)
   directories with `.gitkeep` files.
5. Add a section to this README describing the composed agent.

In either layout, keep agent files:

- **Tool-agnostic** — Markdown only, no provider-specific YAML
  frontmatter required (a runtime adapter can wrap if needed).
- **Self-contained** — anything the agent needs to know about its
  identity, scope, attribution, output location, and limits goes in
  the persona file.
- **Read-only by default** — if a new agent needs to mutate the
  working tree, that's a constitutional change (Principle I) and
  requires a Sync Impact Report entry.

Add a section to this README describing the new agent, its trigger
phrase (if any), and its scope.
