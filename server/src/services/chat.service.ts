import { Pinecone } from "@pinecone-database/pinecone";
import { env } from "../config";
import { ChatModel } from "../models/chat.model";
import { ChatResponse } from "../types";
import {
  buildRagPrompt,
  createRagStream,
  extractWebSearchSources,
  generateAnswer,
  LLMConfig,
} from "./llm.service";
import { UsageService } from "./usage.service";

const pinecone = new Pinecone({
  apiKey: env.PINECONE_API_KEY,
});

export class ChatService {
  private readonly index = pinecone.Index(env.PINECONE_INDEX);

  private async getContext(
    question: string,
  ): Promise<{ context: string; sources: string[] }> {
    const queryResponse = await this.index.searchRecords({
      query: {
        inputs: { text: question },
        topK: 3,
      },
    });

    const hits = queryResponse.result?.hits || [];

    const context =
      hits.map((hit: any) => hit.fields?.text || "").join("\n\n") || "";

    const sources =
      hits.map((hit: any) => hit.fields?.source).filter(Boolean) || [];

    return { context, sources };
  }

  async generateAnswer(
    question: string,
    userId: string,
    llmConfig: LLMConfig,
  ): Promise<ChatResponse> {
    const hasBYOK = llmConfig.apiKey !== env.GOOGLE_API_KEY;
    const limitCheck = UsageService.checkLimit(userId, hasBYOK);

    if (!limitCheck.allowed) {
      throw new Error(
        "Rate limit exceeded. Please provide your own API key for unlimited access.",
      );
    }

    try {
      const { context, sources } = await this.getContext(question);
      const response = await generateAnswer(question, context, llmConfig);

      UsageService.incrementUsage(userId);

      await ChatModel.create({
        userId,
        messages: [
          { role: "user", content: question },
          { role: "assistant", content: response.answer },
        ],
      });

      const usage = UsageService.getUsage(userId);
      return {
        answer: response.answer,
        sourceDocuments: sources,
        webSearchSources: response.webSearchSources,
        usage: {
          used: usage.used,
          remaining: usage.remaining,
          resetAt: usage.resetAt,
        },
      };
    } catch (error) {
      console.error("Error in generateAnswer:", error);
      throw error;
    }
  }

  async *streamAnswer(
    question: string,
    userId: string,
    llmConfig: LLMConfig,
  ): AsyncGenerator<{ chunk: string; usage?: any }> {
    const hasBYOK = llmConfig.apiKey !== env.GOOGLE_API_KEY;
    const limitCheck = UsageService.checkLimit(userId, hasBYOK);

    if (!limitCheck.allowed) {
      throw new Error(
        "Rate limit exceeded. Please provide your own API key for unlimited access.",
      );
    }

    const { context, sources } = await this.getContext(question);
    const prompt = buildRagPrompt(context, question);
    const streamResult = createRagStream(llmConfig, prompt);

    let fullAnswer = "";

    for await (const chunk of streamResult.textStream) {
      fullAnswer += chunk;
      yield { chunk };
    }

    const webSearchSources = extractWebSearchSources(await streamResult.sources);

    UsageService.incrementUsage(userId);

    await ChatModel.create({
      userId,
      messages: [
        { role: "user", content: question },
        { role: "assistant", content: fullAnswer },
      ],
    });

    const usage = UsageService.getUsage(userId);
    yield {
      chunk: "",
      usage: {
        used: usage.used,
        remaining: usage.remaining,
        resetAt: usage.resetAt,
        sourceDocuments: sources,
        webSearchSources,
      },
    };
  }

  async getChatHistory(userId: string) {
    return ChatModel.find({ userId }).sort({ createdAt: -1 });
  }

  getUsage(userId: string) {
    return UsageService.getUsage(userId);
  }
}
