import type { ParsedPrompt, PromptSection } from "./types.js";

type CommandHandler = (
  args: string[],
  ctx: {
    getSystemPrompt(): string;
    getContextUsage(): { contextWindow?: number } | null;
    hasUI: boolean;
    model?: { api?: string; provider?: string; contextWindow?: number };
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

describe("extractSystemTextFromPayload", () => {
  it("returns null for non-object payloads", async () => {
    const { extractSystemTextFromPayload } = await import("./wire-payload.js");
    expect(extractSystemTextFromPayload(null)).toBeNull();
    expect(extractSystemTextFromPayload(undefined)).toBeNull();
    expect(extractSystemTextFromPayload("system")).toBeNull();
  });

  it("reads anthropic string system", async () => {
    const { extractSystemTextFromPayload } = await import("./wire-payload.js");
    expect(
      extractSystemTextFromPayload({ system: "base prompt", messages: [] })
    ).toBe("base prompt");
  });

  it("reads anthropic text-block system", async () => {
    const { extractSystemTextFromPayload } = await import("./wire-payload.js");
    expect(
      extractSystemTextFromPayload({
        system: [
          { type: "text", text: "part one " },
          { type: "text", text: "part two" },
        ],
      })
    ).toBe("part one part two");
  });

  it("reads openai-responses instructions", async () => {
    const { extractSystemTextFromPayload } = await import("./wire-payload.js");
    expect(
      extractSystemTextFromPayload({ instructions: "respond as a coder" })
    ).toBe("respond as a coder");
  });

  it("reads leading system/developer messages from chat payloads", async () => {
    const { extractSystemTextFromPayload } = await import("./wire-payload.js");
    expect(
      extractSystemTextFromPayload({
        messages: [
          { role: "system", content: "sys" },
          { role: "developer", content: [{ type: "text", text: "dev" }] },
          { role: "user", content: "hi" },
        ],
      })
    ).toBe("sys\ndev");
  });

  it("returns null when no system content is present", async () => {
    const { extractSystemTextFromPayload } = await import("./wire-payload.js");
    expect(
      extractSystemTextFromPayload({ messages: [{ role: "user", content: "hi" }] })
    ).toBeNull();
    expect(extractSystemTextFromPayload({})).toBeNull();
  });
});

describe("extractToolsJsonFromPayload", () => {
  it("serializes the tools array", async () => {
    const { extractToolsJsonFromPayload } = await import("./wire-payload.js");
    const tools = [{ name: "read", description: "Read", input_schema: {} }];
    expect(extractToolsJsonFromPayload({ tools })).toBe(JSON.stringify(tools));
  });

  it("returns null without tools", async () => {
    const { extractToolsJsonFromPayload } = await import("./wire-payload.js");
    expect(extractToolsJsonFromPayload({})).toBeNull();
    expect(extractToolsJsonFromPayload({ tools: [] })).toBeNull();
    expect(extractToolsJsonFromPayload(null)).toBeNull();
  });
});

describe("computeWireFingerprint", () => {
  it("is stable regardless of tool order", async () => {
    const { computeWireFingerprint } = await import("./wire-payload.js");
    const a = computeWireFingerprint({
      api: "anthropic-messages",
      provider: "kimi-coding",
      id: "k3",
      activeTools: ["read", "bash", "edit"],
    });
    const b = computeWireFingerprint({
      api: "anthropic-messages",
      provider: "kimi-coding",
      id: "k3",
      activeTools: ["edit", "read", "bash"],
    });
    expect(a).toBe(b);
  });

  it("changes when model or tools change", async () => {
    const { computeWireFingerprint } = await import("./wire-payload.js");
    const base = computeWireFingerprint({
      api: "anthropic-messages",
      provider: "kimi-coding",
      id: "k3",
      activeTools: ["read"],
    });
    expect(
      computeWireFingerprint({
        api: "openai-responses",
        provider: "kimi-coding",
        id: "k3",
        activeTools: ["read"],
      })
    ).not.toBe(base);
    expect(
      computeWireFingerprint({
        api: "anthropic-messages",
        provider: "kimi-coding",
        id: "k3",
        activeTools: ["read", "pdf_info"],
      })
    ).not.toBe(base);
  });

  it("tolerates missing model fields", async () => {
    const { computeWireFingerprint } = await import("./wire-payload.js");
    expect(computeWireFingerprint({ activeTools: [] })).toBe("|||");
  });
});
