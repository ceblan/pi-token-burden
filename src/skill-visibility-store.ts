/**
 * Skill Visibility Store.
 *
 * Persists Skill Visibility State to two durable locations:
 *   1. settings.json — `-path` entries for Disabled skills
 *   2. SKILL.md frontmatter — `disable-model-invocation: true` for Hidden skills
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { DisableMode } from "./enums.js";
import type { Settings, SkillInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Settings file I/O
// ---------------------------------------------------------------------------

export function loadSettings(settingsPath: string): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }
  } catch {
    // Ignore
  }
  return {};
}

export function saveSettings(settings: Settings, settingsPath: string): void {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ---------------------------------------------------------------------------
// Frontmatter manipulation (EOL-preserving document model)
// ---------------------------------------------------------------------------

interface FrontmatterDoc {
  hasFrontmatter: boolean;
  lineEnding: "\n" | "\r\n";
  /** Offset where the frontmatter text starts (after the opening --- line). */
  start: number;
  /** Offset where the closing --- line starts. */
  end: number;
}

/**
 * Locate the frontmatter block without modifying the content.
 *
 * Delimiters allow trailing spaces/tabs and both LF and CRLF endings. A file
 * that starts with `---` but has no closing delimiter is treated as having no
 * frontmatter (a fresh block is prepended on set, matching prior behavior).
 */
function parseFrontmatterDocument(raw: string): FrontmatterDoc {
  const lineEnding: "\n" | "\r\n" = raw.includes("\r\n") ? "\r\n" : "\n";
  const noFrontmatter: FrontmatterDoc = {
    hasFrontmatter: false,
    lineEnding,
    start: 0,
    end: 0,
  };

  const opening = /^---[ \t]*(\r?\n)/.exec(raw);
  if (!opening) {
    return noFrontmatter;
  }

  const start = opening[0].length;
  const rest = raw.slice(start);
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!closing) {
    return noFrontmatter;
  }

  return {
    hasFrontmatter: true,
    lineEnding,
    start,
    end: start + closing.index,
  };
}

/** Split into lines keeping each line's own EOL sequence in the element. */
function splitLinesPreserve(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  return (
    text.match(/.*(?:\r?\n|$)/g)?.filter((line) => line.length > 0) ?? [text]
  );
}

function getEol(line: string): "" | "\n" | "\r\n" {
  if (line.endsWith("\r\n")) {
    return "\r\n";
  }
  if (line.endsWith("\n")) {
    return "\n";
  }
  return "";
}

function stripEol(line: string): string {
  return line.replace(/\r?\n$/, "");
}

function frontmatterKeyOf(lineBody: string): string | null {
  const colonIndex = lineBody.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }
  return lineBody.slice(0, colonIndex).trim();
}

export function setFrontmatterField(
  content: string,
  key: string,
  value: string
): string {
  const doc = parseFrontmatterDocument(content);

  if (!doc.hasFrontmatter) {
    return `---${doc.lineEnding}${key}: ${value}${doc.lineEnding}---${doc.lineEnding}${content}`;
  }

  const frontmatterText = content.slice(doc.start, doc.end);
  const lines = splitLinesPreserve(frontmatterText);

  let replaced = false;
  const nextLines: string[] = [];
  for (const line of lines) {
    if (frontmatterKeyOf(stripEol(line)) === key) {
      if (!replaced) {
        nextLines.push(`${key}: ${value}${getEol(line) || doc.lineEnding}`);
        replaced = true;
      }
      // Subsequent duplicate keys are dropped (collapse to one entry).
      continue;
    }
    nextLines.push(line);
  }

  if (!replaced) {
    const lastIndex = nextLines.length - 1;
    if (lastIndex >= 0 && !nextLines[lastIndex].endsWith("\n")) {
      nextLines[lastIndex] = `${nextLines[lastIndex]}${doc.lineEnding}`;
    }
    nextLines.push(`${key}: ${value}${doc.lineEnding}`);
  }

  return (
    content.slice(0, doc.start) + nextLines.join("") + content.slice(doc.end)
  );
}

export function removeFrontmatterField(content: string, key: string): string {
  const doc = parseFrontmatterDocument(content);
  if (!doc.hasFrontmatter) {
    return content;
  }

  const frontmatterText = content.slice(doc.start, doc.end);
  const keptLines = splitLinesPreserve(frontmatterText).filter(
    (line) => frontmatterKeyOf(stripEol(line)) !== key
  );

  return (
    content.slice(0, doc.start) + keptLines.join("") + content.slice(doc.end)
  );
}

