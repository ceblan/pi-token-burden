import type { DisableMode } from "./enums.js";
import type {
  ParsedPrompt,
  PromptSection,
  Settings,
  SkillInfo,
} from "./types.js";

type CommandHandler = (
  args: string[],
  ctx: {
    getSystemPrompt(): string;
    getContextUsage(): { contextWindow?: number } | null;
    hasUI: boolean;
    model?: { api?: string; provider?: string; contextWindow?: number };
    ui: { notify(message: string, level: string): void };
    reload(): Promise<void>;
  }
) => Promise<void>;

interface ToolDefinition {
  name: string;
  description: string;
  parameters: unknown;
}

interface ParserModule {
  parseSystemPrompt(prompt: string): ParsedPrompt;
  buildToolDefinitionsSection(
    tools: ToolDefinition[],
    activeToolNames?: string[],
    countedEnvelope?: string
  ): PromptSection | null;
  estimateTokens(text: string): number;
  toolEnvelopeForModel(api: string | undefined, provider?: string): string;
}

interface ReportViewModule {
  showReport(...args: unknown[]): Promise<void>;
}

function requireHandler(handler: CommandHandler | null): CommandHandler {
  if (handler === null) {
    throw new Error("token-burden handler not registered");
  }

  return handler;
}

const parseSystemPromptMock = vi.fn<ParserModule["parseSystemPrompt"]>();
const buildToolDefinitionsSectionMock =
  vi.fn<ParserModule["buildToolDefinitionsSection"]>();
const estimateTokensMock = vi.fn<ParserModule["estimateTokens"]>();
const toolEnvelopeForModelMock = vi.fn<ParserModule["toolEnvelopeForModel"]>();
const showReportMock = vi.fn<ReportViewModule["showReport"]>();

interface VisibilityStoreModule {
  SkillVisibilityStore: new (
    settingsPath: string,
    agentDir?: string
  ) => {
    applyChanges(
      changes: Map<string, DisableMode>,
      skillsByName: Map<string, SkillInfo>
    ): void;
  };
  loadSettings(settingsPath: string): Settings;
}

interface SkillsModule {
  loadAllSkills(
    settings: Settings,
    overrideDirs?: string[],
    settingsBaseDir?: string
  ): { skills: SkillInfo[]; byName: Map<string, SkillInfo> };
}

const applyChangesMock = vi.fn();
const loadSettingsMock = vi.fn(() => ({}));
const loadAllSkillsMock = vi.fn(() => ({
  skills: [],
  byName: new Map(),
}));

vi.mock<VisibilityStoreModule>(import("./skill-visibility-store.js"), () => ({
  SkillVisibilityStore: vi.fn(function SkillVisibilityStoreMock() {
    return { applyChanges: applyChangesMock };
  }) as unknown as VisibilityStoreModule["SkillVisibilityStore"],
  loadSettings: loadSettingsMock,
}));

vi.mock<SkillsModule>(import("./skills.js"), () => ({
  loadAllSkills: loadAllSkillsMock,
}));

vi.mock<ParserModule>(import("./parser.js"), () => ({
  parseSystemPrompt: parseSystemPromptMock,
  buildToolDefinitionsSection: buildToolDefinitionsSectionMock,
  estimateTokens: estimateTokensMock,
  toolEnvelopeForModel: toolEnvelopeForModelMock,
}));

vi.mock<ReportViewModule>(import("./report-view.js"), () => ({
  showReport: showReportMock,
}));

