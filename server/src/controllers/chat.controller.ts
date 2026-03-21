import { Request, Response } from "express";
import { ChatService } from "../services/chat.service";
import { LLMProvider } from "../services/llm.service";
import { env } from "../config";

const chatService = new ChatService();

export class ChatController {
  async ask(req: Request, res: Response) {
    try {
      const { question } = req.body;
      const userId = (req as any).userId || "anonymous";
      const userApiKey = req.headers["x-api-key"] as string;
      const provider =
        (req.headers["x-api-provider"] as LLMProvider) || "google";

      if (!question) {
        return res.status(400).json({ error: "Question is required" });
      }

      const llmConfig = {
        provider,
        apiKey: userApiKey || env.GOOGLE_API_KEY,
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
      const userApiKey = req.headers["x-api-key"] as string;
      const hasBYOK = !!userApiKey;

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
    const userApiKey = req.headers["x-api-key"] as string;
    const provider = (req.headers["x-api-provider"] as LLMProvider) || "google";

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const llmConfig = {
        provider,
        apiKey: userApiKey || env.GOOGLE_API_KEY,
        model: req.query.model as string,
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
