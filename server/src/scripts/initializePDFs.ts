import { PDFService } from '../services/pdf.service';
import mongoose from 'mongoose';
import { env } from '../config';

async function initializePDFs() {
  try {
    // Connect to MongoDB
    await mongoose.connect(env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const pdfService = new PDFService();
    
    console.log('🔄 Starting PDF processing...');
    await pdfService.processAllPDFs();
    console.log('✅ All PDFs processed successfully');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing PDFs:', error);
    process.exit(1);
  }
}

initializePDFs(); 