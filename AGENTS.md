# AGENTS.md - Agentic Coding Guidelines

This file provides context for AI agents operating in this repository.

## Project Overview

Full-stack application with:
- **Frontend**: React 19, React Router v7 (framework mode), TypeScript, Tailwind CSS v4, Shadcn UI components
- **Backend**: Express.js with TypeScript
- **Package Manager**: pnpm

```
.
├── client/              # React frontend
│   ├── app/            # React Router app directory (use path alias: ~/*)
│   ├── components/     # Legacy components (being migrated to app/)
│   └── lib/           # Utilities and types
└── server/            # Express backend
    └── src/           # TypeScript source
```

---

## Build Commands

### Root Commands (pnpm)
```bash
pnpm run dev          # Start both client (5173) and server (5000)
pnpm run dev:client   # Client only
pnpm run dev:server   # Server only
pnpm run build        # Build both client and server
pnpm run build:client # Build client for production
pnpm run build:server # Build server for production
pnpm run start        # Start production server
```

### Client Commands (cd client)
```bash
cd client
pnpm run dev          # React Router dev server (port 5173)
pnpm run build        # Production build
pnpm run start        # Run production build
pnpm run typecheck    # TypeScript type checking
# Note: No ESLint script configured - run via npx eslint
```

### Server Commands (cd server)
```bash
cd server
pnpm run dev          # Dev with nodemon + ts-node (port 5000)
pnpm run build        # Compile TypeScript (outputs to dist/)
pnpm run watch        # Watch mode for TypeScript
pnpm run start        # Run compiled server
```

### Linting
```bash
# Client ESLint
cd client && npx eslint . --ext ts,tsx

# TypeScript check (client)
cd client && pnpm run typecheck
```

### Testing
- **No test framework configured** - The server has a placeholder test script
- To add tests, consider installing Vitest (matches Vite) or Jest

---

## Code Style Guidelines

### TypeScript Configuration

**Client** (`client/tsconfig.json`):
- Strict mode enabled
- Path alias: `~/*` maps to `./app/*`
- Module: ES2022
- No emit (builds handled by Vite)

**Server** (`server/tsconfig.json`):
- Strict mode enabled
- Module: CommonJS
- Target: ES2016

### Import Conventions

**Client (use path aliases)**:
```typescript
// Good - use path alias
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { Project } from "~/lib/types";

// Bad - relative path from app/
import { Button } from "../../components/ui/button";
```

**Server**:
```typescript
// Use relative imports
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `data-table.tsx`, `project-utils.ts` |
| Components | PascalCase | `ProjectsTable.tsx`, `Button.tsx` |
| Functions | camelCase | `formatCurrency()`, `getProjects()` |
| Interfaces/Types | PascalCase | `Project`, `RouteConfig` |
| Constants | SCREAMING_SNAKE | `PORT`, `API_BASE_URL` |
| CSS Classes | kebab-case (Tailwind) | `className="flex gap-2 items-center"` |

### React Patterns

**Component Structure**:
```typescript
// Client components use function syntax with explicit types
import type { ComponentProps } from "~/routes/+types/home";

interface ProjectsTableProps {
  projects: Project[];
}

export function ProjectsTable({ projects }: ProjectsTableProps) {
  // Component logic
  return (/* JSX */);
}
```

**React Router v7 Patterns**:
```typescript
// Route with loader
export async function loader() {
  const data = await fetchData();
  return { data };
}

export function meta() {
  return [{ title: "Page Title" }];
}

export default function RouteComponent({ loaderData }: Route.ComponentProps) {
  return <Component data={loaderData.data} />;
}
```

### Error Handling

**Client**:
- Use try/catch in loaders
- Return fallback data on error (don't throw to error boundary unless critical)
```typescript
export async function loader() {
  try {
    const response = await fetch("/api/data");
    return { data: await response.json() };
  } catch (error) {
    console.error("Error fetching data:", error);
    return { data: [] }; // Return fallback
  }
}
```

**Server**:
- Add error handling middleware
- Return appropriate HTTP status codes
```typescript
// Example error handler middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});
```

### Tailwind CSS

- Use Tailwind v4 syntax with `@tailwindcss/vite` plugin
- Follow existing color patterns (from `tailwind.config.js`):
  - `primary`, `secondary`, `destructive`, `muted`, `accent`
  - Use `hsl(var(--color))` pattern for theme integration
- Use `cn()` utility for conditional classes:
```typescript
import { cn } from "~/lib/utils";

<div className={cn(
  "base-class",
  condition && "conditional-class",
  variant === "primary" && "bg-primary text-primary-foreground"
)} />
```

### Data Fetching

- Client fetches from server at `http://localhost:5000/api/`
- Use React Router loaders for SSR data fetching
- Handle loading and error states appropriately

---

## File Organization

### Client
- `app/` - React Router app (routes, components using path aliases)
- `components/` - Legacy components (being phased out)
- `lib/` - Utilities (`utils.ts`, `types.ts`)

### Server
- `src/` - Express app source
- `projects.json` - Data file (read at runtime)

---

## Common Tasks

### Adding a New Route
1. Create `app/routes/filename.tsx`
2. Export loader, meta, and default component
3. React Router v7 auto-discovers routes

### Adding a New UI Component
1. Use existing shadcn pattern: `app/components/ui/component-name/`
2. Follow existing component patterns in `app/components/ui/`

### Adding a New API Endpoint
1. Edit `server/src/index.ts`
2. Add route handler before `app.listen()`
3. Return JSON response

---

## Notes

- Client hot reload works via Vite HMR
- Server uses nodemon for hot reload
- No database - data served from `server/projects.json`
- Dark mode support via Tailwind's `dark:` classes
