import { PDFService } from '../services/pdf.service';
import mongoose from 'mongoose';
import { env } from '../config';
import fs from 'fs';
import path from 'path';

interface IngestionState {
  ingested: string[];
  lastRun: string;
}

const STATE_FILE = path.join(__dirname, '../../pdfs/ingested.json');
const PDF_DIR = path.join(__dirname, '../../pdfs');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: Infinity,
    skip: 0,
    status: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip' && args[i + 1]) {
      options.skip = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--status') {
      options.status = true;
    }
  }

  return options;
}

function loadIngestedState(): IngestionState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('⚠️ Could not load ingestion state:', e);
  }
  return { ingested: [], lastRun: '' };
}

function saveIngestedState(state: IngestionState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getPDFList(): string[] {
  const files = fs.readdirSync(PDF_DIR);
  return files
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .filter(f => !f.startsWith('.'))
    .sort();
}

async function showStatus() {
  const state = loadIngestedState();
  const allPdfs = getPDFList();
  const ingestedSet = new Set(state.ingested);
  
  const remaining = allPdfs.filter(f => !ingestedSet.has(f)).length;
  
  console.log(`\n📊 Ingestion Status:`);
  console.log(`   Total PDFs: ${allPdfs.length}`);
  console.log(`   Ingested: ${state.ingested.length}`);
  console.log(`   Remaining: ${remaining}`);
  if (state.lastRun) {
    console.log(`   Last run: ${state.lastRun}`);
  }
  
  if (remaining > 0 && remaining <= 10) {
    console.log(`\n   Remaining files:`);
    allPdfs.filter(f => !ingestedSet.has(f)).forEach(f => console.log(`   - ${f}`));
  }
}

async function initializePDFs() {
  const options = parseArgs();
  
  if (options.status) {
    await showStatus();
    process.exit(0);
  }

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const state = loadIngestedState();
    const allPdfs = getPDFList();
    const ingestedSet = new Set(state.ingested);
    
    const toProcess = allPdfs
      .filter(f => !ingestedSet.has(f))
      .slice(options.skip, options.skip + options.limit);

    if (toProcess.length === 0) {
      console.log('✅ No new PDFs to process');
      await showStatus();
      process.exit(0);
    }

    console.log(`📄 Found ${allPdfs.length} PDFs total`);
    console.log(`📄 Already ingested: ${state.ingested.length}`);
    console.log(`📄 Processing: ${toProcess.length} files (skip: ${options.skip}, limit: ${options.limit})`);
    
    const pdfService = new PDFService();
    let processed = 0;
    let failed = 0;

    for (const pdfFile of toProcess) {
      try {
        console.log(`   Processing: ${pdfFile}...`);
        await pdfService.processPDF(path.join(PDF_DIR, pdfFile), pdfFile);
        state.ingested.push(pdfFile);
        processed++;
        console.log(`   ✅ Done: ${pdfFile}`);
      } catch (error) {
        failed++;
        console.error(`   ❌ Failed: ${pdfFile}`, error);
      }
      
      saveIngestedState(state);
    }

    state.lastRun = new Date().toISOString();
    saveIngestedState(state);

    console.log(`\n✅ Processed ${processed} files (${failed} failed)`);
    await showStatus();

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Error initializing PDFs:', error);
    process.exit(1);
  }
}

initializePDFs();
