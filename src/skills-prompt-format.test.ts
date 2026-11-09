import { formatSkillsForPrompt } from "@earendil-works/pi-coding-agent";

import { DisableMode } from "./enums.js";
import { formatSkillsPromptSection } from "./skills.js";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...actual,
    formatSkillsForPrompt: vi.fn(actual.formatSkillsForPrompt),
  };
});

describe("formatSkillsPromptSection()", () => {
  beforeEach(() => {
    vi.mocked(formatSkillsForPrompt).mockClear();
  });

  it("delegates host-specific preamble formatting to the active pi host", () => {
    const hostSection =
      "\n\nHost-specific skills guidance\n<available_skills>\n</available_skills>";
    vi.mocked(formatSkillsForPrompt).mockReturnValueOnce(hostSection);

    const result = formatSkillsPromptSection([
      {
        name: "visible",
        description: "Visible skill",
        filePath: "/skills/visible/SKILL.md",
        mode: DisableMode.Enabled,
      },
      {
        name: "hidden",
        description: "Hidden skill",
        filePath: "/skills/hidden/SKILL.md",
        mode: DisableMode.Hidden,
      },
    ]);

    expect(result).toBe(hostSection);
    expect(formatSkillsForPrompt).toHaveBeenCalledOnce();
    expect(vi.mocked(formatSkillsForPrompt).mock.calls[0]?.[0]).toStrictEqual([
      expect.objectContaining({
        name: "visible",
        description: "Visible skill",
        filePath: "/skills/visible/SKILL.md",
        baseDir: "/skills/visible",
        disableModelInvocation: false,
      }),
    ]);
  });
});
