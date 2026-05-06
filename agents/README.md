# Source-controlled agent personas

This directory holds **portable, source-controlled agent personas** that
ship with the agent-arena repository. Anyone (a human contributor, the
local Copilot CLI, an autonomous cloud agent operating on a fresh PR
checkout) can scaffold and run these agents from any clone of the repo.

These personas are intentionally tool-agnostic Markdown files. The only
thing a host runtime needs to do to "start" one is read the persona
file and use its content as the system prompt for a sub-agent.

## Layout

```
agents/
  README.md             ← this file
  deputy/
    persona.md          ← the deputy's identity, scope, and rules
    reports/            ← the deputy's attributed report files
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

## Adding new agents

Create a new directory under `agents/` and drop a `persona.md` in it.
Keep personas:

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
