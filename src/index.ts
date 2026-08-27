import * as os from "node:os";
import * as path from "node:path";

import {
  discoverAndLoadExtensions,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import {
  attributeBasePrompt,
  extractBaseLines,
  extractContributions,
} from "./base-trace/index.js";
import type { BasePromptTraceResult } from "./base-trace/index.js";
import type { LoadedExtension } from "./base-trace/types.js";
import {
  buildToolDefinitionsSection,
  estimateTokens,
  parseSystemPrompt,
  toolEnvelopeForModel,
} from "./parser.js";
import { showReport } from "./report-view.js";
import { saveSkillToggleResult } from "./skill-save.js";
import {
  SkillVisibilityStore,
  loadSettings,
} from "./skill-visibility-store.js";
import { loadAllSkills } from "./skills.js";
import {
  computeWireFingerprint,
  extractSystemTextFromPayload,
  extractToolsJsonFromPayload,
} from "./wire-payload.js";

/**
 * Resolve the agent directory, matching pi's own resolution logic:
 * 1. Check PI_CODING_AGENT_DIR environment variable
 * 2. Fall back to ~/.pi/agent
 */
function getAgentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir) {
    if (envDir === "~") {
      return os.homedir();
    }
    if (envDir.startsWith("~/")) {
      return path.join(os.homedir(), envDir.slice(2));
    }
    return envDir;
  }
  return path.join(os.homedir(), ".pi", "agent");
}

// ---------------------------------------------------------------------------
// Wire payload capture (before_provider_request)
//
// See wire-payload.ts for why the wire payload is the measurement ground truth.
// The capture is fingerprinted with the model identity and active tool set at
// capture time and only used while that fingerprint still matches — tool
// activation, model switches, and reloads all rebuild the assembled prompt, so
// a stale capture would misreport them.
// ---------------------------------------------------------------------------

interface WireCapture {
  systemPrompt: string;
  toolsJson: string | null;
  fingerprint: string;
  capturedAt: string;
}

let lastWireCapture: WireCapture | null = null;

