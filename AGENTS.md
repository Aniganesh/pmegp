# AGENTS.md - Agentic Coding Guidelines

This file provides context for AI agents operating in this repository.

## Project Overview

Full-stack PMEGP project portal with AI chat capability:
- **Frontend**: React 19, React Router v7 (framework mode), TypeScript, Tailwind CSS v4, Shadcn UI
- **Backend**: Express.js with TypeScript
- **AI Stack**: Google Gemini + Pinecone (vector search) + MongoDB (chat history)
- **Package Manager**: pnpm

```
.
├── client/              # React frontend (port 5173)
│   └── app/            # React Router app (use path alias: ~/*)
├── server/            # Express backend (port 5000)
│   ├── src/           # TypeScript source
│   └── pdfs/         # PMEGP PDF files (temporary)
└── projects.json     # Temporary project data (will be replaced with AI RAG)
```

---

## Build Commands

### Root (pnpm)
```bash
pnpm run dev          # Both client + server
pnpm run dev:client   # Client only
pnpm run dev:server   # Server only
pnpm run build        # Build both
pnpm run start        # Production server
```

### Client
```bash
cd client
pnpm run dev          # Dev server (5173)
pnpm run build        # Production build
pnpm run typecheck    # TypeScript check
npx eslint . --ext ts,tsx  # Lint
```

### Server
```bash
cd server
pnpm run dev          # Dev with nodemon (5000)
pnpm run build        # Compile to dist/
pnpm run start        # Run compiled
```

**Testing**: No test framework configured.

---

## Code Style

### TypeScript
- **Client**: Strict mode, `~/*` maps to `./app/*`, ES2022
- **Server**: Strict mode, CommonJS, ES2016

### Import Conventions
```typescript
// Client - use path aliases
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

// Server - relative imports
import express, { Request, Response } from 'express';
```

### Naming
| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `data-table.tsx` |
| Components | PascalCase | `ProjectsTable.tsx` |
| Functions | camelCase | `getProjects()` |
| Interfaces | PascalCase | `Project` |
| Constants | SCREAMING_SNAKE | `PORT` |

### React Patterns
```typescript
// React Router v7 route
export async function loader() {
  const data = await fetchData();
  return { data };
}

export function meta() {
  return [{ title: "Page Title" }];
}

export default function Route({ loaderData }: Route.ComponentProps) {
  return <Component data={loaderData.data} />;
}
```

### Error Handling
```typescript
// Client - return fallback
export async function loader() {
  try {
    const response = await fetch("/api/data");
    return { data: await response.json() };
  } catch (error) {
    console.error("Error:", error);
    return { data: [] };
  }
}

// Server - error middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});
```

### Tailwind CSS
- Use v4 syntax with `@tailwindcss/vite`
- Use `cn()` utility for conditional classes:
```typescript
<div className={cn("base", condition && "conditional")} />
```

---

## Architecture

### Current Data Flow
1. **Temporary**: `server/projects.json` → Express API → React Table
2. **Target**: PDF files → Pinecone (embeddings) → AI Chat → Frontend

### Server Structure
```
server/src/
├── config/         # Environment variables
├── controllers/   # Request handlers
├── models/        # Mongoose models (Chat)
├── routes/        # Express routes
├── services/      # Business logic (ChatService, PDFService)
├── types/         # TypeScript types
└── index.ts       # Express app entry
```

### Key Dependencies
- **AI**: `@google/generative-ai` (Gemini), `@pinecone-database/pinecone`
- **Database**: `mongoose` (MongoDB)
- **Validation**: `zod`

---

## Environment Variables

Create `server/.env`:
```bash
PORT=5000
MONGODB_URI=mongodb://localhost:27017/chat_app
GOOGLE_API_KEY=your_google_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_environment
PINECONE_INDEX=your_index_name
```

---

## File Organization

| Directory | Purpose |
|-----------|---------|
| `client/app/` | React Router routes and components |
| `client/components/` | UI components |
| `client/lib/` | Utilities (`utils.ts`, `types.ts`) |
| `server/src/` | Express app |
| `server/pdfs/` | PMEGP PDF files (temporary) |
| `server/projects.json` | Temporary project list |

---

## Common Tasks

**New Route**: Create `app/routes/filename.tsx` with loader, meta, default export

**New UI Component**: Follow shadcn pattern in `app/components/ui/`

**New API**: Edit `server/src/index.ts`, add route before `app.listen()`

**Initialize PDFs to Pinecone**: Run `server/src/scripts/initializePDFs.ts`

---

## Notes

- `projects.json` is **temporary** - will be replaced with AI RAG over PMEGP PDFs
- Current frontend shows a projects table - needs AI chat UI
- Server has full AI infrastructure ready (needs frontend integration)
- Dark mode via Tailwind `dark:` classes
