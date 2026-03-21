import { Request, Response } from "express";
import { env } from "../config";
import { ChatService } from "../services/chat.service";
import { LLMProvider } from "../services/llm.service";

const chatService = new ChatService();

function userProvidedApiKey(req: Request): string | undefined {
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

function resolveApiKey(req: Request): string {
  return userProvidedApiKey(req) ?? env.GOOGLE_API_KEY;
}

function resolveProvider(req: Request): LLMProvider {
  const h = req.headers["x-api-provider"];
  if (h === "google" || h === "openai" || h === "anthropic") return h;
  const b = (req.body as { provider?: string })?.provider;
  if (b === "google" || b === "openai" || b === "anthropic") return b;
  return "google";
}

export class ChatController {
  async ask(req: Request, res: Response) {
    try {
      const { question } = req.body;
      const userId = (req as any).userId || "anonymous";

      if (!question) {
        return res.status(400).json({ error: "Question is required" });
      }

      const llmConfig = {
        provider: resolveProvider(req),
        apiKey: resolveApiKey(req),
      };

      const response = await chatService.generateAnswer(
        question,
        userId,
        llmConfig,
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

  async getChatHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || "anonymous";
      const history = await chatService.getChatHistory(userId);
      return res.json(history);
    } catch (error) {
      console.error("Error in getChatHistory controller:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  async getUsage(req: Request, res: Response) {
    try {
      const userId = (req as any).userId || "anonymous";
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

  async validateKey(req: Request, res: Response) {
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
        await generateAnswer("Hello", "Test context", { provider, apiKey });
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

  async stream(req: Request, res: Response) {
    const question = req.body.question as string;
    const userId = (req as any).userId || "anonymous";

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const body = req.body as { model?: string };
      const modelFromQuery =
        typeof req.query.model === "string" ? req.query.model : undefined;

      const llmConfig = {
        provider: resolveProvider(req),
        apiKey: resolveApiKey(req),
        model: body.model ?? modelFromQuery,
      };

      const stream = chatService.streamAnswer(question, userId, llmConfig);

      for await (const data of stream) {
        if (data.chunk) {
          res.write(`data: ${JSON.stringify({ chunk: data.chunk })}\n\n`);
        }
        if (data.usage) {
          res.write(
            `data: ${JSON.stringify({ done: true, usage: data.usage })}\n\n`,
          );
        }
      }
    } catch (error: any) {
      console.error("Error in stream controller:", error);
      res.write(
        `data: ${JSON.stringify({ error: error.message || "Stream error" })}\n\n`,
      );
    } finally {
      res.end();
    }
  }
}
