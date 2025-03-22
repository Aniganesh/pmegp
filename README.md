# Full-Stack Application with Express, React, TypeScript, Shadcn, Tailwind, and React Router

This is a modern full-stack application using the following technologies:

- **Backend**: Express.js with TypeScript
- **Frontend**: React with TypeScript
- **Routing**: React Router v7 (Framework Mode)
- **UI Components**: Shadcn UI
- **Styling**: Tailwind CSS
- **Package Manager**: pnpm

## Project Structure

```
.
├── client/             # React frontend
│   ├── app/           # React Router app directory
│   ├── components/    # Reusable UI components
│   └── lib/          # Utility functions
└── server/           # Express backend
    └── src/         # TypeScript source files
```

## Prerequisites

- Node.js (v18 or higher)
- pnpm (v8 or higher)

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start the development servers:
   ```bash
   pnpm run dev
   ```
   This will start both the client (port 5173) and server (port 5000) in development mode.

3. Build for production:
   ```bash
   pnpm run build
   ```

4. Start the production server:
   ```bash
   pnpm run start
   ```

## Available Scripts

- `pnpm run dev`: Start both client and server in development mode
- `pnpm run dev:client`: Start only the client in development mode
- `pnpm run dev:server`: Start only the server in development mode
- `pnpm run build`: Build both client and server for production
- `pnpm run build:client`: Build only the client for production
- `pnpm run build:server`: Build only the server for production
- `pnpm run start`: Start the production server

## Features

- Modern React with TypeScript
- Server-side rendering with React Router
- Beautiful UI components with Shadcn UI
- Responsive design with Tailwind CSS
- Express backend with TypeScript
- Hot module replacement
- Dark mode support