// ---------------------------------------------------------------------------
// Atomic file writes
// ---------------------------------------------------------------------------

interface AtomicWriteGuard {
  /**
   * Expected current content of the target file; `null` means the file must
   * be absent. When provided, the file is re-read after the temp file is
   * staged and compared immediately before the rename. On mismatch the temp
   * file is removed and the write aborts — an external edit is never
   * overwritten.
   */
  expected: string | null;
}

/**
 * Write `content` to `filePath` atomically: temp file in the same directory,
 * file mode preserved, then rename (atomic on POSIX).
 *
 * Symlink guard: `renameSync` would replace a symlink with a regular file,
 * destroying the link while leaving its target untouched (`writeFileSync`
 * follows links, so the pre-atomic code preserved them). Resolve to the real
 * path first. `realpathSync` fails when the file does not exist yet (new
 * frontmatter creation) — then `filePath` is used as-is.
 */
export function writeFileSyncAtomic(
  filePath: string,
  content: string,
  guard?: AtomicWriteGuard
): void {
  let resolvedPath = filePath;
  try {
    resolvedPath = fs.realpathSync(filePath);
  } catch {
    // File does not exist yet — write to filePath directly.
  }

  const tmp = path.join(
    path.dirname(resolvedPath),
    `.pi-token-burden-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.tmp`
  );

  let mode: number | undefined;
  try {
    ({ mode } = fs.statSync(resolvedPath));
  } catch {
    // File may not exist yet.
  }

  try {
    fs.writeFileSync(tmp, content, "utf8");
    if (mode !== undefined) {
      fs.chmodSync(tmp, mode);
    }

    if (guard) {
      // Re-read immediately before the rename so the unguarded window is as
      // small as POSIX allows (no compare-and-swap primitive exists).
      let current: string | null;
      try {
        current = fs.readFileSync(resolvedPath, "utf8");
      } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        // Only ENOENT means "absent". ENOTDIR/EISDIR are invalid-path
        // errors and must surface, never be masked as a missing file.
        if (code === "ENOENT") {
          current = null;
        } else {
          throw error;
        }
      }
      if (current !== guard.expected) {
        throw new Error(
          `${filePath} was modified externally while changes were being applied. ` +
            "Aborted the write to avoid overwriting the external edit — re-run the command and retry."
        );
      }
    }

    fs.renameSync(tmp, resolvedPath);
  } catch (error) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // Best-effort temp cleanup.
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Apply changes
// ---------------------------------------------------------------------------

function resolvePathFromBase(input: string, baseDir: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") {
    return path.normalize(os.homedir());
  }
  if (trimmed.startsWith("~/")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  if (trimmed.startsWith("~")) {
    return path.join(os.homedir(), trimmed.slice(1));
  }
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed);
  }
  return path.resolve(baseDir, trimmed);
}

function getSkillRelativePath(skillFilePath: string, agentDir: string): string {
  const skillDir = path.dirname(skillFilePath);

  if (skillDir.startsWith(`${agentDir}${path.sep}`) || skillDir === agentDir) {
    return path.relative(agentDir, skillDir);
  }

  // Fall back to absolute path.
  return skillDir;
}

function buildFrontmatterContent(
  content: string,
  disableModelInvocation: boolean
): string {
  return disableModelInvocation
    ? setFrontmatterField(content, "disable-model-invocation", "true")
    : removeFrontmatterField(content, "disable-model-invocation");
}

interface FrontmatterWriteRecord {
  filePath: string;
  originalContent: string;
  writtenContent: string;
}

/**
 * Restore original frontmatter content, newest write first.
 *
 * Divergence-aware: a file is only restored when its current on-disk content
 * still equals what we wrote. If it changed since (external edit), restoring
 * would clobber that edit — skip it and report the path instead.
 *
 * Returns the paths that could not be rolled back, for error reporting.
 */
function rollbackFrontmatterWrites(
  records: FrontmatterWriteRecord[]
): string[] {
  const skipped: string[] = [];
  for (let i = records.length - 1; i >= 0; i--) {
    const { filePath, originalContent, writtenContent } = records[i];
    try {
      const current = fs.readFileSync(filePath, "utf8");
      if (current !== writtenContent) {
        skipped.push(filePath);
        continue;
      }
      writeFileSyncAtomic(filePath, originalContent);
    } catch {
      skipped.push(filePath);
    }
  }
  return skipped;
}

