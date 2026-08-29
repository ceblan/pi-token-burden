# Documentation Sync Report

**Tracked range**: `git log -3` fallback (no tracker found). Last tracked commit now: `c1c0d78f2066263a6ae2180ac09b2dd232413cc5`.

## Commits Reviewed

| Commit | Message | Documented | Action |
|--------|---------|-----------|--------|
| 11170378f3492d48164be71368a6523a9723c5ed | fix: guard settings.json against corruption and external edits | No | Created [[architecture/skill-visibility-store]] |
| 4ddd9d9769bba2eb67ba21541761beb25b71c0a7 | feat: reload pi automatically after saving skill visibility changes | No | Updated [[architecture/skill-visibility-store]] (auto-reload section) |
| c1c0d78f2066263a6ae2180ac09b2dd232413cc5 | migramos de napkin a lat | Yes (already complete) | No change needed |

## @lat Tags Added

| File | Line | Tag |
|------|------|-----|
| src/skill-visibility-store.ts | 18 | `// @lat: [[architecture/skill-visibility-store#Atomic writes with divergence guard]]` |
| src/skill-visibility-store.ts | 111 | `// @lat: [[architecture/skill-visibility-store#Snapshot isolation]]` |
| src/skill-visibility-store.ts | 112 | `// @lat: [[architecture/skill-visibility-store#Settings corruption guard#Shape validation]]` |
| src/index.ts | 251 | `// @lat: [[architecture/skill-visibility-store#Auto-reload after save]]` |

## Link Integrity
- lat check: **PASSED** (0 errors)
- Errors fixed: none (no errors to begin with after initial fixes)

## Additional Actions

- Updated `lat.md/architecture/token-budget-pipeline.md` file map: added `src/skill-visibility-store.ts` entry referencing the new section.
- Updated `lat.md/architecture/architecture.md`: added `[[skill-visibility-store]]` entry.
- Updated `lat.md/lat.md` directory index: added `[[last-commit]]` entry.
- Updated `lat.md/last-commit.md`: added section heading `# Last Commit` to make it a valid lat.md section.
- Fixed `lat check` errors: shortened leading paragraphs (3 sections), fixed section path for `Shape validation` @lat tag, added missing directory index entries, added heading to tracker file.

## Graph, Bridge & Ontology Refresh

| Action | Status | Details |
|--------|--------|---------|
| graphify update | ⏭️ skipped | No `graphify-out/graph.json` found in project root |
| bridge-build | ⏭️ skipped | No `graphify-out/graph.json` found in project root |
| ontology-build | ⏭️ skipped | No `ontology/` directory found in project root |

_Note: graphify+bridge only run when `graphify-out/graph.json` exists; ontology-build only runs when `ontology/` exists. Each layer is independent. All skipped — project uses only lat.md._

## Summary

lat.md is fully in sync — new settings-corruption-guard and auto-reload features documented with 4 @lat tags added, tracker updated to HEAD, and all link checks pass.
