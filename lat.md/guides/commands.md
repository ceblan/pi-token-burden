# Commands

pnpm scripts available in this project, with indicative run times.

| Command                 | Description                       | ~Time |
| ----------------------- | --------------------------------- | ----- |
| `pnpm run test`         | Run Vitest unit tests (192 tests) | <1s   |
| `pnpm run test:e2e`     | Run e2e TUI tests (4 files, tmux) | ~30s  |
| `pnpm run typecheck`    | TypeScript type checking          | ~2s   |
| `pnpm run lint`         | Run oxlint linter                 | <1s   |
| `pnpm run lint:fix`     | Run oxlint with auto-fix          | <1s   |
| `pnpm run format`       | Format code with oxfmt            | <1s   |
| `pnpm run format:check` | Check formatting without writing  | <1s   |
| `pnpm run deadcode`     | Detect dead code with knip        | ~2s   |
| `pnpm run duplicates`   | Detect duplicate code with jscpd  | ~1s   |
| `pnpm run check`        | Run all checks and report summary | ~8s   |
| `pnpm run fix`          | Auto-fix lint and formatting      | <1s   |
| `pnpm run changelog`    | Regenerate CHANGELOG.md           | <1s   |
