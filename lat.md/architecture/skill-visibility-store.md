# Skill Visibility Store

Persistence layer for skill visibility state: reads, validates, and writes `settings.json` with atomic writes, snapshot isolation, and corruption guards.

## Purpose

Maps skill names to `DisableMode` states and persists them via frontmatter in `SKILL.md` files and a merge into `settings.json`. The store now refuses to overwrite a corrupt or malformed `settings.json` instead of silently treating it as empty.

## Settings corruption guard

`loadSettings` no longer swallows errors. It now throws on any non-ENOENT filesystem error and on valid JSON with an invalid shape.

### Shape validation

`assertSettingsShape` rejects JSON that parses but is not a valid settings object:

- Root must be an object (not array, primitive, or null)
- `skills`, if present, must be an array of strings (not a string or mixed types)
- `packages`, if present, must be an array

TypeError messages tell the user to fix or remove the file manually. This prevents silent data loss: a non-array `skills` would iterate as individual characters and be mangled on every save.

See [[src/skill-visibility-store.ts#assertSettingsShape]].

### ENOTDIR / EISDIR propagation

Only `ENOENT` maps to "absent file" (returns `{}`). `ENOTDIR` and `EISDIR` on the settings path surface as errors — a broken path can never look like a fresh install and be written over.

See [[src/skill-visibility-store.ts#readSettingsSnapshot]].

## Snapshot isolation

`readSettingsSnapshot` reads `settings.json` exactly once, capturing both the raw text and the parsed value in the same read. Two separate reads could see a concurrent edit in only one of them, creating a parse-vs-baseline race.

Returns `{ exists, rawText, parsed }` where `rawText` is `null` when the file is absent.

See [[src/skill-visibility-store.ts#readSettingsSnapshot]].

## Atomic writes with divergence guard

`writeFileSyncAtomic` writes via a temp file in the same directory, preserving file mode, then `renameSync` (atomic on POSIX). A symlink guard resolves to the real path first — `renameSync` would replace a symlink with a regular file.

### Guard mode

With a `guard`, the write re-reads immediately before rename and aborts if the file differs from expected content — preventing an external edit from being overwritten. The unguarded window is limited to the `renameSync` call.

See [[src/skill-visibility-store.ts#writeFileSyncAtomic]].

## applyChanges flow

The `applyChanges` method (called by `SkillVisibilityStore.applyChanges`) has two phases:

**Phase 1 — frontmatter writes**: Captures a `readSettingsSnapshot` once (validates the file is readable and shape-correct before touching anything). Writes frontmatter to all affected `SKILL.md` files. If any frontmatter write fails, `rollbackFrontmatterWrites` restores originals and the method throws.

**Phase 2 — guarded settings write**: Merges skill names into the snapshot's `settings.skills` array and calls `writeFileSyncAtomic` with the guard. The guard re-reads the file after the temp is staged and aborts if it differs from the snapshot — preventing an external edit from being overwritten. On abort, the frontmatter rollback runs.

The `saveSettings` function keeps the simple unguarded API; the guarded path lives only in `applyChanges`.

See [[src/skill-visibility-store.ts#SkillVisibilityStore#applyChanges]].

## Auto-reload after save

When skill visibility changes are persisted via Ctrl+S, the extension calls `ctx.reload()` automatically instead of asking the user to run `/reload` manually.

`onToggleResult` is synchronous and runs inside the `ctx.ui.custom()` overlay — awaiting `ctx.reload()` there would reload pi with the overlay open. The handler sets a `needsReload` flag when `outcome.saved` is true, awaits `showReport()` as before, then calls `ctx.reload()` only after the overlay has closed. Multiple saves in one overlay session coalesce into a single reload.

See [[architecture/skill-visibility-store#Auto-reload after save]].

## Exports

Public API re-exported through [[src/skills-persistence.ts]] for the compat module:

- `loadSettings` — load and validate settings
- `readSettingsSnapshot` — single-read snapshot capture
- `writeFileSyncAtomic` — atomic write with optional divergence guard
- `applyChanges` — convenience wrapper around `SkillVisibilityStore.applyChanges`
