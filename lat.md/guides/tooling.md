# Tooling

Lint, format, type-check, test, and CI tooling used across the project.

| Tool                | Config                                    | Purpose                                 |
| ------------------- | ----------------------------------------- | --------------------------------------- |
| oxlint + ultracite  | `.oxlintrc.json`                          | Linting with Factory rules              |
| oxfmt               | `.oxfmtrc.jsonc`                          | Code formatting                         |
| TypeScript          | `tsconfig.json`                           | Type checking (strict mode)             |
| Vitest              | `vitest.config.ts`                        | Unit testing                            |
| husky + lint-staged | `.husky/pre-commit`, `.lintstagedrc.json` | Pre-commit hooks                        |
| knip                | `knip.json`                               | Dead code detection                     |
| jscpd               | `.jscpd.json`                             | Duplicate code detection (1% threshold) |
| changelogen         | `package.json` (`version` script)         | Changelog generation from commits       |
| GitHub Actions      | `.github/workflows/check.yml`             | CI pipeline                             |

## Pre-commit

On every commit, husky runs `lint-staged` (oxlint fix + oxfmt on staged files).

## CI

`.github/workflows/check.yml` runs `pnpm run check` on push to `main` and on pull requests.
