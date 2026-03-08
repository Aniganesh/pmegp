import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';

const chatService = new ChatService();

export class ChatController {
  async ask(req: Request, res: Response) {
    try {
      const { question } = req.body;
      const userId = req.headers['user-id'] as string || 'anonymous';

      if (!question) {
        return res.status(400).json({ error: 'Question is required' });
      }

      const response = await chatService.generateAnswer(question, userId);
      return res.json(response);
    } catch (error) {
      console.error('Error in ask controller:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getChatHistory(req: Request, res: Response) {
    try {
      const userId = req.headers['user-id'] as string || 'anonymous';
      const history = await chatService.getChatHistory(userId);
      return res.json(history);
    } catch (error) {
      console.error('Error in getChatHistory controller:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}