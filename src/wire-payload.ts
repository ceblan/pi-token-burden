/**
 * Extraction helpers for provider request payloads captured through
 * pi's before_provider_request hook.
 *
 * Command-time ctx.getSystemPrompt() returns the BASE system prompt. Extensions
 * may append text per request through before_agent_start (e.g. condensed-milk's
 * explainer or lat.ts' session reminder); those appends live only in the
 * handler chain's local variable and never reach agent state, so a command-time
 * report silently undercounts every real request.
 *
 * before_provider_request fires once the provider payload is fully assembled —
 * after every before_agent_start handler, regardless of extension load order —
 * so its system text is the ground truth of what the model actually pays for.
 *
 * This module is intentionally dependency-free so it stays trivially testable.
 */

interface TextBlockLike {
  type?: unknown;
  text?: unknown;
}

function joinTextBlocks(blocks: unknown[]): string | null {
  let text = "";
  for (const block of blocks) {
    const candidate = block as TextBlockLike | null;
    if (candidate && typeof candidate.text === "string") {
      text += candidate.text;
    }
  }
  return text.length > 0 ? text : null;
}

/**
 * Extract the system prompt text from a provider request payload.
 * Tolerates the shapes used by the supported provider APIs:
 * - anthropic-messages: `system` as string or array of text blocks
 * - openai-responses: `instructions` string
 * - openai chat completions: leading `system`/`developer` messages
 */
export function extractSystemTextFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  if (typeof p.system === "string" && p.system.length > 0) return p.system;
  if (Array.isArray(p.system)) {
    const text = joinTextBlocks(p.system);
    if (text) return text;
  }

  if (typeof p.instructions === "string" && p.instructions.length > 0) {
    return p.instructions;
  }

  if (Array.isArray(p.messages)) {
    const parts: string[] = [];
    for (const message of p.messages) {
      if (!message || typeof message !== "object") break;
      const m = message as { role?: unknown; content?: unknown };
      if (m.role !== "system" && m.role !== "developer") break;
      if (typeof m.content === "string") {
        parts.push(m.content);
      } else if (Array.isArray(m.content)) {
        const text = joinTextBlocks(m.content);
        if (text) parts.push(text);
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }

  return null;
}

/**
 * Extract the serialized tools array from a provider request payload, as the
 * compact JSON that approximates what the provider charges for.
 */
export function extractToolsJsonFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const tools = (payload as Record<string, unknown>).tools;
  if (!Array.isArray(tools) || tools.length === 0) return null;
  try {
    return JSON.stringify(tools);
  } catch {
    return null;
  }
}

export interface WireFingerprintInput {
  api?: string;
  provider?: string;
  id?: string;
  activeTools: string[];
}

/**
 * Fingerprint of the context a wire payload was captured in. A cached payload
 * is only valid while the model identity and active tool set stay unchanged —
 * tool activation, model switches, and reloads all change the assembled prompt,
 * so a stale capture would misreport them.
 */
export function computeWireFingerprint(input: WireFingerprintInput): string {
  const tools = [...input.activeTools].sort().join(",");
  return [input.api ?? "", input.provider ?? "", input.id ?? "", tools].join("|");
}
