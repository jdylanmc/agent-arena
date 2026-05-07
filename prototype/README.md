# prototype/

Concept mockups and design references for **future** Agent Arena
features. Nothing in this directory is shipped, built, or referenced
by source code — these are visual specifications that subsequent
feature specs (under `specs/`) consume when they describe and build
the corresponding UI.

## Contents

- `swarm-primary.png` — the **Swarm primary** view: the main agent
  workspace with the active conversation surface.
- `swarm-background.png` — the **Swarm background** view: the grid
  of background agents working in parallel alongside the primary
  agent.
- `swarm-workflow.png` — the **Swarm workflow** view: the workflow
  panel for declaring multi-agent pipelines.

## Provenance

Authored by the human developer (`@jdylanmc`) before
[`agent-arena#4`][issue-4] (the scaffold spec) and referenced in
that spec's *Originating-input citation* section as the long-term
product vision.

## Scope

The current scaffold spec (`specs/20260506-144809-scaffold-application/`)
is **explicitly NOT** building these views. Subsequent specs will:

- Consume `swarm-primary.png` + `swarm-background.png` to design the
  Swarm sidebar layout (multi-view container replacing the scaffold's
  single primary-agent terminal view).
- Consume `swarm-workflow.png` to design the workflow panel and the
  underlying workflow-definition format.
- Cite this directory by relative path so the visual reference and
  the spec stay co-located in source control.

## Not the wiki

Once the wiki tree exists (created during `/speckit.implement` of
the scaffold spec, per FR-027..FR-031), durable design notes and
interpretations of these mockups belong under `wiki/docs/` with a
`wiki/sources/` pointer back here. This directory remains the home
of the original PNG assets themselves.

[issue-4]: https://github.com/jdylanmc/agent-arena/issues/4