describe("extension", () => {
  it("exports a default function", async () => {
    const mod = await import("./index.js");
    expectTypeOf(mod.default).toBeFunction();
  });

  it("passes active tool names when building the tools section", async () => {
    parseSystemPromptMock.mockReturnValue({
      sections: [],
      totalChars: 0,
      totalTokens: 0,
      skills: [],
    });
    buildToolDefinitionsSectionMock.mockReturnValue(null);
    toolEnvelopeForModelMock.mockReturnValue("anthropic");

    const tools = [
      { name: "read", description: "Read files", parameters: {} },
      { name: "bash", description: "Run commands", parameters: {} },
    ];

    let handler: CommandHandler | null = null;
    const pi = {
      registerCommand: vi.fn(
        (
          _name: string,
          { handler: registeredHandler }: { handler: CommandHandler }
        ) => {
          handler = registeredHandler;
        }
      ),
      on: vi.fn(),
      getAllTools: vi.fn(() => tools),
      getActiveTools: vi.fn(() => ["read"]),
    };

    const { default: extension } = await import("./index.js");
    extension(pi as never);

    expect(handler).toBeTypeOf("function");

    const runHandler = requireHandler(handler);

    await runHandler([], {
      getSystemPrompt: () => "prompt",
      getContextUsage: () => null,
      hasUI: false,
      model: { api: "anthropic-messages", provider: "openrouter" },
      ui: { notify: vi.fn() },
      reload: vi.fn(async () => {}),
    });

    expect(toolEnvelopeForModelMock).toHaveBeenCalledWith(
      "anthropic-messages",
      "openrouter"
    );
    expect(buildToolDefinitionsSectionMock).toHaveBeenCalledWith(
      tools,
      ["read"],
      "anthropic"
    );
  });
});

describe("skill save reload", () => {
  function setup(): {
    runHandler: CommandHandler;
    reloadMock: ReturnType<typeof vi.fn<() => Promise<void>>>;
    notifyMock: ReturnType<
      typeof vi.fn<(message: string, level: string) => void>
    >;
  } {
    vi.clearAllMocks();
    parseSystemPromptMock.mockReturnValue({
      sections: [],
      totalChars: 0,
      totalTokens: 0,
      skills: [],
    });
    buildToolDefinitionsSectionMock.mockReturnValue(null);
    toolEnvelopeForModelMock.mockReturnValue("anthropic");

    const reloadMock = vi.fn<() => Promise<void>>(async () => {});
    const notifyMock = vi.fn<(message: string, level: string) => void>();
    let handler: CommandHandler | null = null;
    const pi = {
      registerCommand: vi.fn(
        (
          _name: string,
          { handler: registeredHandler }: { handler: CommandHandler }
        ) => {
          handler = registeredHandler;
        }
      ),
      on: vi.fn(),
      getAllTools: vi.fn(() => []),
      getActiveTools: vi.fn(() => []),
    };
    return {
      runHandler: async (args, ctx) => {
        const { default: extension } = await import("./index.js");
        extension(pi as never);
        return requireHandler(handler)(args, ctx);
      },
      reloadMock,
      notifyMock,
    };
  }

  it("calls ctx.reload after the overlay closes when skill changes were saved", async () => {
    showReportMock.mockImplementation(async (...args: unknown[]) => {
      const onToggleResult = args[4] as (result: {
        applied: boolean;
        changes: Map<string, string>;
      }) => boolean;
      onToggleResult({
        applied: true,
        changes: new Map([["some-skill", "hidden"]]),
      });
    });

    const { runHandler, reloadMock, notifyMock } = setup();

    await runHandler([], {
      getSystemPrompt: () => "prompt",
      getContextUsage: () => null,
      hasUI: true,
      model: { api: "anthropic-messages", provider: "openrouter" },
      ui: { notify: notifyMock },
      reload: reloadMock,
    });

    // oxlint-disable-next-line eslint-plugin-vitest/prefer-called-once -- conflicts with prefer-called-times; both are active
    expect(applyChangesMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.stringContaining("Reloading"),
      "info"
    );
    // oxlint-disable-next-line eslint-plugin-vitest/prefer-called-once -- conflicts with prefer-called-times; both are active
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("does not call ctx.reload when nothing was saved", async () => {
    showReportMock.mockImplementation(async () => {
      // Overlay opened and closed without Ctrl+S.
    });

    const { runHandler, reloadMock } = setup();

    await runHandler([], {
      getSystemPrompt: () => "prompt",
      getContextUsage: () => null,
      hasUI: true,
      model: { api: "anthropic-messages", provider: "openrouter" },
      ui: { notify: vi.fn() },
      reload: reloadMock,
    });

    expect(reloadMock).not.toHaveBeenCalled();
  });
});
