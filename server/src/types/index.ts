export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Chat {
  _id?: string;
  userId: string;
  title?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

/** Sidebar row / GET list response item */
export interface ChatThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface WebSearchSource {
  url: string;
  title?: string;
}

export interface ChatResponse {
  answer: string;
  sourceDocuments?: string[];
  webSearchSources?: WebSearchSource[];
  conversationId?: string;
  usage?: {
    used: number;
    remaining: number;
    resetAt: string;
  };
}
