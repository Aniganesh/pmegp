# AI Chat Backend

This is the backend server for the AI Chat application. It uses OpenAI's GPT models and Pinecone for vector similarity search to provide context-aware responses.

## Prerequisites

- Node.js (v18 or higher)
- MongoDB
- Pinecone account
- OpenAI API key

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/chat_app
   OPENAI_API_KEY=your_openai_api_key
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_ENVIRONMENT=your_pinecone_environment
   PINECONE_INDEX=your_pinecone_index_name
   ```

4. Build the project:
   ```bash
   pnpm build
   ```

5. Start the development server:
   ```bash
   pnpm dev
   ```

## API Endpoints

### Chat

- `POST /api/chat/ask`
  - Request body: `{ "question": "your question here" }`
  - Optional header: `user-id: "unique-user-id"`
  - Returns: `{ "answer": "AI response", "sourceDocuments": ["source1", "source2"] }`

- `GET /api/chat/history`
  - Optional header: `user-id: "unique-user-id"`
  - Returns: Array of chat messages for the user

### Health Check

- `GET /health`
  - Returns: `{ "status": "ok" }`

## Development

- Run in development mode: `pnpm dev`
- Build for production: `pnpm build`
- Start production server: `pnpm start`

## Environment Variables

- `PORT`: Server port (default: 5000)
- `MONGODB_URI`: MongoDB connection string
- `OPENAI_API_KEY`: Your OpenAI API key
- `PINECONE_API_KEY`: Your Pinecone API key
- `PINECONE_ENVIRONMENT`: Your Pinecone environment
- `PINECONE_INDEX`: Your Pinecone index name

## Error Handling

The API returns appropriate HTTP status codes:
- 200: Success
- 400: Bad Request (missing parameters)
- 500: Internal Server Error

## Security

- API keys are stored in environment variables
- CORS is enabled
- Request validation using Zod
- MongoDB connection is secured