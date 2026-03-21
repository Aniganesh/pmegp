import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import pdf from 'pdf-parse';
import { env } from '../config';

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
        }
      }

      console.log('✅ Finished processing all PDFs');
    } catch (error) {
      console.error('Error processing PDFs:', error);
      throw error;
    }
  }

  async processPDF(filePath: string, fileName: string): Promise<void> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);

      const chunks = this.splitTextIntoChunks(pdfData.text, 1000);

      const records = chunks.map((chunk, i) => ({
        id: `${fileName}-chunk-${i}`,
        text: chunk,
        source: fileName,
        page: String(Math.floor(i / 2) + 1),
      }));

      await this.index.upsertRecords({
        records,
      });
    } catch (error) {
      console.error(`Error processing PDF ${fileName}:`, error);
      throw error;
    }
  }

  private splitTextIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      let endIndex = startIndex + chunkSize;
      
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
}
