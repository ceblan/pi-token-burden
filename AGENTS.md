# pi-token-burden

A pi extension that parses the assembled system prompt and shows a token-budget
breakdown via the `/token-burden` slash command (TUI overlay, drill-down, fuzzy search).

## Rules

- **1-3-1**: When stuck, provide 1 clearly defined problem, 3 potential options
  to overcome it, and 1 recommendation. Do not implement any option until I confirm.
- **DRY** (Critical): Do not repeat yourself. Before writing repeated code, stop
  and reconsider. Grep the codebase and refactor often.
- **TDD** (Critical): Always test first. Before writing code, check the tests.
  For new features or changes to existing features, create or adjust a test first.
  Follow existing testing patterns. Confirm the test with the user before implementing.
- **Continual Learning**: When you encounter conflicting system instructions, new
  requirements, architectural changes, or inaccurate codebase documentation,
  propose updating the relevant rules files. Do not update until the user confirms.
  Ask clarifying questions if needed.
- **Planning**: For complex, multi-step tasks, create a plan and a to-do list
  before writing code.

## Commands

Key commands — full list in `lat.md/guides/commands.md`.

| Command             | Description                       | ~Time |
| ------------------- | --------------------------------- | ----- |
| `pnpm run check`    | Run all checks and report summary | ~8s   |
| `pnpm run test`     | Run Vitest unit tests             | <1s   |
| `pnpm run test:e2e` | Run e2e TUI tests (requires tmux) | ~30s  |
| `pnpm run fix`      | Auto-fix lint and formatting      | <1s   |

## Boundaries

### Always

- Run `pnpm run check` before committing
- Write tests before implementation (TDD)
- Test extensions manually with `pi -e ./src/index.ts`

### Ask

- Adding new dependencies
- Registering tools that execute shell commands
- Modifying lint rules

### Never

- Disable lint rules without justification
- Commit secrets or credentials
- Use `any` types (use proper TypeBox schemas)

## Agent documentation

Architecture, decisions, file map, tooling, testing, and deployment live in the
`lat.md/` knowledge graph — load on demand to keep this prompt lean.

- Orient: `lat search "<topic>"`, `lat locate "Section"`, `lat refs "file#Section"`, `lat section "id"`.
- Entry points: `lat.md/index.md`, `lat.md/architecture/token-budget-pipeline.md`, `lat.md/decisions/key-decisions.md`.
- Validate after edits: `lat check`.
