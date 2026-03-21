import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, streamText } from "ai";

export type LLMProvider = "google" | "openai" | "anthropic";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

const MAX_TOOL_STEPS = 15;
const STOP_AFTER_STEPS = stepCountIs(MAX_TOOL_STEPS);

function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case "google":
      return "gemini-2.5-flash";
    case "openai":
      return "gpt-4o";
    case "anthropic":
      return "claude-sonnet-4-5-20250929";
    default:
      return "gemini-2.5-flash";
  }
}

export function buildRagPrompt(context: string, question: string): string {
  const hasContext = context.trim().length > 0;
  const contextBlock = hasContext
    ? `Retrieved scheme materials (from government PDFs on PMEGP-sponsored programmes):\n${context}`
    : "No passages were retrieved from the scheme PDF index for this question (the index may be empty or not match).";

  return `You assist users with the Prime Minister's Employment Generation Programme (PMEGP) in India. Answer to the best of your knowledge and abilities using the tools available.

${contextBlock}

User question: ${question}

How to use sources: You decide what to rely on—only the retrieved scheme materials above, only web search, or both—depending on what is needed for a accurate, helpful answer about PMEGP and related government-sponsored schemes. When retrieved text is authoritative for scheme rules or profiles, prefer it. If you need current facts, locations, policy updates, or details not in the materials, use web search. You may use both when that produces the best answer. If you cannot answer adequately even with these sources, say so clearly.`;
}

export function extractWebSearchSources(
  sources: Array<{ sourceType?: string; url?: string; title?: string }>,
): { url: string; title?: string }[] {
  const seen = new Set<string>();
  const out: { url: string; title?: string }[] = [];
  for (const s of sources) {
    if (s.sourceType !== "url") continue;
    const url = "url" in s && typeof s.url === "string" ? s.url : undefined;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = "title" in s && typeof s.title === "string" ? s.title : undefined;
    out.push({ url, title });
  }
  return out;
}

export async function generateAnswer(
  question: string,
  context: string,
  config: LLMConfig,
): Promise<{
  answer: string;
  provider: LLMProvider;
  webSearchSources: { url: string; title?: string }[];
}> {
  const prompt = buildRagPrompt(context, question);
  const modelId = config.model || getDefaultModel(config.provider);

  switch (config.provider) {
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      const result = await generateText({
        model: google(modelId),
        tools: { google_search: google.tools.googleSearch({}) } as any,
        toolChoice: "auto",
        stopWhen: STOP_AFTER_STEPS,
        prompt,
      });
      return {
        answer: result.text,
        provider: "google",
        webSearchSources: extractWebSearchSources(result.sources),
      };
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      const result = await generateText({
        model: openai(modelId),
        tools: { web_search: openai.tools.webSearch({}) } as any,
        toolChoice: "auto",
        stopWhen: STOP_AFTER_STEPS,
        prompt,
      });
      return {
        answer: result.text,
        provider: "openai",
        webSearchSources: extractWebSearchSources(result.sources),
      };
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      const result = await generateText({
        model: anthropic(modelId),
        tools: { web_search: anthropic.tools.webSearch_20250305({}) } as any,
        toolChoice: "auto",
        stopWhen: STOP_AFTER_STEPS,
        prompt,
        providerOptions: {
          anthropic: {
            anthropicBeta: ["web_search_20250305"],
          },
        },
      });
      return {
        answer: result.text,
        provider: "anthropic",
        webSearchSources: extractWebSearchSources(result.sources),
      };
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

export function createRagStream(config: LLMConfig, prompt: string) {
  const modelId = config.model || getDefaultModel(config.provider);
  const base = {
    prompt,
    toolChoice: "auto" as const,
    stopWhen: STOP_AFTER_STEPS,
  };

  switch (config.provider) {
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return streamText({
        model: google(modelId),
        tools: { google_search: google.tools.googleSearch({}) } as any,
        ...base,
      });
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return streamText({
        model: openai(modelId),
        tools: { web_search: openai.tools.webSearch({}) } as any,
        ...base,
      });
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return streamText({
        model: anthropic(modelId),
        tools: { web_search: anthropic.tools.webSearch_20250305({}) } as any,
        ...base,
        providerOptions: {
          anthropic: {
            anthropicBeta: ["web_search_20250305"],
          },
        },
      });
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
