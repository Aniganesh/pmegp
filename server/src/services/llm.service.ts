import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type LLMProvider = 'google' | 'openai' | 'anthropic';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model?: string;
}

function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case 'google':
      return 'gemini-2.5-flash';
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-haiku-20240307';
    default:
      return 'gemini-2.5-flash';
  }
}

export async function generateAnswer(
  question: string,
  context: string,
  config: LLMConfig
): Promise<{ answer: string; provider: LLMProvider }> {
  const prompt = `Context: ${context}\n\nQuestion: ${question}\n\nPlease answer the question based on the context provided. If you cannot find the answer in the context, please say "I don't have enough information to answer that question."`;

  const model = config.model || getDefaultModel(config.provider);

  switch (config.provider) {
    case 'google': {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      const gemini = genAI.getGenerativeModel({ model });
      const result = await gemini.generateContent(prompt);
      const response = await result.response;
      return { answer: response.text(), provider: 'google' };
    }
    case 'openai': {
      const client = new OpenAI({ apiKey: config.apiKey });
      const result = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
      });
      return { 
        answer: result.choices[0]?.message?.content || '', 
        provider: 'openai' 
      };
    }
    case 'anthropic': {
      const client = new Anthropic({ apiKey: config.apiKey });
      const result = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      return { 
        answer: result.content[0].type === 'text' ? result.content[0].text : '', 
        provider: 'anthropic' 
      };
    }
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}
