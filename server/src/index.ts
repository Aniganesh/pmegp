import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Read projects data
const projectsFilePath = path.join(__dirname, '../projects.json');
const projectsData = JSON.parse(fs.readFileSync(projectsFilePath, 'utf8'));

// Routes
app.get('/', (req: Request, res: Response) => {
  res.send('API is running');
});

// API endpoint to get projects data
app.get('/api/projects', (req: Request, res: Response) => {
  res.json(projectsData);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
