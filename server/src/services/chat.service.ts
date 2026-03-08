import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config';
import { ChatModel } from '../models/chat.model';
import { ChatResponse } from '../types';

const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });
const embedModel = genAI.getGenerativeModel({ model: "embedding-001" });

const pinecone = new Pinecone({
  apiKey: env.PINECONE_API_KEY,
});

export class ChatService {
  private readonly index = pinecone.Index(env.PINECONE_INDEX);

  async generateAnswer(question: string, userId: string): Promise<ChatResponse> {
    try {
      // Generate embeddings for the question
      const embeddingResult = await embedModel.embedContent(question);
      const questionEmbedding = embeddingResult.embedding.values;

      // Query Pinecone for relevant documents
      const queryResponse = await this.index.query({
        vector: questionEmbedding,
        topK: 3,
        includeMetadata: true,
      });

      // Prepare context from relevant documents
      const context = queryResponse.matches
        ?.map((match) => match.metadata?.text || '')
        .join('\n\n');

      // Generate response using Gemini
      const prompt = `Context: ${context}\n\nQuestion: ${question}\n\nPlease answer the question based on the context provided. If you cannot find the answer in the context, please say "I don't have enough information to answer that question."`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const answer = response.text();

      // Store the chat in MongoDB
      await ChatModel.create({
        userId,
        messages: [
          { role: 'user', content: question },
          { role: 'assistant', content: answer },
        ],
      });

      return {
        answer,
        sourceDocuments: queryResponse.matches?.map(match => match.metadata?.source as string) || [],
      };
    } catch (error) {
      console.error('Error in generateAnswer:', error);
      throw error;
    }
  }

  async getChatHistory(userId: string) {
    return ChatModel.find({ userId }).sort({ createdAt: -1 });
  }
}