const extension: ExtensionFactory = (pi) => {
  pi.on("before_provider_request", (event, ctx) => {
    const payload = (event as { payload?: unknown }).payload;
    const systemText = extractSystemTextFromPayload(payload);
    const toolsJson = extractToolsJsonFromPayload(payload);
    // Only cache payloads that carry both a system prompt and the tool list.
    // Side requests (compaction, summaries, titles) use a different system
    // prompt and no tools — caching those would poison the next report.
    if (!systemText || !toolsJson) return;
    lastWireCapture = {
      systemPrompt: systemText,
      toolsJson,
      fingerprint: computeWireFingerprint({
        api: ctx.model?.api,
        provider: ctx.model?.provider,
        id: ctx.model?.id,
        activeTools: pi.getActiveTools(),
      }),
      capturedAt: new Date().toISOString(),
    };
    // Deliberately return nothing: the payload must reach the provider
    // unmodified. This handler is observation-only.
  });

  pi.registerCommand("token-burden", {
    description: "Show token budget breakdown and manage skills",
    handler: async (_args, ctx) => {
      const basePrompt = ctx.getSystemPrompt();
      const currentFingerprint = computeWireFingerprint({
        api: ctx.model?.api,
        provider: ctx.model?.provider,
        id: ctx.model?.id,
        activeTools: pi.getActiveTools(),
      });
      const wire =
        lastWireCapture && lastWireCapture.fingerprint === currentFingerprint
          ? lastWireCapture
          : null;
      const wirePrompt = wire?.systemPrompt ?? null;
      // Prefer the payload actually sent to the provider: it includes any
      // per-request appends contributed by before_agent_start handlers.
      const prompt = wirePrompt ?? basePrompt;
      const parsed = parseSystemPrompt(prompt);

      // Surface per-request appends the base prompt does not know about, so
      // their cost is visible instead of hidden inside the unaccounted tail.
      if (wirePrompt && wirePrompt !== basePrompt) {
        const appends = wirePrompt.startsWith(basePrompt)
          ? wirePrompt.slice(basePrompt.length)
          : null;
        const tokens =
          appends !== null
            ? estimateTokens(appends)
            : Math.max(
                0,
                estimateTokens(wirePrompt) - estimateTokens(basePrompt)
              );
        if (tokens > 0) {
          parsed.sections.push({
            label: "Per-request appends (before_agent_start)",
            chars:
              appends !== null
                ? appends.length
                : Math.abs(wirePrompt.length - basePrompt.length),
            tokens,
            content: appends ?? undefined,
          });
        }
      }

      // Add tool definitions section (function schemas sent via tool-calling API)
      const allTools = pi.getAllTools();
      const activeTools = pi.getActiveTools();
      const toolSection = buildToolDefinitionsSection(
        allTools,
        activeTools,
        toolEnvelopeForModel(ctx.model?.api, ctx.model?.provider)
      );
      if (toolSection) {
        // Annotate with the actual serialized tools payload when a provider
        // request has been observed, next to the simulated envelope variants.
        if (wire?.toolsJson && toolSection.tools) {
          const wireTools = wire.toolsJson;
          const variants =
            toolSection.tools.variants ?? (toolSection.tools.variants = []);
          let pretty = wireTools;
          try {
            pretty = JSON.stringify(JSON.parse(wireTools), null, 2);
          } catch {
            // keep compact form
          }
          variants.push({
            name: "wire payload (actual)",
            chars: wireTools.length,
            tokens: estimateTokens(wireTools),
            content: pretty,
          });
        }
        parsed.sections.push(toolSection);
        parsed.totalTokens += toolSection.tokens;
        parsed.totalChars += toolSection.chars;
      }

      const usage = ctx.getContextUsage();
      const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;

      if (!ctx.hasUI) {
        return;
      }

      const agentDir = getAgentDir();
      const settingsPath = path.join(agentDir, "settings.json");
      const visibilityStore = new SkillVisibilityStore(settingsPath, agentDir);
      const settings = loadSettings(settingsPath);
      const { skills, byName } = loadAllSkills(settings, undefined, agentDir);

      const onRunTrace = async (): Promise<BasePromptTraceResult> => {
        const sm = SettingsManager.create(process.cwd(), agentDir);
        const configuredPaths = sm.getExtensionPaths();
        const { extensions, errors: loadErrors } =
          await discoverAndLoadExtensions(
            configuredPaths,
            process.cwd(),
            agentDir
          );

        const contributions = extractContributions(
          extensions as unknown as LoadedExtension[]
        );

        const baseSection = parsed.sections.find((s) =>
          s.label.startsWith("Base")
        );
        const baseText = baseSection?.content ?? "";
        const { toolLines, guidelineLines } = extractBaseLines(baseText);
        const baseTokens = estimateTokens(baseText);

        const { buckets, evidence } = attributeBasePrompt(
          toolLines,
          guidelineLines,
          contributions,
          baseTokens,
          estimateTokens
        );

        const traceErrors = loadErrors.map((e) => ({
          source: e.path,
          message: e.error,
        }));

        return {
          fingerprint: extensions
            .map((e) => e.path)
            .toSorted()
            .join("|"),
          generatedAt: new Date().toISOString(),
          baseTokens,
          buckets,
          evidence,
          errors: traceErrors,
        };
      };

      await showReport(
        parsed,
        contextWindow,
        ctx,
        skills,
        (result) => {
          const outcome = saveSkillToggleResult(result, (changes) => {
            visibilityStore.applyChanges(changes, byName);
          });

          if (!outcome.ok) {
            ctx.ui.notify(
              `Failed to save settings: ${outcome.errorMessage}`,
              "error"
            );
            return false;
          }

          if (outcome.saved) {
            ctx.ui.notify(
              `Skills updated: ${outcome.summary}. Use /reload or restart for changes to take effect.`,
              "info"
            );
          }

          return true;
        },
        onRunTrace
      );
    },
  });
};

export default extension;
