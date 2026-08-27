describe("extractSystemTextFromPayload", () => {
  it("returns null for non-object payloads", async () => {
    const { extractSystemTextFromPayload } = await import("./wire-payload.js");
    expect(extractSystemTextFromPayload(null)).toBeNull();
    expect(extractSystemTextFromPayload(42)).toBeNull();
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
      extractSystemTextFromPayload({
        messages: [{ role: "user", content: "hi" }],
      })
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
