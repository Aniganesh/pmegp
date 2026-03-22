import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.string().default('5000'),
  CLIENT_ORIGINS: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string(),
  GOOGLE_API_KEY: z.string(),
  PINECONE_API_KEY: z.string(),
  PINECONE_ENVIRONMENT: z.string(),
  PINECONE_INDEX: z.string(),
  FREE_QUERIES_PER_DAY: z.string().default('10'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.toString());
  process.exit(1);
}

export const env = parsed.data; 