# Testing

Unit, e2e, and manual test workflows for the extension.

## Unit tests

Colocated `*.test.ts` files run with `pnpm run test` (192 tests across 16 files).

## E2e tests

End-to-end TUI tests in `src/e2e/*.test.ts` run with `pnpm run test:e2e` (across 4 files, requires tmux, 30s timeout via `vitest.config.e2e.ts`).

The `TmuxHarness` class manages tmux sessions, `sendKeys`, `capture`, and `waitFor` ([[src/e2e/tmux-harness.ts#TmuxHarness]]). Tests use `PI_CODING_AGENT_DIR` for filesystem isolation and a low-cost provider to minimize token usage during TUI verification.

## Manual

Run `pi -e ./src/index.ts`, then type `/token-burden` in the session.
