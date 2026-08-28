# Token Budget Pipeline

End-to-end flow that turns the assembled pi system prompt into an inspectable token budget: from prompt capture, through section parsing and token estimation, to TUI rendering and on-demand source tracing.

## Purpose

`pi-token-burden` shows a token-budget breakdown of the assembled pi system prompt so users can see where context-window capacity is spent.

## Architecture

Module dependency graph from the entry point through parsing, rendering, and the base-trace subsystem.

```text
index.ts ──→ parser.ts ──→ types.ts
   │              │
   ├──→ report-view.ts ──→ utils.ts ──→ types.ts
   │
   └──→ base-trace/ ──→ attribution.ts, base-lines.ts, extension-inspector.ts, cache.ts
```

## Data flow

How a prompt becomes a rendered budget, step by step.

1. `src/index.ts` registers `/token-burden` and asks pi for the assembled prompt with `ctx.getSystemPrompt()`.
2. `src/parser.ts` parses the prompt into sections and estimates tokens with `gpt-tokenizer` using `o200k_base` ([[src/parser.ts#parseSystemPrompt]], [[src/parser.ts#estimateTokens]]).
3. `src/index.ts` augments parsed prompt data with `pi.getAllTools()` so tool definitions are included in the total budget.
4. `src/report-view.ts` renders the parsed data in `BudgetOverlay` using a TUI custom overlay.
5. `src/utils.ts` supports fuzzy filtering and proportional bar segments.

## Source tracing flow

On-demand attribution of the Base prompt to its contributing sources.

1. `discoverAndLoadExtensions()` loads extension metadata (pi-core internal, not in this repo).
2. `extractContributions()` reads prompt snippets and guidelines from loaded extensions ([[src/base-trace/extension-inspector.ts#extractContributions]]).
3. `extractBaseLines()` extracts attributable base-prompt lines ([[src/base-trace/base-lines.ts#extractBaseLines]]).
4. `attributeBasePrompt()` normalizes and matches evidence into buckets ([[src/base-trace/attribution.ts#attributeBasePrompt]]).
5. `BasePromptTraceResult` is cached by fingerprint in `base-trace/cache.ts`.

Tracing is user-triggered with `t` on the Base prompt so the default overlay stays fast.

## File map

Project files and their roles in the pipeline.

| Path                                        | Purpose                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                              | Extension entry: registers `/token-burden`, wires trace                                                                      |
| `src/parser.ts`                             | Parses system prompt into sections; token estimation ([[src/parser.ts#parseSystemPrompt]], [[src/parser.ts#estimateTokens]]) |
| `src/report-view.ts`                        | Stateful TUI overlay (`BudgetOverlay`): keyboard handling, drill-downs, editor handoff, trace mode                           |
| `src/utils.ts`                              | `fuzzyFilter()` search and `buildBarSegments()` bar chart ([[src/utils.ts#fuzzyFilter]], [[src/utils.ts#buildBarSegments]])  |
| `src/types.ts`                              | Shared types: `ParsedPrompt`, `PromptSection`, `TableItem`                                                                   |
| `src/enums.ts`                              | `DisableMode` enum for skill states                                                                                          |
| `src/skills.ts`                             | Filesystem skill discovery matching pi scan order ([[src/skills.ts#scanSkillDir]], [[src/skills.ts#loadAllSkills]])          |
| `src/skills-persistence.ts`                 | Settings / frontmatter persistence for skill toggles                                                                         |
| `src/base-trace/`                           | Attribution subsystem for base-prompt source tracing                                                                         |
| `src/*.test.ts`, `src/base-trace/*.test.ts` | Colocated unit tests (192 tests, 16 files)                                                                                   |
| `src/e2e/tmux-harness.ts`                   | Tmux automation for e2e TUI tests ([[src/e2e/tmux-harness.ts#TmuxHarness]])                                                  |
| `src/e2e/*.test.ts`                         | E2e TUI tests (4 files)                                                                                                      |
| `vitest.config.e2e.ts`                      | Vitest config for e2e tests (30s timeout)                                                                                    |
| `CHANGELOG.md`                              | Auto-generated changelog (do not edit manually)                                                                              |
| `scripts/`                                  | Shell scripts (`check.sh`, `fix.sh`)                                                                                         |
| `docs/plans/`                               | Implementation plans                                                                                                         |

## Utilities

Reusable helper functions exposed by the extension.

| Need                         | Use                  | Location                          |
| ---------------------------- | -------------------- | --------------------------------- |
| Fuzzy-match filter items     | `fuzzyFilter()`      | [[src/utils.ts#fuzzyFilter]]      |
| Proportional bar segments    | `buildBarSegments()` | [[src/utils.ts#buildBarSegments]] |
| BPE token count (o200k_base) | `estimateTokens()`   | [[src/parser.ts#estimateTokens]]  |

## Verification

How to confirm the pipeline still works after changes.

- Unit tests: `pnpm run test`.
- E2e TUI tests: `pnpm run test:e2e`.
- Full gate: `pnpm run check`.
- Manual extension test: `pi -e ./src/index.ts`, then run `/token-burden`.
