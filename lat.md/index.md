# pi-token-burden

`pi-token-burden` is a pi extension that parses the assembled system prompt and shows where context-window tokens are spent via an interactive `/token-burden` TUI overlay.

The overlay offers a stacked bar visualization, drill-down tables, fuzzy search, skill management, and source-tracing views.

## What is this?

Turns the opaque assembled system prompt into an inspectable budget: base prompt, AGENTS files, skills, metadata, tool definitions, and trace buckets.

It exists so users can see, and act on, the real token cost of every component pi injects into a session.

## Current state

Shipped feature set across multiple tagged releases; the migration memory records the progression.

- v0.4.0+ feature set released and published to npm.
- Parses the assembled system prompt into base prompt, AGENTS files, skills, metadata, and tool definitions.
- Estimates tokens with `gpt-tokenizer` using the `o200k_base` encoding.
- Provides the `BudgetOverlay` TUI interactions: keyboard navigation and drill-down; fuzzy search via `/`; skill toggle mode with Enabled / Hidden / Disabled states; open-in-editor with `e` for skills, AGENTS files, raw sections, and tool-definition JSON; base prompt source tracing with `t` on the Base prompt.
- Test baseline from migrated memory: 111 unit tests and 29 e2e TUI tests.

## Tech stack

Pragmatic TypeScript extension built on pi's extension and TUI APIs.

- Language: TypeScript with strict mode.
- Runtime / package manager: Node.js, pnpm.
- Test framework: Vitest; e2e tests use tmux via `TmuxHarness`.
- Lint / format: oxlint, oxfmt, Ultracite / Factory rules.
- Tokenizer: `gpt-tokenizer` (`o200k_base`).
- Agent docs: lat.md knowledge graph in the `lat.md/` directory.

## Start here

Orient with lat.md's progressive-disclosure commands before editing the codebase.

1. `lat search "topic"` — semantic search across all sections.
2. `lat locate "Section Name"` — find a section by name (exact or fuzzy).
3. `lat refs "file#Section"` — find what references a section.
4. `lat section "id"` — read a section's full content with refs.

Useful entry points:

- [[architecture/token-budget-pipeline#Token Budget Pipeline]] — implementation data flow and modules.
- [[decisions/key-decisions#Key Decisions]] — architectural and product decisions worth preserving.
- [[guides/commands#Commands]] — pnpm scripts and run times.
- [[changelog/agent-memory-history#Agent Memory History]] — preserved commit history from the Brain memory era.

## Active work

Next milestone from migrated memory: **Actionable insights** — suggest which skills/files to trim when the context budget is tight.

## Open problems

Known limitations that shape future work.

- Base prompt tracing currently finds mostly built-in pi-core content; extension tools are sent via the LLM function-calling API rather than literal system-prompt text.
- Deep diff mode using subprocess counterfactuals remains deferred for pathological attribution cases.
