import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { env } from './config';
import chatRoutes from './routes/chat.routes';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

// Routes
app.use('/api/chat', chatRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const port = env.PORT;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
