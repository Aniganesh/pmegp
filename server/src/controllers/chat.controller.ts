import { Response } from "express";
import { env } from "../config";
import { AuthenticatedRequest } from "../middleware/user";
import { ChatService } from "../services/chat.service";
import { LLMProvider } from "../services/llm.service";

const chatService = new ChatService();

function userProvidedApiKey(req: AuthenticatedRequest): string | undefined {
  const h = req.headers["x-api-key"];
  if (typeof h === "string" && h.trim()) return h.trim();
  if (
    req.body &&
    typeof (req.body as { apiKey?: string }).apiKey === "string" &&
    (req.body as { apiKey: string }).apiKey.trim()
  ) {
    return (req.body as { apiKey: string }).apiKey.trim();
  }
  return undefined;
}

function resolveApiKey(req: AuthenticatedRequest): string {
  return userProvidedApiKey(req) ?? env.GOOGLE_API_KEY;
}

function resolveProvider(req: AuthenticatedRequest): LLMProvider {
  const h = req.headers["x-api-provider"];
  if (h === "google" || h === "openai" || h === "anthropic") return h;
  const b = (req.body as { provider?: string })?.provider;
  if (b === "google" || b === "openai" || b === "anthropic") return b;
  return "google";
}

export class ChatController {
  async listConversations(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId ?? "anonymous";
      const list = await chatService.listConversations(userId);
      return res.json(list);
    } catch (error) {
      console.error("Error in listConversations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async getConversation(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId ?? "anonymous";
      const { id } = req.params;
      const conv = await chatService.getConversationById(userId, id);
      if (!conv) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      return res.json(conv);
    } catch (error) {
      console.error("Error in getConversation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async deleteConversation(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId ?? "anonymous";
      const { id } = req.params;
      const ok = await chatService.deleteConversation(userId, id);
      if (!ok) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      return res.status(204).send();
    } catch (error) {
      console.error("Error in deleteConversation:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async ask(req: AuthenticatedRequest, res: Response) {
    try {
      const { question, conversationId: bodyConvId } = req.body as {
        question?: string;
        conversationId?: string;
      };
      const userId = req.userId ?? "anonymous";

      if (!question) {
        return res.status(400).json({ error: "Question is required" });
      }

      const conversationId =
        typeof bodyConvId === "string" && bodyConvId.trim()
          ? bodyConvId.trim()
          : undefined;

      const llmConfig = {
        provider: resolveProvider(req),
        apiKey: resolveApiKey(req),
      };

      const response = await chatService.generateAnswer(
        question,
        userId,
        llmConfig,
        conversationId,
      );
      return res.json(response);
    } catch (error: any) {
      console.error("Error in ask controller:", error);
      if (error.message?.includes("Rate limit")) {
        return res.status(429).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async getChatHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId ?? "anonymous";
      const history = await chatService.getChatHistory(userId);
      return res.json(history);
    } catch (error) {
      console.error("Error in getChatHistory controller:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async getUsage(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId ?? "anonymous";
      const hasBYOK = !!userProvidedApiKey(req);

      const usage = chatService.getUsage(userId);
      return res.json({
        ...usage,
        hasBYOK,
      });
    } catch (error) {
      console.error("Error in getUsage controller:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async validateKey(req: AuthenticatedRequest, res: Response) {
    try {
      const { apiKey, provider } = req.body;

      if (!apiKey || !provider) {
        return res
          .status(400)
          .json({ error: "apiKey and provider are required" });
      }

      if (!["google", "openai", "anthropic"].includes(provider)) {
        return res.status(400).json({ error: "Invalid provider" });
      }

      const { generateAnswer } = await import("../services/llm.service");

      try {
        await generateAnswer("Hello", { provider, apiKey }, {
          retrievePmegp: async () => ({ context: "", sources: [] }),
        });
        return res.json({ valid: true });
      } catch (keyError: any) {
        return res.status(400).json({
          valid: false,
          error: keyError.message || "Invalid API key",
        });
      }
    } catch (error) {
      console.error("Error in validateKey controller:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async stream(req: AuthenticatedRequest, res: Response) {
    const question = req.body.question as string;
    const userId = req.userId ?? "anonymous";

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const body = req.body as { model?: string; conversationId?: string };
      const modelFromQuery =
        typeof req.query.model === "string" ? req.query.model : undefined;

      const conversationId =
        typeof body.conversationId === "string" && body.conversationId.trim()
          ? body.conversationId.trim()
          : undefined;

      const llmConfig = {
        provider: resolveProvider(req),
        apiKey: resolveApiKey(req),
        model: body.model ?? modelFromQuery,
      };

      const stream = chatService.streamAnswer(
        question,
        userId,
        llmConfig,
        conversationId,
      );

      for await (const data of stream) {
        if ("meta" in data && data.meta) {
          res.write(`event: meta\n`);
          res.write(
            `data: ${JSON.stringify({
              conversationId: data.meta.conversationId,
            })}\n\n`,
          );
        } else if ("chunk" in data && data.chunk) {
          res.write(`event: delta\n`);
          res.write(`data: ${JSON.stringify({ chunk: data.chunk })}\n\n`);
        } else if ("final" in data && data.final) {
          res.write(`event: final\n`);
          res.write(
            `data: ${JSON.stringify({
              conversationId: data.conversationId,
              usage: data.usage,
            })}\n\n`,
          );
        }
      }
    } catch (error: any) {
      console.error("Error in stream controller:", error);
      res.write(`event: error\n`);
      res.write(
        `data: ${JSON.stringify({
          error: error.message || "Stream error",
        })}\n\n`,
      );
    } finally {
      res.end();
    }
  }
}
