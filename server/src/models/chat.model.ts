import { Schema, model } from 'mongoose';
import { Chat, ChatMessage } from '../types';

const chatMessageSchema = new Schema<ChatMessage>({
  role: {
    type: String,
    required: true,
    enum: ['user', 'assistant', 'system']
  },
  content: {
    type: String,
    required: true
  }
});

const chatSchema = new Schema<Chat>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  messages: [chatMessageSchema],
}, {
  timestamps: true
});

export const ChatModel = model<Chat>('Chat', chatSchema); 