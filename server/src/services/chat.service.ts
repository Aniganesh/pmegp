import { Pinecone } from "@pinecone-database/pinecone";
import mongoose from "mongoose";
import { env } from "../config";
import { ChatModel } from "../models/chat.model";
import { ChatResponse } from "../types";
import {
  createRagStream,
  extractWebSearchSources,
  generateAnswer as runLlmAnswer,
  LLMConfig,
} from "./llm.service";
import { UsageService } from "./usage.service";

const pinecone = new Pinecone({
  apiKey: env.PINECONE_API_KEY,
});

const TITLE_MAX = 60;

function truncateTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= TITLE_MAX) return t || "New chat";
  return `${t.slice(0, TITLE_MAX - 1)}…`;
}

export class ChatService {
  private readonly index = pinecone.Index(env.PINECONE_INDEX);

  private async searchPmegp(
    query: string,
  ): Promise<{ context: string; sources: string[] }> {
    const queryResponse = await this.index.searchRecords({
      query: {
        inputs: { text: query },
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

  async listConversations(userId: string) {
    const rows = await ChatModel.find({ userId })
      .sort({ updatedAt: -1 })
      .select("title updatedAt")
      .lean();

    return rows.map((r) => ({
      id: String(r._id),
      title: r.title || "New chat",
      updatedAt: (r.updatedAt as Date).toISOString(),
    }));
  }

  async getConversationById(userId: string, id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await ChatModel.findOne({
      _id: id,
      userId,
    }).lean();
    if (!doc) return null;
    return {
      id: String(doc._id),
      title: doc.title || "New chat",
      messages: doc.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      updatedAt: (doc.updatedAt as Date).toISOString(),
    };
  }

  async deleteConversation(userId: string, id: string): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return false;
    }
    const res = await ChatModel.deleteOne({ _id: id, userId });
    return res.deletedCount === 1;
  }

  private async resolveThreadForUserMessage(
    userId: string,
    question: string,
    chatId?: string,
  ) {
    if (chatId && mongoose.Types.ObjectId.isValid(chatId)) {
      const existing = await ChatModel.findOne({
        _id: chatId,
        userId,
      });
      if (existing) {
        const updated = await ChatModel.findOneAndUpdate(
          { _id: existing._id, userId },
          {
            $push: { messages: { role: "user", content: question } },
            $set: {
              title: existing.title || truncateTitle(question),
            },
          },
          { new: true },
        ).lean();
        return updated!;
      }
    }

    const created = await ChatModel.create({
      userId,
      title: truncateTitle(question),
      messages: [{ role: "user" as const, content: question }],
    });
    return created.toObject();
  }

  async generateAnswer(
    question: string,
    userId: string,
    llmConfig: LLMConfig,
    conversationId?: string,
  ): Promise<ChatResponse> {
    const hasBYOK = llmConfig.apiKey !== env.GOOGLE_API_KEY;
    const limitCheck = UsageService.checkLimit(userId, hasBYOK);

    if (!limitCheck.allowed) {
      throw new Error(
        "Rate limit exceeded. Please provide your own API key for unlimited access.",
      );
    }

    const thread = await this.resolveThreadForUserMessage(
      userId,
      question,
      conversationId,
    );
    const threadMessages = thread.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await runLlmAnswer(question, llmConfig, {
      retrievePmegp: (q) => this.searchPmegp(q),
      threadMessages,
    });

    UsageService.incrementUsage(userId);

    await ChatModel.updateOne(
      { _id: thread._id },
      {
        $push: {
          messages: { role: "assistant" as const, content: response.answer },
        },
      },
    );

    const usage = UsageService.getUsage(userId);
    return {
      answer: response.answer,
      sourceDocuments: response.sourceDocuments,
      webSearchSources: response.webSearchSources,
      conversationId: String(thread._id),
      usage: {
        used: usage.used,
        remaining: usage.remaining,
        resetAt: usage.resetAt,
      },
    };
  }

  async *streamAnswer(
    question: string,
    userId: string,
    llmConfig: LLMConfig,
    conversationId?: string,
  ): AsyncGenerator<
    | { meta: { conversationId: string } }
    | { chunk: string }
    | {
        final: true;
        conversationId: string;
        usage: {
          used: number;
          remaining: number;
          resetAt: string;
          sourceDocuments: string[];
          webSearchSources: { url: string; title?: string }[];
        };
      }
  > {
    const hasBYOK = llmConfig.apiKey !== env.GOOGLE_API_KEY;
    const limitCheck = UsageService.checkLimit(userId, hasBYOK);

    if (!limitCheck.allowed) {
      throw new Error(
        "Rate limit exceeded. Please provide your own API key for unlimited access.",
      );
    }

    const thread = await this.resolveThreadForUserMessage(
      userId,
      question,
      conversationId,
    );
    const convId = String(thread._id);
    yield { meta: { conversationId: convId } };

    const threadMessages = thread.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const { streamResult, getSourceDocuments } = createRagStream(
      llmConfig,
      question,
      (q) => this.searchPmegp(q),
      { threadMessages },
    );

    let fullAnswer = "";

    for await (const chunk of streamResult.textStream) {
      fullAnswer += chunk;
      yield { chunk };
    }

    const webSearchSources = extractWebSearchSources(await streamResult.sources);
    const sourceDocuments = getSourceDocuments();

    UsageService.incrementUsage(userId);

    await ChatModel.updateOne(
      { _id: thread._id },
      {
        $push: {
          messages: { role: "assistant" as const, content: fullAnswer },
        },
      },
    );

    const usage = UsageService.getUsage(userId);
    yield {
      final: true,
      conversationId: convId,
      usage: {
        used: usage.used,
        remaining: usage.remaining,
        resetAt: usage.resetAt,
        sourceDocuments,
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
