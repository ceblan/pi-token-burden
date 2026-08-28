# Documentation System Migration

Decision record for migrating agent documentation from Brain `.memory/` files to a repository-local vault, with rationale, scope, and follow-up.

## Decision

Migrate project agent documentation from Brain `.memory/` files to a repository-local napkin vault.

## Rationale

Reasons a repository-local note vault was chosen over the append-only Brain memory system.

- Napkin stores context as ordinary Markdown notes that are readable without a special memory extension.
- The root `NAPKIN.md` provides a lightweight level-0 project summary.
- Search / read workflows let agents retrieve context incrementally instead of loading all historical memory.
- Topic folders make durable context easier to maintain than append-only branch memory logs.

## Scope

What moved into the new system and what was deliberately left behind.

Migrated:

- Roadmap and current state from `.memory/main.md` to `NAPKIN.md`.
- Durable architecture and decision context to `architecture/` and `decisions/` notes.
- Brain commit history to `changelog/Agent Memory History.md`.
- Agent instructions in `AGENTS.md` from Brain tools to the napkin workflow.

Not migrated:

- Brain session state from `.memory/state.yaml`.
- Auto-maintained Brain `log.md` traces.
- Empty branch metadata.

## Follow-up

The napkin vault has since been migrated into the lat.md knowledge graph in `lat.md/`. Use `lat search`, `lat locate`, and `lat section` for onboarding; see [[index#pi-token-burden]] and [[changelog/agent-memory-history#Agent Memory History]].
