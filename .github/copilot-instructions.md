<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

## Project agents

This repository ships source-controlled agent personas under `agents/`.
See `agents/README.md` for the full list and the contract for adding new
ones.

### Trigger phrases

The developer agent (you) MUST recognize the following trigger phrases
issued by the human and respond by scaffolding the corresponding
sub-agent. Do not ad-lib these workflows — read the persona file and
spawn the sub-agent under its attributed identity.

| Trigger phrase | Persona file | Identity |
|---|---|---|
| `> Start the deputy agent workflow` | `agents/deputy/persona.md` | `<provider>(deputy:<model-id>)` |

When you see one of these triggers:

1. Read the named persona file end-to-end.
2. Spawn a sub-agent (using whatever sub-agent mechanism your runtime
   provides — `task` for Copilot CLI, etc.) using the persona content
   as the system prompt.
3. Pass the sub-agent the working-tree context it needs (current
   branch, recent commits, open PRs).
4. Surface the sub-agent's report back to the human and to source
   control as the persona dictates.

The deputy specifically is read-only and the formal owner/enforcer of
`.specify/memory/constitution.md`. Do not bypass it.

