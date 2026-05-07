# Agents working in `wiki/`

This directory is the project's **durable knowledge base** per
`.specify/memory/constitution.md` Principle IV.

## Contract for any agent (or human) editing wiki/

1. **Read `wiki/index.md` first.** It's the entry point and lists every page in the wiki by category.
2. **Synthesis pages (`wiki/sources/*.md`)** are agent-readable distillations — keep them up to date when the upstream source changes (new SDK version, API deprecation, etc.). Synthesis pages MUST link back to their `wiki/raw/<source>/` pointer files for traceability.
3. **Raw pointer files (`wiki/raw/<source>/*.md`)** are immutable per `constitution.md:607`. They carry **provenance + ingest status only**, not the doc body itself. The frontmatter schema is:
   ```
   ---
   source_url: <url>
   fetched_at: <ISO 8601 timestamp>
   access_method: <e.g. "web_reference" | "git_clone" | "npm_tarball">
   commit_sha: <git SHA or null>
   ingest_status: <"pending" | "ingested" | "stale">
   ---
   ```
4. **Bug records (`wiki/bugs/*.md`)** are required for every bug-fix PR. The schema: symptom → reproduction → root cause → fix → verification.
5. **Glossary (`wiki/glossary/*.md`)** holds project-specific terminology. One term per file. Cross-link from `wiki/index.md`.
6. **Authorship.** Every page MUST end with the canonical Principle II identity trailer (e.g. `— copilot(developer:opus-4.7)`).

## What NOT to do

- Don't store live API tokens, user data, or anything from production systems in this tree.
- Don't paraphrase upstream documentation in raw pointer files — they're pointers, not copies. The synthesis page is where interpretation lives.
- Don't delete pages without leaving a deprecation pointer; this wiki is a research record.

— copilot(developer:opus-4.7)
