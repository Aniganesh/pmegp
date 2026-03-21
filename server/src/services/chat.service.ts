import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config";
import { ChatModel } from "../models/chat.model";
import { ChatResponse } from "../types";
import { generateAnswer, LLMConfig } from "./llm.service";
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

  private getLLMClient(config: LLMConfig) {
    if (config.provider === "google") {
      return new GoogleGenerativeAI(config.apiKey);
    }
    return null;
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

    if (llmConfig.provider === "google") {
      const genAI = new GoogleGenerativeAI(llmConfig.apiKey);
      const model = genAI.getGenerativeModel({
        model: llmConfig.model || "gemini-2.5-flash",
      });

      const prompt = `Context: ${context}\n\nQuestion: ${question}\n\nPlease answer the question based on the context provided. If you cannot find the answer in the context, please say "I don't have enough information to answer that question."`;

      const result = await model.generateContentStream(prompt);

      let fullAnswer = "";

      for await (const chunk of result.stream) {
        const text = chunk.text();
        // Skip if this text already appears at end of accumulated answer
        // This handles both Gemini and Anthropic streaming quirks
        if (fullAnswer.endsWith(text)) continue;
        fullAnswer += text;
        yield { chunk: text };
      }

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
        },
      };
    } else {
      // For OpenAI/Anthropic, use non-streaming and yield chunks manually
      const response = await generateAnswer(question, context, llmConfig);

      const words = response.answer.split(" ");
      let previousChunk = "";
      for (let i = 0; i < words.length; i++) {
        const word = words[i] + (i < words.length - 1 ? " " : "");
        // Skip duplicates in word-by-word streaming
        if (previousChunk === word) continue;
        previousChunk = word;
        yield { chunk: word };
        await new Promise((r) => setTimeout(r, 30));
      }

      UsageService.incrementUsage(userId);

      await ChatModel.create({
        userId,
        messages: [
          { role: "user", content: question },
          { role: "assistant", content: response.answer },
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
        },
      };
    }
  }

  async getChatHistory(userId: string) {
    return ChatModel.find({ userId }).sort({ createdAt: -1 });
  }

  getUsage(userId: string) {
    return UsageService.getUsage(userId);
  }
}
