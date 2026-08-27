import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { DisableMode } from "./enums.js";
import { SkillVisibilityStore } from "./skill-visibility-store.js";
import {
  loadSettings,
  readSettingsSnapshot,
  writeFileSyncAtomic,
} from "./skills-persistence.js";
import type { Settings, SkillInfo } from "./types.js";

function makeSkill(
  name: string,
  filePath: string,
  allPaths?: string[]
): SkillInfo {
  return {
    name,
    description: `${name} description`,
    filePath,
    allPaths: allPaths ?? [filePath],
    mode: DisableMode.Enabled,
    tokens: 100,
    hasDuplicates: (allPaths?.length ?? 1) > 1,
  };
}

function readSettings(settingsPath: string): Settings {
  return JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Settings;
}

function isDisableEntry(entry: string): boolean {
  return entry.startsWith("-");
}

describe("skill visibility store", () => {
  it("persists duplicate Disabled state and removes it when re-enabled", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "visibility-store-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      const firstDir = path.join(tmpDir, "first", "dupe");
      const secondDir = path.join(tmpDir, "second", "dupe");
      const firstPath = path.join(firstDir, "SKILL.md");
      const secondPath = path.join(secondDir, "SKILL.md");
      fs.mkdirSync(firstDir, { recursive: true });
      fs.mkdirSync(secondDir, { recursive: true });
      fs.writeFileSync(firstPath, "---\nname: dupe\ndescription: test\n---\n");
      fs.writeFileSync(secondPath, "---\nname: dupe\ndescription: test\n---\n");

      const store = new SkillVisibilityStore(settingsPath, tmpDir);
      const byName = new Map([
        ["dupe", makeSkill("dupe", firstPath, [firstPath, secondPath])],
      ]);

      store.applyChanges(new Map([["dupe", DisableMode.Disabled]]), byName);
      const disabledEntries =
        readSettings(settingsPath).skills?.filter(isDisableEntry);
      expect(disabledEntries).toHaveLength(2);

      store.applyChanges(new Map([["dupe", DisableMode.Enabled]]), byName);
      expect(readSettings(settingsPath).skills?.filter(Boolean)).toStrictEqual(
        []
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("preserves symlinks when writing frontmatter atomically", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "visibility-store-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      const realDir = path.join(tmpDir, "real-skill");
      const realPath = path.join(realDir, "SKILL.md");
      fs.mkdirSync(realDir, { recursive: true });
      fs.writeFileSync(realPath, "---\nname: linked\ndescription: test\n---\n");

      const linkDir = path.join(tmpDir, "link-skill");
      fs.mkdirSync(linkDir, { recursive: true });
      const linkPath = path.join(linkDir, "SKILL.md");
      fs.symlinkSync(realPath, linkPath);

      const store = new SkillVisibilityStore(settingsPath, tmpDir);
      const byName = new Map([["linked", makeSkill("linked", linkPath)]]);
      store.applyChanges(new Map([["linked", DisableMode.Hidden]]), byName);

      expect(fs.lstatSync(linkPath).isSymbolicLink()).toBeTruthy();
      expect(fs.readFileSync(realPath, "utf8")).toContain(
        "disable-model-invocation: true"
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("preserves file mode on atomic frontmatter writes", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "visibility-store-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      const skillDir = path.join(tmpDir, "mode-skill");
      const skillPath = path.join(skillDir, "SKILL.md");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillPath, "---\nname: s\ndescription: test\n---\n");
      fs.chmodSync(skillPath, 0o640);

      const store = new SkillVisibilityStore(settingsPath, tmpDir);
      const byName = new Map([["s", makeSkill("s", skillPath)]]);
      store.applyChanges(new Map([["s", DisableMode.Hidden]]), byName);

      // oxlint-disable-next-line no-bitwise -- mode mask is intentional
      expect(fs.statSync(skillPath).mode & 0o777).toBe(0o640);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("leaves no temp files behind after a successful apply", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "visibility-store-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      const skillDir = path.join(tmpDir, "skill");
      const skillPath = path.join(skillDir, "SKILL.md");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillPath, "---\nname: s\ndescription: test\n---\n");

      const store = new SkillVisibilityStore(settingsPath, tmpDir);
      const byName = new Map([["s", makeSkill("s", skillPath)]]);
      store.applyChanges(new Map([["s", DisableMode.Hidden]]), byName);

      const leftovers = fs
        .readdirSync(skillDir)
        .filter((f) => f.includes(".pi-token-burden-"));
      expect(leftovers).toStrictEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rolls back earlier frontmatter writes when a later skill file is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "visibility-store-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      const goodDir = path.join(tmpDir, "good");
      const goodPath = path.join(goodDir, "SKILL.md");
      const goodOriginal = "---\nname: good\ndescription: test\n---\n";
      fs.mkdirSync(goodDir, { recursive: true });
      fs.writeFileSync(goodPath, goodOriginal);
      const missingPath = path.join(tmpDir, "missing", "SKILL.md");

      const store = new SkillVisibilityStore(settingsPath, tmpDir);
      // Insertion order matters: "good" is written before "missing" fails.
      const byName = new Map([
        ["good", makeSkill("good", goodPath)],
        ["missing", makeSkill("missing", missingPath)],
      ]);
      const changes = new Map<string, DisableMode>([
        ["good", DisableMode.Hidden],
        ["missing", DisableMode.Hidden],
      ]);

      expect(() => store.applyChanges(changes, byName)).toThrow(
        /Failed to update skill frontmatter/
      );
      expect(fs.readFileSync(goodPath, "utf8")).toBe(goodOriginal);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("writeFileSyncAtomic creates a previously absent file atomically", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "visibility-store-"));
    try {
      const target = path.join(tmpDir, "new-file.md");
      writeFileSyncAtomic(target, "fresh content");

      expect(fs.readFileSync(target, "utf8")).toBe("fresh content");
      expect(
        fs.readdirSync(tmpDir).filter((f) => f.includes(".pi-token-burden-"))
      ).toStrictEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("settings.json robustness", () => {
  it("loadSettings returns {} when the file is absent", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      expect(loadSettings(path.join(tmpDir, "settings.json"))).toStrictEqual(
        {}
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("loadSettings throws on corrupt JSON instead of returning {}", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      fs.writeFileSync(settingsPath, "<<<<<<< HEAD\n{ not json");
      expect(() => loadSettings(settingsPath)).toThrow(/not valid JSON/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("loadSettings throws on valid JSON that is not a settings object", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");

      fs.writeFileSync(settingsPath, "[]");
      expect(() => loadSettings(settingsPath)).toThrow(/not a settings object/);

      fs.writeFileSync(settingsPath, JSON.stringify({ skills: "x" }));
      expect(() => loadSettings(settingsPath)).toThrow(/not a settings object/);

      fs.writeFileSync(settingsPath, "null");
      expect(() => loadSettings(settingsPath)).toThrow(/not a settings object/);

      fs.writeFileSync(settingsPath, JSON.stringify({ packages: "x" }));
      expect(() => loadSettings(settingsPath)).toThrow(/not a settings object/);

      fs.writeFileSync(settingsPath, JSON.stringify({ skills: ["-a", 42] }));
      expect(() => loadSettings(settingsPath)).toThrow(/not a settings object/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite a malformed-shape settings.json", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      const malformed = JSON.stringify({ skills: "x", theme: "dark" });
      fs.writeFileSync(settingsPath, malformed);

      const skillDir = path.join(tmpDir, "skill");
      const skillPath = path.join(skillDir, "SKILL.md");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillPath, "---\nname: s\ndescription: test\n---\n");

      const store = new SkillVisibilityStore(settingsPath, tmpDir);
      const byName = new Map([["s", makeSkill("s", skillPath)]]);

      expect(() =>
        store.applyChanges(new Map([["s", DisableMode.Hidden]]), byName)
      ).toThrow(/not a settings object/);
      // Untouched — the malformed but recoverable file is preserved.
      expect(fs.readFileSync(settingsPath, "utf8")).toBe(malformed);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite a corrupt settings.json and touches nothing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      const corrupt = "{ not valid json";
      fs.writeFileSync(settingsPath, corrupt);

      const skillDir = path.join(tmpDir, "skill");
      const skillPath = path.join(skillDir, "SKILL.md");
      const skillOriginal = "---\nname: s\ndescription: test\n---\n";
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillPath, skillOriginal);

      const store = new SkillVisibilityStore(settingsPath, tmpDir);
      const byName = new Map([["s", makeSkill("s", skillPath)]]);

      expect(() =>
        store.applyChanges(new Map([["s", DisableMode.Hidden]]), byName)
      ).toThrow(/not valid JSON/);

      // Nothing was written: settings keeps the corrupt bytes (recoverable)
      // and the frontmatter was never touched (snapshot throws first).
      expect(fs.readFileSync(settingsPath, "utf8")).toBe(corrupt);
      expect(fs.readFileSync(skillPath, "utf8")).toBe(skillOriginal);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("guarded write succeeds when the file still matches the snapshot", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      fs.writeFileSync(settingsPath, JSON.stringify({ skills: ["a"] }));
      const snapshot = readSettingsSnapshot(settingsPath);

      writeFileSyncAtomic(settingsPath, JSON.stringify({ skills: ["b"] }), {
        expected: snapshot.rawText,
      });

      expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toStrictEqual({
        skills: ["b"],
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("guarded write succeeds when an absent file stays absent", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      const snapshot = readSettingsSnapshot(settingsPath); // absent → null

      writeFileSyncAtomic(settingsPath, "{}", {
        expected: snapshot.rawText,
      });

      expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toStrictEqual(
        {}
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("aborts the guarded write when the file changed after the snapshot", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      fs.writeFileSync(settingsPath, JSON.stringify({ skills: ["a"] }));
      const snapshot = readSettingsSnapshot(settingsPath);

      // External edit lands after the snapshot.
      fs.writeFileSync(settingsPath, JSON.stringify({ skills: ["external"] }));

      expect(() =>
        writeFileSyncAtomic(settingsPath, JSON.stringify({ skills: ["b"] }), {
          expected: snapshot.rawText,
        })
      ).toThrow(/modified externally/);

      // The external edit is preserved and no temp file is left behind.
      expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toStrictEqual({
        skills: ["external"],
      });
      expect(
        fs.readdirSync(tmpDir).filter((f) => f.includes(".pi-token-burden-"))
      ).toStrictEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("aborts the guarded write when an absent file appeared", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      const settingsPath = path.join(tmpDir, "settings.json");
      const snapshot = readSettingsSnapshot(settingsPath); // absent → null
      fs.writeFileSync(settingsPath, "{}");

      expect(() =>
        writeFileSyncAtomic(settingsPath, "{}", {
          expected: snapshot.rawText,
        })
      ).toThrow(/modified externally/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rolls back frontmatter writes when the guarded settings write aborts", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      // Deterministic phase-2 failure without fs mocks: the skill file IS
      // settings.json. Its content is valid JSON, so the snapshot parses;
      // phase 1 then prepends frontmatter to that very file, so the guarded
      // settings write sees on-disk content that differs from the snapshot
      // and aborts — exactly the external-modification path — and the
      // rollback restores phase 1's write.
      const skillDir = path.join(tmpDir, "skill");
      const skillPath = path.join(skillDir, "SKILL.md");
      const original = JSON.stringify({ skills: [] });
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillPath, original);
      const settingsPath = skillPath;

      const store = new SkillVisibilityStore(settingsPath, tmpDir);
      const byName = new Map([["s", makeSkill("s", skillPath)]]);

      expect(() =>
        store.applyChanges(new Map([["s", DisableMode.Hidden]]), byName)
      ).toThrow(/Failed to save settings: .*modified externally/s);
      expect(fs.readFileSync(skillPath, "utf8")).toBe(original);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("surfaces an invalid settings path before touching frontmatter", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-guard-"));
    try {
      // settingsPath under a regular file: ENOTDIR is a configuration error,
      // not an absent file — it must surface, never be masked as "no settings".
      const blocker = path.join(tmpDir, "blocker");
      fs.writeFileSync(blocker, "not a directory");
      const settingsPath = path.join(blocker, "settings.json");

      const skillDir = path.join(tmpDir, "skill");
      const skillPath = path.join(skillDir, "SKILL.md");
      const original = "---\nname: s\ndescription: test\n---\n";
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(skillPath, original);

      const store = new SkillVisibilityStore(settingsPath, tmpDir);
      const byName = new Map([["s", makeSkill("s", skillPath)]]);

      expect(() =>
        store.applyChanges(new Map([["s", DisableMode.Hidden]]), byName)
      ).toThrow(/ENOTDIR/);
      expect(fs.readFileSync(skillPath, "utf8")).toBe(original);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
