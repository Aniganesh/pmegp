export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Chat {
  _id?: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WebSearchSource {
  url: string;
  title?: string;
}

export interface ChatResponse {
  answer: string;
  sourceDocuments?: string[];
  webSearchSources?: WebSearchSource[];
  usage?: {
    used: number;
    remaining: number;
    resetAt: string;
  };
}
