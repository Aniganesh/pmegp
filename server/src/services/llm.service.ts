import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
// @ts-ignore
import { dynamicTool, generateText, stepCountIs, streamText } from "ai";
import { z } from "zod";

export type LLMProvider = "google" | "openai" | "anthropic";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

/** Indexed PDF retrieval; implemented in ChatService (Pinecone). */
export type RetrievePmegpFn = (
  query: string,
) => Promise<{ context: string; sources: string[] }>;

export const PMEGP_SYSTEM_PROMPT = `You help users understand the Prime Minister's Employment Generation Programme (PMEGP) in India and what information is provided for each sponsored project (scheme materials and project profiles from government PDFs).

Use the retrieve tool to fetch relevant passages from the indexed scheme PDFs when needed. If a web search tool is available in this session, you may use it for current or external facts; otherwise rely on retrieved materials and your general knowledge within this mandate. If you cannot answer usefully, say so clearly.`;

const MAX_TOOL_STEPS = 15;
const STOP_AFTER_STEPS = stepCountIs(MAX_TOOL_STEPS);
const MAX_HISTORY_MESSAGES = 20;

function toLlmMessages(
  threadMessages: Array<{ role: string; content: string }>,
): { role: "user" | "assistant"; content: string }[] {
  const sliced = threadMessages.slice(-MAX_HISTORY_MESSAGES);
  return sliced
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}

function promptOrMessages(
  fallbackQuestion: string,
  threadMessages?: Array<{ role: string; content: string }>,
): { prompt: string } | { messages: ReturnType<typeof toLlmMessages> } {
  if (threadMessages && threadMessages.length > 0) {
    return { messages: toLlmMessages(threadMessages) };
  }
  return { prompt: fallbackQuestion };
}

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

const retrievePmegpInputSchema = z.object({
  query: z.string(),
});

function createRetrievePmegpTool(
  retrievePmegp: RetrievePmegpFn,
  ragSources: Set<string>,
) {
  return dynamicTool({
    description:
      "Search indexed PMEGP scheme PDFs (guidelines and per-project profiles) for passages relevant to the query. Use when the user needs scheme rules, project-specific details, or profile facts from those materials.",
    inputSchema: retrievePmegpInputSchema as any,
    execute: async (input: any) => {
      const parsed = retrievePmegpInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error("Invalid tool input: query string required");
      }
      const { query } = parsed.data;
      const { context, sources } = await retrievePmegp(query);
      for (const s of sources) {
        if (s) ragSources.add(s);
      }
      const text = context.trim();
      return {
        passages:
          text.length > 0
            ? text
            : "No matching passages were found in the index for this query.",
        sourceFiles: sources,
      };
    },
  });
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
    const title =
      "title" in s && typeof s.title === "string" ? s.title : undefined;
    out.push({ url, title });
  }
  return out;
}

export async function generateAnswer(
  question: string,
  config: LLMConfig,
  options: {
    retrievePmegp: RetrievePmegpFn;
    threadMessages?: Array<{ role: string; content: string }>;
  },
): Promise<{
  answer: string;
  provider: LLMProvider;
  webSearchSources: { url: string; title?: string }[];
  sourceDocuments: string[];
}> {
  const ragSources = new Set<string>();
  const retrieve_pmegp_context = createRetrievePmegpTool(
    options.retrievePmegp,
    ragSources,
  );
  const modelId = config.model || getDefaultModel(config.provider);
  const textInput = promptOrMessages(question, options.threadMessages);

  switch (config.provider) {
    case "google": {
      // Gemini does not support mixing custom tools with provider tools (e.g. google_search) in one call.
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      const result = await generateText({
        // @ts-ignore
        model: google(modelId),
        system: PMEGP_SYSTEM_PROMPT,
        ...textInput,
        tools: {
          retrieve_pmegp_context,
        } as any,
        toolChoice: "auto",
        stopWhen: STOP_AFTER_STEPS,
      });
      return {
        answer: result.text,
        provider: "google",
        webSearchSources: extractWebSearchSources(result.sources),
        sourceDocuments: [...ragSources],
      };
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      const result = await generateText({
        // @ts-ignore
        model: openai(modelId),
        system: PMEGP_SYSTEM_PROMPT,
        ...textInput,
        tools: {
          retrieve_pmegp_context,
          web_search: openai.tools.webSearch({}),
        } as any,
        toolChoice: "auto",
        stopWhen: STOP_AFTER_STEPS,
      });
      return {
        answer: result.text,
        provider: "openai",
        webSearchSources: extractWebSearchSources(result.sources),
        sourceDocuments: [...ragSources],
      };
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      const result = await generateText({
        // @ts-ignore
        model: anthropic(modelId),
        system: PMEGP_SYSTEM_PROMPT,
        ...textInput,
        tools: {
          retrieve_pmegp_context,
          web_search: anthropic.tools.webSearch_20250305({}),
        } as any,
        toolChoice: "auto",
        stopWhen: STOP_AFTER_STEPS,
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
        sourceDocuments: [...ragSources],
      };
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

export function createRagStream(
  config: LLMConfig,
  question: string,
  retrievePmegp: RetrievePmegpFn,
  options?: {
    threadMessages?: Array<{ role: string; content: string }>;
  },
): {
  streamResult: ReturnType<typeof streamText>;
  getSourceDocuments: () => string[];
} {
  const ragSources = new Set<string>();
  const retrieve_pmegp_context = createRetrievePmegpTool(
    retrievePmegp,
    ragSources,
  );
  const modelId = config.model || getDefaultModel(config.provider);
  const textInput = promptOrMessages(question, options?.threadMessages);
  const base = {
    system: PMEGP_SYSTEM_PROMPT,
    ...textInput,
    toolChoice: "auto" as const,
    stopWhen: STOP_AFTER_STEPS,
  };

  switch (config.provider) {
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return {
        streamResult: streamText({
          // @ts-ignore
          model: google(modelId),
          tools: {
            retrieve_pmegp_context,
          } as any,
          ...base,
        }),
        getSourceDocuments: () => [...ragSources],
      };
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return {
        streamResult: streamText({
          // @ts-ignore
          model: openai(modelId),
          tools: {
            retrieve_pmegp_context,
            web_search: openai.tools.webSearch({}),
          } as any,
          ...base,
        }),
        getSourceDocuments: () => [...ragSources],
      };
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: config.apiKey });
      return {
        streamResult: streamText({
          // @ts-ignore
          model: anthropic(modelId),
          tools: {
            retrieve_pmegp_context,
            web_search: anthropic.tools.webSearch_20250305({}),
          } as any,
          ...base,
          providerOptions: {
            anthropic: {
              anthropicBeta: ["web_search_20250305"],
            },
          },
        }),
        getSourceDocuments: () => [...ragSources],
      };
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
