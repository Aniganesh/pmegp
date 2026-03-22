import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { env } from './config';
import chatRoutes from './routes/chat.routes';
import { userIdentification } from './middleware/user';

const app = express();

const allowedOrigins = env.CLIENT_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, allowedOrigins[0] ?? true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, origin);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(userIdentification);

// Connect to MongoDB
mongoose.connect(env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

// Routes
app.use('/api/chat', chatRoutes);

app.get('/api/projects', (req, res) => {
  const projectsPath = path.join(__dirname, '../projects.json');
  const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'));
  res.json(projects);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const port = env.PORT;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
