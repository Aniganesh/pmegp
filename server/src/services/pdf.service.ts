import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pdf from 'pdf-parse';
import { env } from '../config';

const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });
const embedModel = genAI.getGenerativeModel({ model: "embedding-001" });

const pinecone = new Pinecone({
  apiKey: env.PINECONE_API_KEY,
});

export class PDFService {
  private readonly index = pinecone.Index(env.PINECONE_INDEX);
  private readonly pdfDirectory = path.join(__dirname, '../../pdfs');

  async processAllPDFs(): Promise<void> {
    try {
      const files = fs.readdirSync(this.pdfDirectory);
      const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));

      console.log(`Found ${pdfFiles.length} PDF files to process`);

      for (const pdfFile of pdfFiles) {
        try {
          await this.processPDF(path.join(this.pdfDirectory, pdfFile), pdfFile);
          console.log(`✅ Processed ${pdfFile}`);
        } catch (error) {
          console.error(`❌ Error processing ${pdfFile}:`, error);
          // Continue with next file even if one fails
        }
      }

      console.log('✅ Finished processing all PDFs');
    } catch (error) {
      console.error('Error processing PDFs:', error);
      throw error;
    }
  }

  private async processPDF(filePath: string, fileName: string): Promise<void> {
    try {
      // Read PDF file
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);

      // Split text into chunks (approximately 1000 characters each)
      const chunks = this.splitTextIntoChunks(pdfData.text, 1000);

      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Generate embedding using Gemini
        const embedding = await this.generateEmbedding(chunk);

        // Store in Pinecone
        await this.index.upsert({
          vectors: [{
            id: `${fileName}-chunk-${i}`,
            values: embedding,
            metadata: {
              text: chunk,
              source: fileName,
              page: Math.floor(i / 2) + 1, // Rough page estimation
            }
          }]
        });
      }
    } catch (error) {
      console.error(`Error processing PDF ${fileName}:`, error);
      throw error;
    }
  }

  private splitTextIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      // Find the end of the current chunk
      let endIndex = startIndex + chunkSize;
      
      // Adjust to end at a sentence or paragraph if possible
      if (endIndex < text.length) {
        const nextPeriod = text.indexOf('.', endIndex);
        const nextNewline = text.indexOf('\n', endIndex);
        
        if (nextPeriod !== -1 && (nextNewline === -1 || nextPeriod < nextNewline)) {
          endIndex = nextPeriod + 1;
        } else if (nextNewline !== -1) {
          endIndex = nextNewline + 1;
        }
      }

      chunks.push(text.slice(startIndex, endIndex).trim());
      startIndex = endIndex;
    }

    return chunks;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const result = await embedModel.embedContent(text);
      const embedding = result.embedding.values;
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }
} 