function formatRollbackSkipped(skipped: string[]): string {
  if (skipped.length === 0) {
    return "";
  }
  return (
    `. Rollback skipped ${skipped.length} file(s) that changed on disk after ` +
    `being written (manual reconciliation required): ${skipped.join(", ")}`
  );
}

function normalizeChangePath(filePath: string): string {
  return path.normalize(path.resolve(filePath));
}

/** Apply durable Skill Visibility State changes. */
function applyChanges(
  changes: Map<string, DisableMode>,
  skillsByName: Map<string, SkillInfo>,
  settingsPath: string,
  agentDir?: string
): void {
  const resolvedAgentDir =
    agentDir ?? path.join(process.env.HOME ?? "", ".pi", "agent");
  const settingsBaseDir = path.dirname(settingsPath);

  const settings = loadSettings(settingsPath);
  const existingSkills = settings.skills ?? [];
  const newSkills: string[] = [];

  // Collect paths to disable / undisable.
  const pathsToDisable = new Set<string>();
  const pathsToUndisable = new Set<string>();
  const frontmatterUpdates = new Map<string, boolean>();

  for (const [skillName, newMode] of changes) {
    const skill = skillsByName.get(skillName);
    if (!skill) {
      continue;
    }

    if (newMode === DisableMode.Disabled) {
      for (const fp of skill.allPaths) {
        pathsToDisable.add(normalizeChangePath(fp));
      }
      continue;
    }

    for (const fp of skill.allPaths) {
      pathsToUndisable.add(normalizeChangePath(fp));
    }

    if (newMode === DisableMode.Hidden) {
      frontmatterUpdates.set(skill.filePath, true);
    }

    if (newMode === DisableMode.Enabled) {
      frontmatterUpdates.set(skill.filePath, false);
    }
  }

  // Filter existing entries — remove disable entries for skills being re-enabled/unhidden.
  for (const entry of existingSkills) {
    if (typeof entry !== "string") {
      continue;
    }

    if (!entry.startsWith("-")) {
      newSkills.push(entry);
      continue;
    }

    const entryDir = resolvePathFromBase(entry.slice(1), settingsBaseDir);
    const shouldRemove = [...pathsToUndisable].some((fp) => {
      const skillDir = path.dirname(fp);
      return entryDir === skillDir || entryDir === fp;
    });

    if (!shouldRemove) {
      newSkills.push(entry);
    }
  }

  // Add new disable entries.
  const existingDisableDirs = new Set(
    newSkills
      .filter((s) => s.startsWith("-"))
      .map((s) => resolvePathFromBase(s.slice(1), settingsBaseDir))
  );

  for (const fp of pathsToDisable) {
    const skillDir = path.dirname(fp);
    if (existingDisableDirs.has(skillDir) || existingDisableDirs.has(fp)) {
      continue;
    }

    const relPath = getSkillRelativePath(fp, resolvedAgentDir);
    newSkills.push(`-${relPath}`);
    existingDisableDirs.add(skillDir);
  }

  const writeRecords: FrontmatterWriteRecord[] = [];

  // Apply frontmatter updates first. If this fails, settings are left untouched.
  try {
    for (const [filePath, disableModelInvocation] of frontmatterUpdates) {
      const originalContent = fs.readFileSync(filePath, "utf8");
      const newContent = buildFrontmatterContent(
        originalContent,
        disableModelInvocation
      );

      if (newContent !== originalContent) {
        writeFileSyncAtomic(filePath, newContent);
        writeRecords.push({
          filePath,
          originalContent,
          writtenContent: newContent,
        });
      }
    }
  } catch (error) {
    const skipped = rollbackFrontmatterWrites(writeRecords);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to update skill frontmatter: ${message}${formatRollbackSkipped(skipped)}`,
      { cause: error }
    );
  }

  // Persist settings; roll back frontmatter if this write fails.
  settings.skills = newSkills;
  try {
    saveSettings(settings, settingsPath);
  } catch (error) {
    const skipped = rollbackFrontmatterWrites(writeRecords);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to save settings: ${message}${formatRollbackSkipped(skipped)}`,
      { cause: error }
    );
  }
}

export class SkillVisibilityStore {
  private readonly settingsPath: string;
  private readonly agentDir?: string;

  constructor(settingsPath: string, agentDir?: string) {
    this.settingsPath = settingsPath;
    this.agentDir = agentDir;
  }

  applyChanges(
    changes: Map<string, DisableMode>,
    skillsByName: Map<string, SkillInfo>
  ): void {
    applyChanges(changes, skillsByName, this.settingsPath, this.agentDir);
  }
}
