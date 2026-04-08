# Inhale — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-enhanced interactive PDF reader for scientific papers where every element is interactive and AI-augmented, using a BYOK (Bring Your Own Key) model.

**Architecture:** Hybrid monorepo — Next.js 16 App Router handles CRUD/auth/frontend, FastAPI handles heavy processing (OCR, RAG, embeddings). Postgres 16 + pgvector for storage and vector search. Drizzle ORM owns all migrations; SQLAlchemy mirrors read-only. SSE for AI streaming, WebSocket only for voice mode.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, shadcn/ui (nova), Better Auth, Drizzle ORM, react-pdf v9, Zustand, FastAPI, SQLAlchemy 2.0, Celery + Redis, PGVector, OpenRouter (BYOK), Node.js crypto AES-256-GCM

**PRD Source:** `/Users/mohidbutt/Documents/Claudius/Second Brain/Projects/Episteme/Inhale_PRD_ERD.md`

**Previous plan (reference):** `.claude/plans/staged-drifting-crab.md`

---

## Progress

| Phase | Status | Notes |
|---|---|---|
| **0.0 — Infrastructure & Database** | DONE | Postgres+Redis Docker, Drizzle schema (users, documents, user_api_keys), migration generated |
| **0.1 — Authentication** | NEXT | — |
| 0.2 — Document Upload & Library | Pending | — |
| 0.3 — PDF Reader (Core Rendering) | Pending | — |
| 0.4 — Highlighting | Pending | — |
| 0.5 — Comments & BYOK Settings | Pending | — |
| 1.0 — FastAPI Service Bootstrap | Pending | — |
| 1.1 — Celery Pipeline & Processing | Pending | — |
| 1.2 — AI Outline & Section Preview | Pending | — |
| 1.3 — Basic RAG Q&A + Viewport Awareness | Pending | — |
| 2.0–2.3 | Pending | — |
| 3.0–3.3 | Pending | — |
| 4.0–4.4 | Pending | — |

---

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Backend split | Next.js API routes (CRUD/auth) + FastAPI (OCR, RAG, embeddings) | Avoids dual-stack overhead for simple ops; keeps Python where its ecosystem is superior |
| Auth | Better Auth (self-hosted TS lib) | Email+password built-in, OAuth plugin later, stores in your Postgres, no vendor lock-in |
| ORM (JS) | Drizzle ORM | Lightweight, SQL-like, excellent TS inference, schema-as-code |
| ORM (Python) | SQLAlchemy 2.0 (async, read-only reflection) | Mature, pgvector extension, same DB. Drizzle owns all migrations. |
| Streaming | SSE for text agent + all AI features; WebSocket only for voice | SSE simpler, works through Vercel/Cloudflare, auto-reconnects |
| PDF rendering | react-pdf v9 (wraps PDF.js) | React 19 support, canvas + text layer |
| Reader state | Zustand | Minimal boilerplate for page/zoom/scroll state |
| Vector DB | PGVector (Postgres extension) | No separate service, lives in existing Postgres |
| Task queue | Celery + Redis | Standard Python background processing |
| LLM | OpenRouter (BYOK) | User provides key, multi-model access |
| OCR | Mistral OCR API (BYOK) | Best-in-class for scientific PDFs |
| Citations | Semantic Scholar API (free) | Comprehensive, good rate limits |
| Encryption | Node.js crypto AES-256-GCM | Built-in, zero dependencies |
| Repo structure | Monorepo: `src/` (Next.js) + `services/processing/` (FastAPI) | Simple, shared DB, one git history |

---

## Dependency Graph

```
0.0 (Infra) ✅ → 0.1 (Auth) → 0.2 (Upload) → 0.3 (Reader) → 0.4 (Highlights) → 0.5 (Comments/BYOK)
                                                    |
                                                    v
                                              1.0 (FastAPI) → 1.1 (Pipeline) → 1.2 (Outline) + 1.3 (RAG)
                                                                                    |
                                                                        2.0–2.3 (independent of each other)
                                                                                    |
                                                                        3.0–3.3 (independent of each other)
                                                                                    |
                                                                        4.0–4.4 (can interleave after Phase 1)
```

---

## Existing Files (Phase 0.0 — already built)

- `docker-compose.yml` — Postgres 16 (pgvector) + Redis 7
- `drizzle.config.ts` — schema at `src/db/schema/index.ts`, output `drizzle/`
- `src/db/index.ts` — postgres.js connection singleton
- `src/db/schema/users.ts` — users table (serial PK, email unique, password_hash, display_name, avatar_url, timestamps)
- `src/db/schema/documents.ts` — documents table + processing_status enum
- `src/db/schema/user-api-keys.ts` — user_api_keys table + provider_type, storage_mode enums
- `src/db/schema/index.ts` — barrel export
- `src/app/layout.tsx` — root layout with Geist fonts
- `src/app/page.tsx` — landing page
- `src/app/globals.css` — full light/dark shadcn theme vars
- `src/components/ui/button.tsx` — shadcn button
- `src/lib/utils.ts` — `cn()` utility
- `drizzle/0000_*.sql` — generated migration

---

## File Structure (all phases)

### Phase 0: Core Reader

```
src/
├── lib/
│   ├── auth.ts                      # Better Auth server config
│   ├── auth-client.ts               # Better Auth client
│   ├── encryption.ts                # AES-256-GCM encrypt/decrypt
│   └── storage.ts                   # File storage abstraction (local fs → S3 later)
├── middleware.ts                     # Auth session middleware
├── app/
│   ├── api/
│   │   ├── auth/[...all]/route.ts   # Better Auth catch-all handler
│   │   ├── documents/
│   │   │   ├── upload/route.ts      # POST multipart upload
│   │   │   ├── [id]/route.ts        # GET/DELETE document
│   │   │   ├── [id]/file/route.ts   # GET raw PDF binary
│   │   │   ├── [id]/highlights/route.ts  # CRUD highlights
│   │   │   └── [id]/comments/route.ts    # CRUD comments
│   │   └── settings/
│   │       └── api-keys/route.ts    # CRUD encrypted API keys
│   ├── (auth)/
│   │   ├── login/page.tsx           # Login page
│   │   └── signup/page.tsx          # Signup page
│   ├── (main)/
│   │   ├── layout.tsx               # App shell with nav
│   │   ├── library/page.tsx         # Document grid
│   │   └── settings/
│   │       ├── page.tsx             # Settings landing
│   │       └── api-keys/page.tsx    # BYOK key management
│   └── (reader)/
│       └── reader/[documentId]/page.tsx  # Full-screen reader
├── components/
│   ├── auth/
│   │   └── user-menu.tsx            # Avatar dropdown (sign out, settings)
│   ├── library/
│   │   ├── upload-zone.tsx          # Drag-and-drop upload
│   │   └── document-card.tsx        # Library grid item
│   └── reader/
│       ├── pdf-viewer.tsx           # Scroll container + virtual rendering
│       ├── pdf-page.tsx             # Single page (canvas + text layer)
│       ├── reader-toolbar.tsx       # Top bar: title, page nav, zoom
│       ├── zoom-controls.tsx        # Zoom in/out/fit buttons
│       ├── highlight-layer.tsx      # Colored overlays on PDF pages
│       ├── selection-toolbar.tsx    # Floating bar on text select
│       ├── highlights-sidebar.tsx   # Right panel listing highlights
│       ├── comment-thread.tsx       # Comment display with replies
│       └── comment-input.tsx        # Comment text input
├── hooks/
│   ├── use-pdf-document.ts          # Load PDF.js document
│   ├── use-reader-state.ts          # Zustand store: page, zoom, scroll
│   └── use-text-selection.ts        # Detect text selection on PDF
└── db/schema/
    ├── user-highlights.ts           # Added in 0.4
    └── user-comments.ts             # Added in 0.5
```

### Phase 1: First AI Features

```
services/processing/
├── app/
│   ├── main.py                      # FastAPI app + CORS + health
│   ├── config.py                    # Settings from env
│   ├── celery_app.py                # Celery config
│   ├── models/                      # SQLAlchemy mirrors (read-only)
│   │   ├── __init__.py
│   │   └── base.py                  # Async engine + session factory
│   ├── routers/
│   │   ├── health.py                # GET /health
│   │   ├── processing.py            # POST /process/{doc_id}
│   │   └── rag.py                   # POST /rag/query (SSE)
│   ├── tasks/
│   │   ├── process_document.py      # OCR → section split → chunk
│   │   ├── generate_embeddings.py   # Embed chunks → pgvector
│   │   └── generate_outline.py      # LLM outline generation
│   └── services/
│       ├── chunking.py              # Text → overlapping chunks
│       ├── embeddings.py            # OpenRouter embeddings client
│       ├── llm.py                   # OpenRouter chat client
│       └── rag.py                   # Vector search + rerank + answer
├── requirements.txt
├── Dockerfile
└── pyproject.toml

src/
├── db/schema/
│   ├── document-sections.ts         # Added in 1.1
│   ├── document-chunks.ts           # Added in 1.1
│   └── processing-jobs.ts           # Added in 1.1
├── components/
│   ├── library/
│   │   └── processing-badge.tsx     # Status indicator on cards
│   └── reader/
│       ├── outline-sidebar.tsx      # AI-generated doc outline
│       ├── section-preview.tsx      # Hover preview popover
│       ├── concepts-panel.tsx       # Selected text explanation
│       ├── chat-panel.tsx           # RAG Q&A sidebar
│       └── chat-message.tsx         # Single chat message
└── hooks/
    ├── use-chat.ts                  # SSE chat hook
    └── use-viewport-tracking.ts     # Debounced scroll → visible sections
```

---

# Phase 0: Core Reader

## Phase 0.0 — Infrastructure & Database [DONE]

Already complete. Docker Compose (Postgres 16 + pgvector, Redis 7), Drizzle ORM setup, initial schema (users, documents, user_api_keys), migration generated.

**Prerequisite for all subsequent tasks:** Run `docker compose up -d` and `npx drizzle-kit push` to create tables.

---

## Phase 0.1 — Authentication

### Task 1: Better Auth Server Setup

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Modify: `src/db/schema/users.ts` (Better Auth may need schema adjustments)

**Docs to check:** Better Auth docs at https://www.better-auth.com/docs — read the "Installation" and "Database" sections. Better Auth can auto-create its own tables or you can use existing ones. Check which approach works with Drizzle.

- [ ] **Step 1: Install Better Auth**

```bash
npm install better-auth
```

- [ ] **Step 2: Read Better Auth docs for Drizzle integration**

Check https://www.better-auth.com/docs/adapters/drizzle — Better Auth has a Drizzle adapter. Understand how it maps to your existing `users` table or if it needs its own tables (sessions, accounts, etc).

- [ ] **Step 3: Create Better Auth server config**

Create `src/lib/auth.ts`. Configure:
- Database: use the existing postgres connection from `src/db/index.ts`
- Drizzle adapter
- Email + password provider
- Session strategy (JWT or database sessions — check docs)

```typescript
// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
});
```

> **Note:** The exact API may differ — read the docs. Better Auth may require additional schema tables (sessions, accounts). If so, generate them: `npx @better-auth/cli generate` and merge into your Drizzle schema.

- [ ] **Step 4: Create the catch-all API route**

```typescript
// src/app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 5: Generate Better Auth schema if needed**

```bash
npx @better-auth/cli generate
```

Review generated schema. Integrate any new tables (sessions, accounts, verifications) into `src/db/schema/`. Re-export from `src/db/schema/index.ts`.

- [ ] **Step 6: Push schema changes**

```bash
npx drizzle-kit push
```

- [ ] **Step 7: Verify auth endpoints**

```bash
# Start dev server
npm run dev

# Test signup
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"testpassword123","name":"Test User"}'

# Test signin
curl -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"testpassword123"}'
```

Expected: 200 with user object and session token.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/ src/db/schema/
git commit -m "feat(auth): add Better Auth server with Drizzle adapter"
```

### Task 2: Auth Client & Middleware

**Files:**
- Create: `src/lib/auth-client.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: Create auth client for frontend**

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
```

- [ ] **Step 2: Create auth middleware**

Protect routes under `/(main)` and `/(reader)`. Redirect unauthenticated users to `/login`.

```typescript
// src/middleware.ts
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/library/:path*", "/reader/:path*", "/settings/:path*"],
};
```

> **Note:** Check Better Auth docs for the correct middleware pattern with Next.js 16. The API may use `auth.api.getSession` or a different method.

- [ ] **Step 3: Verify middleware redirects**

Start dev server, visit `http://localhost:3000/library` without being logged in.

Expected: Redirects to `/login`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth-client.ts src/middleware.ts
git commit -m "feat(auth): add auth client and route protection middleware"
```

### Task 3: Auth UI Pages

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Create: `src/components/auth/user-menu.tsx`

**Prerequisite:** Install shadcn components:

```bash
npx shadcn@latest add input label card
```

- [ ] **Step 1: Create login page**

```tsx
// src/app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? "Sign in failed");
      setLoading(false);
      return;
    }

    router.push("/library");
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in to Inhale</CardTitle>
          <CardDescription>Enter your email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              No account?{" "}
              <Link href="/signup" className="underline underline-offset-4 hover:text-primary">
                Sign up
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create signup page**

```tsx
// src/app/(auth)/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signUp.email({ email, password, name });

    if (result.error) {
      setError(result.error.message ?? "Sign up failed");
      setLoading(false);
      return;
    }

    router.push("/library");
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Start reading smarter</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creating account..." : "Sign up"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="underline underline-offset-4 hover:text-primary">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create user menu component**

```tsx
// src/components/auth/user-menu.tsx
"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function UserMenu() {
  const router = useRouter();
  const { data: session } = useSession();

  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">
        {session.user.name ?? session.user.email}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          await signOut();
          router.push("/login");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Test full auth flow in browser**

1. Go to `/signup` — create account
2. Should redirect to `/library`
3. Refresh — should stay logged in
4. Sign out — should redirect to `/login`
5. Visit `/library` while logged out — should redirect to `/login`

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/ src/components/auth/ src/components/ui/
git commit -m "feat(auth): add login, signup pages and user menu"
```

---

## Phase 0.2 — Document Upload & Library

### Task 4: Storage Abstraction & Upload API

**Files:**
- Create: `src/lib/storage.ts`
- Create: `src/app/api/documents/upload/route.ts`
- Create: `src/app/api/documents/[id]/route.ts`

- [ ] **Step 1: Create local file storage utility**

```typescript
// src/lib/storage.ts
import { mkdir, writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = join(process.cwd(), "uploads");

export async function saveFile(buffer: Buffer, originalName: string): Promise<{ path: string; size: number }> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = originalName.split(".").pop() ?? "pdf";
  const filename = `${randomUUID()}.${ext}`;
  const filepath = join(UPLOAD_DIR, filename);
  await writeFile(filepath, buffer);
  return { path: filepath, size: buffer.length };
}

export async function getFile(filepath: string): Promise<Buffer> {
  return readFile(filepath);
}

export async function deleteFile(filepath: string): Promise<void> {
  try {
    await unlink(filepath);
  } catch {
    // File already deleted — no-op
  }
}
```

- [ ] **Step 2: Create upload API route**

```typescript
// src/app/api/documents/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { saveFile } from "@/lib/storage";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file || file.type !== "application/pdf") {
    return NextResponse.json({ error: "PDF file required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { path, size } = await saveFile(buffer, file.name);

  const [doc] = await db
    .insert(documents)
    .values({
      userId: Number(session.user.id),
      title: file.name.replace(/\.pdf$/i, ""),
      filename: file.name,
      filePath: path,
      fileSizeBytes: size,
      processingStatus: "pending",
    })
    .returning();

  return NextResponse.json({ document: doc }, { status: 201 });
}
```

- [ ] **Step 3: Create document GET/DELETE route**

```typescript
// src/app/api/documents/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { deleteFile } from "@/lib/storage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, Number(id)), eq(documents.userId, Number(session.user.id))));

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ document: doc });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, Number(id)), eq(documents.userId, Number(session.user.id))));

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteFile(doc.filePath);
  await db.delete(documents).where(eq(documents.id, doc.id));

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Add `uploads/` to .gitignore**

Append `uploads/` to `.gitignore`.

- [ ] **Step 5: Verify upload via curl**

```bash
curl -X POST http://localhost:3000/api/documents/upload \
  -H "Cookie: <session-cookie-from-login>" \
  -F "file=@/path/to/sample.pdf"
```

Expected: 201 with document object.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts src/app/api/documents/ .gitignore
git commit -m "feat(documents): add upload, get, delete API routes with local storage"
```

### Task 5: Library Page UI

**Files:**
- Create: `src/app/(main)/layout.tsx`
- Create: `src/app/(main)/library/page.tsx`
- Create: `src/components/library/document-card.tsx`
- Create: `src/components/library/upload-zone.tsx`

**Prerequisite:**

```bash
npx shadcn@latest add dialog progress dropdown-menu sonner
```

- [ ] **Step 1: Create main app layout with nav**

```tsx
// src/app/(main)/layout.tsx
import Link from "next/link";
import { UserMenu } from "@/components/auth/user-menu";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/library" className="text-lg font-semibold tracking-tight">
            inhale
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground">
              Library
            </Link>
            <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
              Settings
            </Link>
            <UserMenu />
          </nav>
        </div>
      </header>
      <main className="container flex-1 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create upload zone component**

```tsx
// src/components/library/upload-zone.tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UploadZone() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/documents/upload", { method: "POST", body: formData });

    if (res.ok) {
      router.refresh();
    }

    setUploading(false);
  }, [router]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) upload(file);
      }}
      className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      }`}
    >
      <p className="mb-2 text-sm text-muted-foreground">
        {uploading ? "Uploading..." : "Drag & drop a PDF here"}
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".pdf";
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) upload(file);
          };
          input.click();
        }}
      >
        or choose file
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create document card component**

```tsx
// src/components/library/document-card.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface DocumentCardProps {
  id: number;
  title: string;
  filename: string;
  pageCount: number | null;
  createdAt: string;
}

export function DocumentCard({ id, title, pageCount, createdAt }: DocumentCardProps) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="group relative rounded-lg border p-4 transition-colors hover:bg-muted/50">
      <Link href={`/reader/${id}`} className="block">
        <h3 className="font-medium leading-tight line-clamp-2">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {pageCount ? `${pageCount} pages` : "Processing..."}
          {" · "}
          {new Date(createdAt).toLocaleDateString()}
        </p>
      </Link>
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100"
        onClick={handleDelete}
      >
        Delete
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Create library page**

```tsx
// src/app/(main)/library/page.tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { UploadZone } from "@/components/library/upload-zone";
import { DocumentCard } from "@/components/library/document-card";

export default async function LibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.userId, Number(session.user.id)))
    .orderBy(desc(documents.createdAt));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Library</h1>
      <UploadZone />
      {docs.length === 0 ? (
        <p className="mt-8 text-center text-muted-foreground">
          No documents yet. Upload your first PDF above.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              id={doc.id}
              title={doc.title}
              filename={doc.filename}
              pageCount={doc.pageCount}
              createdAt={doc.createdAt.toISOString()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Test in browser**

1. Login → navigate to `/library`
2. Upload a PDF via drag-and-drop
3. See it appear in the grid
4. Delete it
5. Upload via file picker

- [ ] **Step 6: Commit**

```bash
git add src/app/\(main\)/ src/components/library/ src/components/ui/
git commit -m "feat(library): add document library page with upload and grid"
```

---

## Phase 0.3 — PDF Reader (Core Rendering)

### Task 6: PDF.js Setup & Reader State

**Files:**
- Create: `src/hooks/use-pdf-document.ts`
- Create: `src/hooks/use-reader-state.ts`
- Modify: `next.config.ts` (webpack config for PDF.js worker)

**Prerequisite:**

```bash
npm install react-pdf zustand
```

**Docs to check:** react-pdf v9 docs — https://github.com/wojtekmaj/react-pdf — check React 19 compatibility and worker setup for Next.js.

- [ ] **Step 1: Configure Next.js for PDF.js worker**

Modify `next.config.ts` to copy the PDF.js worker file. Check react-pdf docs for exact webpack config needed.

```typescript
// next.config.ts — add webpack config for pdf.js worker
// The exact config depends on react-pdf v9 docs
```

- [ ] **Step 2: Create Zustand reader state store**

```typescript
// src/hooks/use-reader-state.ts
import { create } from "zustand";

interface ReaderState {
  currentPage: number;
  totalPages: number;
  zoom: number;
  setCurrentPage: (page: number) => void;
  setTotalPages: (total: number) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitWidth: () => void;
}

export const useReaderState = create<ReaderState>((set) => ({
  currentPage: 1,
  totalPages: 0,
  zoom: 1.0,
  setCurrentPage: (page) => set({ currentPage: page }),
  setTotalPages: (total) => set({ totalPages: total }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(3.0, zoom)) }),
  zoomIn: () => set((s) => ({ zoom: Math.min(3.0, s.zoom + 0.25) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.5, s.zoom - 0.25) })),
  fitWidth: () => set({ zoom: 1.0 }), // Will be recalculated based on container width
}));
```

- [ ] **Step 3: Create PDF document loader hook**

```typescript
// src/hooks/use-pdf-document.ts
"use client";

import { useState, useEffect } from "react";
import { pdfjs } from "react-pdf";

// Set worker — check react-pdf v9 docs for correct path
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export function usePdfDocument(documentId: number) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Serve PDF via API route to handle auth
    setUrl(`/api/documents/${documentId}/file`);
  }, [documentId]);

  return { url, error };
}
```

- [ ] **Step 4: Create PDF file serving route**

```typescript
// src/app/api/documents/[id]/file/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getFile } from "@/lib/storage";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, Number(id)), eq(documents.userId, Number(session.user.id))));

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await getFile(doc.filePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.filename}"`,
    },
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/ src/app/api/documents/\[id\]/file/ next.config.ts
git commit -m "feat(reader): add PDF.js setup, reader state store, and file serving route"
```

### Task 7: PDF Viewer Components

**Files:**
- Create: `src/components/reader/pdf-viewer.tsx`
- Create: `src/components/reader/pdf-page.tsx`
- Create: `src/components/reader/reader-toolbar.tsx`
- Create: `src/components/reader/zoom-controls.tsx`
- Create: `src/app/(reader)/reader/[documentId]/page.tsx`

- [ ] **Step 1: Create single PDF page component**

```tsx
// src/components/reader/pdf-page.tsx
"use client";

import { Page } from "react-pdf";
import { useReaderState } from "@/hooks/use-reader-state";

interface PdfPageProps {
  pageNumber: number;
  width: number;
}

export function PdfPage({ pageNumber, width }: PdfPageProps) {
  const zoom = useReaderState((s) => s.zoom);

  return (
    <div className="mb-4 shadow-md">
      <Page
        pageNumber={pageNumber}
        width={width * zoom}
        renderTextLayer={true}
        renderAnnotationLayer={true}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create PDF viewer with scroll container**

```tsx
// src/components/reader/pdf-viewer.tsx
"use client";

import { useRef, useState, useCallback } from "react";
import { Document } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { PdfPage } from "./pdf-page";
import { useReaderState } from "@/hooks/use-reader-state";

interface PdfViewerProps {
  url: string;
}

export function PdfViewer({ url }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const setTotalPages = useReaderState((s) => s.setTotalPages);
  const totalPages = useReaderState((s) => s.totalPages);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setTotalPages(numPages);
    },
    [setTotalPages]
  );

  // Measure container width on mount
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      containerRef.current = node;
      setContainerWidth(node.clientWidth - 48); // padding
    }
  }, []);

  return (
    <div ref={measureRef} className="flex-1 overflow-auto bg-muted/30 p-6">
      <div className="mx-auto flex flex-col items-center">
        <Document file={url} onLoadSuccess={onDocumentLoadSuccess}>
          {Array.from({ length: totalPages }, (_, i) => (
            <PdfPage key={i + 1} pageNumber={i + 1} width={containerWidth} />
          ))}
        </Document>
      </div>
    </div>
  );
}
```

> **Note:** This renders all pages. For large PDFs, you will want virtual rendering (only visible pages + buffer). That optimization can be added in Phase 4. For now, this works for typical paper lengths (5-40 pages).

- [ ] **Step 3: Create toolbar and zoom controls**

```tsx
// src/components/reader/zoom-controls.tsx
"use client";

import { useReaderState } from "@/hooks/use-reader-state";
import { Button } from "@/components/ui/button";

export function ZoomControls() {
  const { zoom, zoomIn, zoomOut, fitWidth } = useReaderState();

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={zoomOut}>-</Button>
      <span className="w-14 text-center text-sm">{Math.round(zoom * 100)}%</span>
      <Button variant="ghost" size="sm" onClick={zoomIn}>+</Button>
      <Button variant="ghost" size="sm" onClick={fitWidth}>Fit</Button>
    </div>
  );
}
```

```tsx
// src/components/reader/reader-toolbar.tsx
"use client";

import { useReaderState } from "@/hooks/use-reader-state";
import { ZoomControls } from "./zoom-controls";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ReaderToolbarProps {
  title: string;
}

export function ReaderToolbar({ title }: ReaderToolbarProps) {
  const { currentPage, totalPages, setCurrentPage } = useReaderState();

  return (
    <header className="flex h-12 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <Link href="/library">
          <Button variant="ghost" size="sm">Back</Button>
        </Link>
        <span className="text-sm font-medium truncate max-w-[300px]">{title}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            Prev
          </Button>
          <span>{currentPage} / {totalPages}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </div>
        <ZoomControls />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create reader page**

```tsx
// src/app/(reader)/reader/[documentId]/page.tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ReaderClient } from "./reader-client";

export default async function ReaderPage({ params }: { params: Promise<{ documentId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { documentId } = await params;
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, Number(documentId)), eq(documents.userId, Number(session.user.id))));

  if (!doc) notFound();

  return <ReaderClient documentId={doc.id} title={doc.title} />;
}
```

```tsx
// src/app/(reader)/reader/[documentId]/reader-client.tsx
"use client";

import { ReaderToolbar } from "@/components/reader/reader-toolbar";
import { PdfViewer } from "@/components/reader/pdf-viewer";

interface ReaderClientProps {
  documentId: number;
  title: string;
}

export function ReaderClient({ documentId, title }: ReaderClientProps) {
  const url = `/api/documents/${documentId}/file`;

  return (
    <div className="flex h-screen flex-col">
      <ReaderToolbar title={title} />
      <PdfViewer url={url} />
    </div>
  );
}
```

- [ ] **Step 5: Test in browser**

1. Upload a PDF in library
2. Click it → opens reader
3. PDF renders with selectable text
4. Zoom in/out works
5. Page navigation works
6. "Back" returns to library

- [ ] **Step 6: Commit**

```bash
git add src/app/\(reader\)/ src/components/reader/
git commit -m "feat(reader): add PDF viewer with zoom, page navigation, and text layer"
```

---

## Phase 0.4 — Highlighting

### Task 8: Highlights Schema & API

**Files:**
- Create: `src/db/schema/user-highlights.ts`
- Modify: `src/db/schema/index.ts` (add export)
- Create: `src/app/api/documents/[id]/highlights/route.ts`

- [ ] **Step 1: Create highlights table schema**

```typescript
// src/db/schema/user-highlights.ts
import { pgTable, text, timestamp, serial, integer, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";
import { documents } from "./documents";

export const highlightColorEnum = pgEnum("highlight_color", [
  "yellow",
  "green",
  "blue",
  "pink",
  "orange",
]);

export const userHighlights = pgTable("user_highlights", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  textContent: text("text_content").notNull(),
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  color: highlightColorEnum("color").notNull().default("yellow"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Export from barrel and push schema**

Add `export * from "./user-highlights";` to `src/db/schema/index.ts`.

```bash
npx drizzle-kit push
```

- [ ] **Step 3: Create highlights CRUD API**

```typescript
// src/app/api/documents/[id]/highlights/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userHighlights } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const highlights = await db
    .select()
    .from(userHighlights)
    .where(
      and(
        eq(userHighlights.documentId, Number(id)),
        eq(userHighlights.userId, Number(session.user.id))
      )
    );

  return NextResponse.json({ highlights });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const [highlight] = await db
    .insert(userHighlights)
    .values({
      userId: Number(session.user.id),
      documentId: Number(id),
      pageNumber: body.pageNumber,
      textContent: body.textContent,
      startOffset: body.startOffset,
      endOffset: body.endOffset,
      color: body.color ?? "yellow",
      note: body.note,
    })
    .returning();

  return NextResponse.json({ highlight }, { status: 201 });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/user-highlights.ts src/db/schema/index.ts src/app/api/documents/\[id\]/highlights/
git commit -m "feat(highlights): add user_highlights schema and CRUD API"
```

### Task 9: Highlight UI Components

**Files:**
- Create: `src/hooks/use-text-selection.ts`
- Create: `src/components/reader/selection-toolbar.tsx`
- Create: `src/components/reader/highlight-layer.tsx`
- Create: `src/components/reader/highlights-sidebar.tsx`

**Prerequisite:**

```bash
npx shadcn@latest add popover tooltip sheet scroll-area
```

- [ ] **Step 1: Create text selection hook**

```typescript
// src/hooks/use-text-selection.ts
"use client";

import { useState, useEffect, useCallback } from "react";

interface TextSelection {
  text: string;
  pageNumber: number;
  startOffset: number;
  endOffset: number;
  rect: DOMRect;
}

export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>) {
  const [selection, setSelection] = useState<TextSelection | null>(null);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelection(null);
      return;
    }

    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Find which page this selection is on by looking for the closest [data-page-number] ancestor
    const pageEl = range.startContainer.parentElement?.closest("[data-page-number]");
    const pageNumber = pageEl ? Number(pageEl.getAttribute("data-page-number")) : 1;

    setSelection({
      text,
      pageNumber,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      rect,
    });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  return { selection, clearSelection };
}
```

- [ ] **Step 2: Create selection toolbar (floating bar on text select)**

```tsx
// src/components/reader/selection-toolbar.tsx
"use client";

import { Button } from "@/components/ui/button";

const COLORS = [
  { name: "yellow", class: "bg-yellow-300" },
  { name: "green", class: "bg-green-300" },
  { name: "blue", class: "bg-blue-300" },
  { name: "pink", class: "bg-pink-300" },
  { name: "orange", class: "bg-orange-300" },
] as const;

interface SelectionToolbarProps {
  rect: DOMRect;
  onHighlight: (color: string) => void;
  onDismiss: () => void;
}

export function SelectionToolbar({ rect, onHighlight, onDismiss }: SelectionToolbarProps) {
  return (
    <div
      className="fixed z-50 flex items-center gap-1 rounded-lg border bg-background p-1 shadow-lg"
      style={{
        top: rect.top - 44,
        left: rect.left + rect.width / 2 - 80,
      }}
    >
      {COLORS.map((c) => (
        <button
          key={c.name}
          className={`h-6 w-6 rounded-full ${c.class} border border-black/10 hover:ring-2 ring-offset-1`}
          onClick={() => onHighlight(c.name)}
          title={c.name}
        />
      ))}
      <Button variant="ghost" size="sm" onClick={onDismiss} className="ml-1 text-xs">
        Cancel
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create highlight layer overlay**

```tsx
// src/components/reader/highlight-layer.tsx
"use client";

// This component renders colored overlays on top of PDF text.
// The exact implementation depends on how react-pdf exposes text positions.
// A common approach: store the serialized Range data and re-create highlights
// using CSS highlights or absolutely positioned divs.
//
// For now, highlights are stored and shown in the sidebar.
// Visual overlays on the PDF canvas require custom text-layer integration
// which should be refined once the basic flow works.

interface Highlight {
  id: number;
  pageNumber: number;
  textContent: string;
  color: string;
}

interface HighlightLayerProps {
  highlights: Highlight[];
}

export function HighlightLayer({ highlights }: HighlightLayerProps) {
  // Phase 1 implementation: highlights are tracked by offset.
  // Visual overlay rendering will use CSS Custom Highlight API or
  // mark elements in the text layer.
  // For now, this is a placeholder that will be wired up once
  // the text layer DOM structure from react-pdf is understood.
  return null;
}
```

> **Note:** Visual PDF highlights are complex — they require mapping stored offsets to the actual text layer DOM rendered by PDF.js. The data model is ready; visual rendering can be iterated on. The sidebar (next step) provides immediate value.

- [ ] **Step 4: Create highlights sidebar**

```tsx
// src/components/reader/highlights-sidebar.tsx
"use client";

import { useEffect, useState } from "react";

interface Highlight {
  id: number;
  pageNumber: number;
  textContent: string;
  color: string;
  note: string | null;
  createdAt: string;
}

const COLOR_MAP: Record<string, string> = {
  yellow: "border-l-yellow-400",
  green: "border-l-green-400",
  blue: "border-l-blue-400",
  pink: "border-l-pink-400",
  orange: "border-l-orange-400",
};

interface HighlightsSidebarProps {
  documentId: number;
  open: boolean;
}

export function HighlightsSidebar({ documentId, open }: HighlightsSidebarProps) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/documents/${documentId}/highlights`)
      .then((r) => r.json())
      .then((data) => setHighlights(data.highlights ?? []));
  }, [documentId, open]);

  if (!open) return null;

  return (
    <div className="w-72 border-l bg-background overflow-auto p-4">
      <h2 className="mb-4 text-sm font-semibold">Highlights</h2>
      {highlights.length === 0 ? (
        <p className="text-xs text-muted-foreground">No highlights yet. Select text to create one.</p>
      ) : (
        <div className="space-y-3">
          {highlights.map((h) => (
            <div key={h.id} className={`border-l-4 ${COLOR_MAP[h.color] ?? ""} pl-3 py-1`}>
              <p className="text-xs leading-relaxed line-clamp-3">{h.textContent}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Page {h.pageNumber}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire selection + highlights into the reader**

Update `reader-client.tsx` to include `useTextSelection`, `SelectionToolbar`, and `HighlightsSidebar`. When user selects text and picks a color, POST to the highlights API and refresh the sidebar.

- [ ] **Step 6: Test in browser**

1. Open a PDF in the reader
2. Select text → floating toolbar appears with color buttons
3. Click a color → highlight is saved
4. Open sidebar → highlight appears
5. Refresh page → highlights persist

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-text-selection.ts src/components/reader/ src/components/ui/
git commit -m "feat(highlights): add text selection, color picker toolbar, and highlights sidebar"
```

---

## Phase 0.5 — Comments & BYOK Settings

### Task 10: Comments Schema & API

**Files:**
- Create: `src/db/schema/user-comments.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/app/api/documents/[id]/comments/route.ts`

- [ ] **Step 1: Create comments table schema**

```typescript
// src/db/schema/user-comments.ts
import { pgTable, text, timestamp, serial, integer } from "drizzle-orm/pg-core";
import { users } from "./users";
import { documents } from "./documents";

export const userComments = pgTable("user_comments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  textAnchor: text("text_anchor"),
  anchorOffsetStart: integer("anchor_offset_start"),
  anchorOffsetEnd: integer("anchor_offset_end"),
  body: text("body").notNull(),
  parentCommentId: integer("parent_comment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Export and push schema**

Add export to `src/db/schema/index.ts`. Run `npx drizzle-kit push`.

- [ ] **Step 3: Create comments CRUD API**

```typescript
// src/app/api/documents/[id]/comments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userComments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const comments = await db
    .select()
    .from(userComments)
    .where(
      and(
        eq(userComments.documentId, Number(id)),
        eq(userComments.userId, Number(session.user.id))
      )
    );

  return NextResponse.json({ comments });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const [comment] = await db
    .insert(userComments)
    .values({
      userId: Number(session.user.id),
      documentId: Number(id),
      pageNumber: body.pageNumber,
      textAnchor: body.textAnchor,
      anchorOffsetStart: body.anchorOffsetStart,
      anchorOffsetEnd: body.anchorOffsetEnd,
      body: body.body,
      parentCommentId: body.parentCommentId,
    })
    .returning();

  return NextResponse.json({ comment }, { status: 201 });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/user-comments.ts src/db/schema/index.ts src/app/api/documents/\[id\]/comments/
git commit -m "feat(comments): add user_comments schema and CRUD API"
```

### Task 11: Comment UI Components

**Files:**
- Create: `src/components/reader/comment-thread.tsx`
- Create: `src/components/reader/comment-input.tsx`

**Prerequisite:**

```bash
npx shadcn@latest add textarea tabs separator
```

- [ ] **Step 1: Create comment input**

```tsx
// src/components/reader/comment-input.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CommentInputProps {
  documentId: number;
  pageNumber: number;
  textAnchor?: string;
  parentCommentId?: number;
  onSaved: () => void;
  onCancel?: () => void;
}

export function CommentInput({
  documentId,
  pageNumber,
  textAnchor,
  parentCommentId,
  onSaved,
  onCancel,
}: CommentInputProps) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!body.trim()) return;
    setSaving(true);

    await fetch(`/api/documents/${documentId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageNumber, textAnchor, body: body.trim(), parentCommentId }),
    });

    setBody("");
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Add a comment..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="text-sm"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        )}
        <Button size="sm" onClick={handleSubmit} disabled={saving || !body.trim()}>
          {saving ? "Saving..." : "Comment"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create comment thread display**

```tsx
// src/components/reader/comment-thread.tsx
"use client";

import { useEffect, useState } from "react";
import { CommentInput } from "./comment-input";

interface Comment {
  id: number;
  pageNumber: number;
  textAnchor: string | null;
  body: string;
  parentCommentId: number | null;
  createdAt: string;
}

interface CommentThreadProps {
  documentId: number;
  open: boolean;
}

export function CommentThread({ documentId, open }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);

  function loadComments() {
    fetch(`/api/documents/${documentId}/comments`)
      .then((r) => r.json())
      .then((data) => setComments(data.comments ?? []));
  }

  useEffect(() => {
    if (open) loadComments();
  }, [documentId, open]);

  if (!open) return null;

  const topLevel = comments.filter((c) => !c.parentCommentId);

  return (
    <div className="w-72 border-l bg-background overflow-auto p-4">
      <h2 className="mb-4 text-sm font-semibold">Comments</h2>
      <CommentInput documentId={documentId} pageNumber={1} onSaved={loadComments} />
      <div className="mt-4 space-y-4">
        {topLevel.map((c) => (
          <div key={c.id} className="rounded border p-3">
            {c.textAnchor && (
              <p className="mb-1 text-[10px] italic text-muted-foreground line-clamp-1">
                "{c.textAnchor}"
              </p>
            )}
            <p className="text-sm">{c.body}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Page {c.pageNumber} · {new Date(c.createdAt).toLocaleDateString()}
            </p>
            {/* Replies */}
            {comments
              .filter((r) => r.parentCommentId === c.id)
              .map((reply) => (
                <div key={reply.id} className="mt-2 ml-3 border-l pl-3">
                  <p className="text-sm">{reply.body}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(reply.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire comments into reader layout**

Add a tab or toggle in the reader toolbar/sidebar to switch between Highlights and Comments panels.

- [ ] **Step 4: Test in browser**

1. Open reader → open comments panel
2. Type and save a comment
3. It appears in the thread
4. Refresh → comment persists

- [ ] **Step 5: Commit**

```bash
git add src/components/reader/comment-thread.tsx src/components/reader/comment-input.tsx src/components/ui/
git commit -m "feat(comments): add comment input, thread display, and reader integration"
```

### Task 12: Encryption Utility

**Files:**
- Create: `src/lib/encryption.ts`

- [ ] **Step 1: Create AES-256-GCM encryption module**

```typescript
// src/lib/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = ciphertext.split(":");

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
```

- [ ] **Step 2: Add ENCRYPTION_KEY to .env.local.example**

```
ENCRYPTION_KEY=<64-hex-chars>  # Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/encryption.ts
git commit -m "feat(encryption): add AES-256-GCM encrypt/decrypt for API key storage"
```

### Task 13: BYOK Settings Page & API

**Files:**
- Create: `src/app/api/settings/api-keys/route.ts`
- Create: `src/app/(main)/settings/page.tsx`
- Create: `src/app/(main)/settings/api-keys/page.tsx`

- [ ] **Step 1: Create API keys CRUD route**

```typescript
// src/app/api/settings/api-keys/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userApiKeys } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "@/lib/encryption";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await db
    .select({
      id: userApiKeys.id,
      providerType: userApiKeys.providerType,
      providerName: userApiKeys.providerName,
      keyPreview: userApiKeys.keyPreview,
      isValid: userApiKeys.isValid,
      lastValidatedAt: userApiKeys.lastValidatedAt,
      storageMode: userApiKeys.storageMode,
      preferences: userApiKeys.preferences,
    })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, Number(session.user.id)));

  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { providerType, providerName, apiKey, storageMode } = body;

  if (!providerType || !providerName || !apiKey) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const encrypted = encrypt(apiKey);
  const preview = apiKey.slice(-4);

  // Upsert: delete existing key for same provider type, then insert
  await db
    .delete(userApiKeys)
    .where(
      and(
        eq(userApiKeys.userId, Number(session.user.id)),
        eq(userApiKeys.providerType, providerType)
      )
    );

  const [key] = await db
    .insert(userApiKeys)
    .values({
      userId: Number(session.user.id),
      providerType,
      providerName,
      encryptedKey: encrypted,
      keyPreview: preview,
      storageMode: storageMode ?? "cloud",
    })
    .returning({
      id: userApiKeys.id,
      providerType: userApiKeys.providerType,
      providerName: userApiKeys.providerName,
      keyPreview: userApiKeys.keyPreview,
    });

  return NextResponse.json({ key }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const providerType = searchParams.get("providerType");

  if (!providerType) {
    return NextResponse.json({ error: "providerType required" }, { status: 400 });
  }

  await db
    .delete(userApiKeys)
    .where(
      and(
        eq(userApiKeys.userId, Number(session.user.id)),
        eq(userApiKeys.providerType, providerType as "llm" | "voice" | "ocr")
      )
    );

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Create settings landing page**

```tsx
// src/app/(main)/settings/page.tsx
import Link from "next/link";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <div className="space-y-2">
        <Link
          href="/settings/api-keys"
          className="block rounded-lg border p-4 hover:bg-muted/50"
        >
          <h3 className="font-medium">API Keys</h3>
          <p className="text-sm text-muted-foreground">
            Manage your LLM, voice, and OCR provider keys
          </p>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create API keys management page**

```tsx
// src/app/(main)/settings/api-keys/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StoredKey {
  id: number;
  providerType: string;
  providerName: string;
  keyPreview: string;
  isValid: boolean | null;
}

const PROVIDERS = [
  { type: "llm", name: "openrouter", label: "LLM (OpenRouter)", placeholder: "sk-or-..." },
  { type: "voice", name: "elevenlabs", label: "Voice (ElevenLabs)", placeholder: "sk_..." },
  { type: "ocr", name: "mistral", label: "OCR (Mistral)", placeholder: "..." },
] as const;

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  function loadKeys() {
    fetch("/api/settings/api-keys")
      .then((r) => r.json())
      .then((data) => setKeys(data.keys ?? []));
  }

  useEffect(() => { loadKeys(); }, []);

  async function saveKey(providerType: string, providerName: string) {
    const apiKey = inputs[providerType];
    if (!apiKey?.trim()) return;

    setSaving(providerType);
    await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerType, providerName, apiKey }),
    });

    setInputs((prev) => ({ ...prev, [providerType]: "" }));
    setSaving(null);
    loadKeys();
  }

  async function deleteKey(providerType: string) {
    await fetch(`/api/settings/api-keys?providerType=${providerType}`, { method: "DELETE" });
    loadKeys();
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">API Keys</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Add your own API keys to unlock AI features. Keys are encrypted at rest.
      </p>
      <div className="space-y-6">
        {PROVIDERS.map((p) => {
          const existing = keys.find((k) => k.providerType === p.type);
          return (
            <div key={p.type} className="rounded-lg border p-4">
              <Label className="text-sm font-medium">{p.label}</Label>
              {existing ? (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    ••••••••{existing.keyPreview}
                  </span>
                  <Button variant="destructive" size="sm" onClick={() => deleteKey(p.type)}>
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder={p.placeholder}
                    type="password"
                    value={inputs[p.type] ?? ""}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [p.type]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    disabled={saving === p.type}
                    onClick={() => saveKey(p.type, p.name)}
                  >
                    {saving === p.type ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Test in browser**

1. Go to Settings → API Keys
2. Add an OpenRouter key → shows masked preview
3. Remove the key → input reappears
4. Refresh → key persists

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/ src/app/\(main\)/settings/
git commit -m "feat(byok): add API key management with encrypted storage"
```

---

# Phase 1: First AI Features

## Phase 1.0 — FastAPI Service Bootstrap

### Task 14: FastAPI Project Structure

**Files:**
- Create: `services/processing/app/main.py`
- Create: `services/processing/app/config.py`
- Create: `services/processing/app/models/__init__.py`
- Create: `services/processing/app/models/base.py`
- Create: `services/processing/app/routers/__init__.py`
- Create: `services/processing/app/routers/health.py`
- Create: `services/processing/requirements.txt`
- Create: `services/processing/Dockerfile`
- Modify: `docker-compose.yml` (add processing service)

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
httpx==0.28.0
celery[redis]==5.4.0
redis==5.2.0
pydantic-settings==2.6.0
```

- [ ] **Step 2: Create config**

```python
# services/processing/app/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://inhale:inhale_dev@localhost:5432/inhale"
    redis_url: str = "redis://localhost:6379"
    cors_origins: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env.local"

settings = Settings()
```

- [ ] **Step 3: Create SQLAlchemy async engine (read-only reflection)**

```python
# services/processing/app/models/__init__.py
# Empty — models are imported individually

# services/processing/app/models/base.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
```

> **Convention:** SQLAlchemy models in this service are read-only reflections of Drizzle schema. They never create or alter tables. All migrations go through `drizzle-kit`.

- [ ] **Step 4: Create FastAPI app with health check**

```python
# services/processing/app/routers/health.py
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health():
    return {"status": "ok", "service": "inhale-processing"}
```

```python
# services/processing/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import health

app = FastAPI(title="Inhale Processing Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
```

- [ ] **Step 5: Create Dockerfile**

```dockerfile
# services/processing/Dockerfile
FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 6: Add processing service to docker-compose.yml**

Add to `docker-compose.yml`:

```yaml
  processing:
    build: ./services/processing
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://inhale:inhale_dev@postgres:5432/inhale
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./services/processing:/app
      - ./uploads:/uploads
```

- [ ] **Step 7: Test**

```bash
docker compose up -d
curl http://localhost:8000/health
```

Expected: `{"status":"ok","service":"inhale-processing"}`

- [ ] **Step 8: Commit**

```bash
git add services/processing/ docker-compose.yml
git commit -m "feat(processing): bootstrap FastAPI service with health check and Docker"
```

---

## Phase 1.1 — Celery Pipeline & Processing

### Task 15: Processing Schema & Celery Setup

**Files:**
- Create: `src/db/schema/document-sections.ts`
- Create: `src/db/schema/document-chunks.ts`
- Create: `src/db/schema/processing-jobs.ts`
- Modify: `src/db/schema/index.ts`
- Create: `services/processing/app/celery_app.py`
- Create: `services/processing/app/tasks/process_document.py`
- Create: `services/processing/app/services/chunking.py`
- Create: `services/processing/app/services/embeddings.py`
- Create: `services/processing/app/routers/processing.py`
- Create: `src/components/library/processing-badge.tsx`

- [ ] **Step 1: Create Drizzle schemas for sections, chunks, processing jobs**

```typescript
// src/db/schema/document-sections.ts
import { pgTable, text, timestamp, serial, integer } from "drizzle-orm/pg-core";
import { documents } from "./documents";

export const documentSections = pgTable("document_sections", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  level: integer("level").notNull().default(1),
  pageStart: integer("page_start").notNull(),
  pageEnd: integer("page_end"),
  yPosition: integer("y_position"),
  contentPreview: text("content_preview"),
  orderIndex: integer("order_index").notNull(),
  parentSectionId: integer("parent_section_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

```typescript
// src/db/schema/document-chunks.ts
import { pgTable, text, timestamp, serial, integer, vector } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { documentSections } from "./document-sections";

export const documentChunks = pgTable("document_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  sectionId: integer("section_id")
    .references(() => documentSections.id, { onDelete: "set null" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  pageStart: integer("page_start").notNull(),
  pageEnd: integer("page_end"),
  tokenCount: integer("token_count"),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

> **Note:** The `vector` column type requires `drizzle-orm/pg-core` pgvector support. Check Drizzle docs — you may need `import { vector } from "drizzle-orm/pg-core"` or a custom column type. If not natively supported, use `text` and cast in queries.

```typescript
// src/db/schema/processing-jobs.ts
import { pgTable, text, timestamp, serial, integer, pgEnum } from "drizzle-orm/pg-core";
import { documents } from "./documents";

export const jobTypeEnum = pgEnum("job_type", [
  "extract_text",
  "extract_refs",
  "fetch_metadata",
  "detect_figures",
  "extract_formulas",
  "generate_outline",
  "auto_highlight",
  "build_rag_index",
  "extract_links",
]);

export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "done", "failed"]);

export const processingJobs = pgTable("processing_jobs", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  jobType: jobTypeEnum("job_type").notNull(),
  status: jobStatusEnum("status").notNull().default("queued"),
  progressPct: integer("progress_pct").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Export all new schemas, push**

Update `src/db/schema/index.ts` with new exports. Run `npx drizzle-kit push`.

- [ ] **Step 3: Create Celery app config**

```python
# services/processing/app/celery_app.py
from celery import Celery
from app.config import settings

celery_app = Celery(
    "inhale",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    task_track_started=True,
)

# Auto-discover tasks
celery_app.autodiscover_tasks(["app.tasks"])
```

- [ ] **Step 4: Create text chunking service**

```python
# services/processing/app/services/chunking.py
from typing import List

def chunk_text(text: str, chunk_size: int = 512, overlap: int = 64) -> List[dict]:
    """Split text into overlapping chunks for RAG indexing."""
    words = text.split()
    chunks = []
    start = 0
    idx = 0

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk_text = " ".join(words[start:end])
        chunks.append({
            "index": idx,
            "content": chunk_text,
            "token_count": end - start,
        })
        start += chunk_size - overlap
        idx += 1

    return chunks
```

- [ ] **Step 5: Create document processing task**

```python
# services/processing/app/tasks/process_document.py
from app.celery_app import celery_app
from app.models.base import async_session
from sqlalchemy import text
import asyncio

def run_async(coro):
    """Run async function from sync Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

@celery_app.task(bind=True)
def process_document(self, document_id: int):
    """Main processing pipeline: extract text → chunk → embed."""
    run_async(_process_document(document_id))

async def _process_document(document_id: int):
    async with async_session() as session:
        # Update status to processing
        await session.execute(
            text("UPDATE documents SET processing_status = 'processing' WHERE id = :id"),
            {"id": document_id},
        )
        await session.commit()

        # Get document file path
        result = await session.execute(
            text("SELECT file_path FROM documents WHERE id = :id"),
            {"id": document_id},
        )
        row = result.fetchone()
        if not row:
            return

        # TODO: Extract text from PDF using pdfplumber or pymupdf
        # TODO: Split into sections
        # TODO: Chunk text
        # TODO: Generate embeddings via OpenRouter
        # For now, mark as ready
        await session.execute(
            text("UPDATE documents SET processing_status = 'ready' WHERE id = :id"),
            {"id": document_id},
        )
        await session.commit()
```

- [ ] **Step 6: Create processing router**

```python
# services/processing/app/routers/processing.py
from fastapi import APIRouter, BackgroundTasks
from app.tasks.process_document import process_document

router = APIRouter(prefix="/processing")

@router.post("/{document_id}")
async def trigger_processing(document_id: int):
    task = process_document.delay(document_id)
    return {"task_id": task.id, "status": "queued"}
```

- [ ] **Step 7: Register router in main.py**

Add `from app.routers import processing` and `app.include_router(processing.router)` to `main.py`.

- [ ] **Step 8: Create processing badge component**

```tsx
// src/components/library/processing-badge.tsx
const STATUS_MAP: Record<string, { label: string; class: string }> = {
  pending: { label: "Pending", class: "bg-muted text-muted-foreground" },
  processing: { label: "Processing...", class: "bg-yellow-100 text-yellow-800" },
  ready: { label: "Ready", class: "bg-green-100 text-green-800" },
  failed: { label: "Failed", class: "bg-red-100 text-red-800" },
};

export function ProcessingBadge({ status }: { status: string }) {
  const config = STATUS_MAP[status] ?? STATUS_MAP.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${config.class}`}>
      {config.label}
    </span>
  );
}
```

- [ ] **Step 9: Add Celery worker to docker-compose.yml**

```yaml
  celery-worker:
    build: ./services/processing
    command: celery -A app.celery_app worker --loglevel=info
    environment:
      DATABASE_URL: postgresql+asyncpg://inhale:inhale_dev@postgres:5432/inhale
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./services/processing:/app
      - ./uploads:/uploads
```

- [ ] **Step 10: Test**

```bash
docker compose up -d
# Trigger processing for a document
curl -X POST http://localhost:8000/processing/1
```

Expected: `{"task_id":"...","status":"queued"}`

- [ ] **Step 11: Commit**

```bash
git add src/db/schema/ services/processing/ src/components/library/processing-badge.tsx docker-compose.yml
git commit -m "feat(pipeline): add Celery processing pipeline with chunking and processing jobs schema"
```

---

## Phase 1.2 — AI Outline & Section Preview

### Task 16: LLM Service & Outline Generation

**Files:**
- Create: `services/processing/app/services/llm.py`
- Create: `services/processing/app/tasks/generate_outline.py`
- Create: `src/components/reader/outline-sidebar.tsx`
- Create: `src/components/reader/section-preview.tsx`
- Create: `src/components/reader/concepts-panel.tsx`

- [ ] **Step 1: Create OpenRouter LLM client**

```python
# services/processing/app/services/llm.py
import httpx
from typing import AsyncGenerator

OPENROUTER_BASE = "https://openrouter.ai/api/v1"

async def chat_completion(
    api_key: str,
    messages: list[dict],
    model: str = "anthropic/claude-sonnet-4-20250514",
    stream: bool = False,
) -> str | AsyncGenerator[str, None]:
    """Call OpenRouter chat completion. Returns full text or async generator of tokens."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
    }

    if not stream:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{OPENROUTER_BASE}/chat/completions",
                json=payload,
                headers=headers,
                timeout=60,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    async def token_stream():
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{OPENROUTER_BASE}/chat/completions",
                json=payload,
                headers=headers,
                timeout=120,
            ) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        import json
                        chunk = json.loads(line[6:])
                        delta = chunk["choices"][0].get("delta", {})
                        if "content" in delta:
                            yield delta["content"]

    return token_stream()
```

- [ ] **Step 2: Create outline generation task**

```python
# services/processing/app/tasks/generate_outline.py
from app.celery_app import celery_app
from app.models.base import async_session
from app.services.llm import chat_completion
from sqlalchemy import text
import asyncio
import json

def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

@celery_app.task(bind=True)
def generate_outline(self, document_id: int, api_key: str):
    run_async(_generate_outline(document_id, api_key))

async def _generate_outline(document_id: int, api_key: str):
    async with async_session() as session:
        # Get document chunks for context
        result = await session.execute(
            text("SELECT content FROM document_chunks WHERE document_id = :id ORDER BY chunk_index LIMIT 20"),
            {"id": document_id},
        )
        chunks = [row[0] for row in result.fetchall()]

        if not chunks:
            return

        doc_text = "\n\n".join(chunks[:10])  # Use first ~10 chunks for outline

        messages = [
            {
                "role": "system",
                "content": "You are a research paper analyzer. Generate a structured outline of this paper as JSON. Format: [{\"title\": \"Section Title\", \"level\": 1, \"page\": 1, \"children\": [...]}]. Use levels 1-3.",
            },
            {
                "role": "user",
                "content": f"Generate an outline for this paper:\n\n{doc_text}",
            },
        ]

        response = await chat_completion(api_key, messages)

        # Store outline
        await session.execute(
            text("""
                INSERT INTO document_outlines (document_id, outline_json, generated_by, created_at)
                VALUES (:doc_id, :outline, :model, NOW())
                ON CONFLICT (document_id) DO UPDATE SET outline_json = :outline
            """),
            {"doc_id": document_id, "outline": response, "model": "anthropic/claude-sonnet-4-20250514"},
        )
        await session.commit()
```

> **Note:** This task needs a `document_outlines` table. Add it to Drizzle schema:

```typescript
// src/db/schema/document-outlines.ts
import { pgTable, text, timestamp, serial, integer, jsonb } from "drizzle-orm/pg-core";
import { documents } from "./documents";

export const documentOutlines = pgTable("document_outlines", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" })
    .unique(),
  outlineJson: jsonb("outline_json").notNull(),
  generatedBy: text("generated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Create outline sidebar component**

```tsx
// src/components/reader/outline-sidebar.tsx
"use client";

import { useEffect, useState } from "react";

interface OutlineItem {
  title: string;
  level: number;
  page: number;
  children?: OutlineItem[];
}

interface OutlineSidebarProps {
  documentId: number;
  open: boolean;
  onNavigate: (page: number) => void;
}

export function OutlineSidebar({ documentId, open, onNavigate }: OutlineSidebarProps) {
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/documents/${documentId}/outline`)
      .then((r) => r.json())
      .then((data) => {
        setOutline(data.outline ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [documentId, open]);

  if (!open) return null;

  function renderItems(items: OutlineItem[], depth = 0) {
    return items.map((item, i) => (
      <div key={i}>
        <button
          onClick={() => onNavigate(item.page)}
          className="w-full text-left text-sm py-1 hover:text-primary transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {item.title}
          <span className="ml-2 text-xs text-muted-foreground">p.{item.page}</span>
        </button>
        {item.children && renderItems(item.children, depth + 1)}
      </div>
    ));
  }

  return (
    <div className="w-64 border-r bg-background overflow-auto p-4">
      <h2 className="mb-4 text-sm font-semibold">Outline</h2>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading outline...</p>
      ) : outline.length === 0 ? (
        <p className="text-xs text-muted-foreground">No outline available. Process document with an LLM key to generate one.</p>
      ) : (
        renderItems(outline)
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create section preview popover**

```tsx
// src/components/reader/section-preview.tsx
"use client";

import { useState } from "react";

interface SectionPreviewProps {
  sectionTitle: string;
  contentPreview: string;
  page: number;
  children: React.ReactNode;
}

export function SectionPreview({ sectionTitle, contentPreview, page, children }: SectionPreviewProps) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-lg border bg-background p-3 shadow-lg">
          <p className="text-xs font-medium">{sectionTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-4">{contentPreview}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Page {page}</p>
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 5: Create concepts panel (explain selected text)**

```tsx
// src/components/reader/concepts-panel.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ConceptsPanelProps {
  selectedText: string;
  documentId: number;
  onClose: () => void;
}

export function ConceptsPanel({ selectedText, documentId, onClose }: ConceptsPanelProps) {
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState(false);

  async function explain() {
    setLoading(true);
    setExplanation("");

    const res = await fetch("/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: selectedText, documentId }),
    });

    if (!res.ok || !res.body) {
      setExplanation("Failed to get explanation. Check your LLM API key in Settings.");
      setLoading(false);
      return;
    }

    // Read SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          setExplanation((prev) => prev + line.slice(6));
        }
      }
    }

    setLoading(false);
  }

  return (
    <div className="w-80 rounded-lg border bg-background p-4 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Explain</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      <p className="text-xs italic text-muted-foreground mb-3 line-clamp-2">"{selectedText}"</p>
      {!explanation && !loading && (
        <Button size="sm" onClick={explain}>Explain this</Button>
      )}
      {loading && !explanation && (
        <p className="text-xs text-muted-foreground">Thinking...</p>
      )}
      {explanation && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{explanation}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add API route for outline retrieval and explain SSE**

Create `src/app/api/documents/[id]/outline/route.ts` to GET the outline from DB.
Create `src/app/api/ai/explain/route.ts` to proxy explain requests to FastAPI (or call OpenRouter directly with user's BYOK key).

- [ ] **Step 7: Test**

1. Process a document (trigger via API)
2. Open reader → outline sidebar shows
3. Click outline items → navigates to page
4. Select text → click Explain → streams explanation

- [ ] **Step 8: Commit**

```bash
git add services/processing/app/services/llm.py services/processing/app/tasks/generate_outline.py \
  src/db/schema/document-outlines.ts src/db/schema/index.ts \
  src/components/reader/outline-sidebar.tsx src/components/reader/section-preview.tsx \
  src/components/reader/concepts-panel.tsx src/app/api/
git commit -m "feat(ai): add AI outline generation, section preview, and concepts explanation"
```

---

## Phase 1.3 — Basic RAG Q&A + Viewport Awareness

### Task 17: RAG Service & Chat

**Files:**
- Create: `services/processing/app/services/rag.py`
- Create: `services/processing/app/routers/rag.py`
- Create: `services/processing/app/tasks/generate_embeddings.py`
- Create: `src/hooks/use-chat.ts`
- Create: `src/hooks/use-viewport-tracking.ts`
- Create: `src/components/reader/chat-panel.tsx`
- Create: `src/components/reader/chat-message.tsx`
- Add Drizzle schema: `src/db/schema/agent-conversations.ts`, `src/db/schema/agent-messages.ts`

- [ ] **Step 1: Create conversation/message schemas**

```typescript
// src/db/schema/agent-conversations.ts
import { pgTable, text, timestamp, serial, integer } from "drizzle-orm/pg-core";
import { users } from "./users";
import { documents } from "./documents";

export const agentConversations = pgTable("agent_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  documentId: integer("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  title: text("title"),
  messageCount: integer("message_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

```typescript
// src/db/schema/agent-messages.ts
import { pgTable, text, timestamp, serial, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { agentConversations } from "./agent-conversations";

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
export const inputModeEnum = pgEnum("input_mode", ["text", "voice"]);

export const agentMessages = pgTable("agent_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => agentConversations.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  inputMode: inputModeEnum("input_mode").notNull().default("text"),
  viewportContext: jsonb("viewport_context"),
  ragSources: jsonb("rag_sources"),
  modelUsed: text("model_used"),
  tokenCountIn: integer("token_count_in"),
  tokenCountOut: integer("token_count_out"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Export from index, push schema.

- [ ] **Step 2: Create embeddings generation task**

```python
# services/processing/app/tasks/generate_embeddings.py
from app.celery_app import celery_app
from app.models.base import async_session
from app.services.embeddings import generate_embedding
from sqlalchemy import text
import asyncio

def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

@celery_app.task(bind=True)
def generate_embeddings(self, document_id: int, api_key: str):
    run_async(_generate_embeddings(document_id, api_key))

async def _generate_embeddings(document_id: int, api_key: str):
    async with async_session() as session:
        result = await session.execute(
            text("SELECT id, content FROM document_chunks WHERE document_id = :id AND embedding IS NULL"),
            {"id": document_id},
        )
        chunks = result.fetchall()

        for chunk_id, content in chunks:
            embedding = await generate_embedding(api_key, content)
            await session.execute(
                text("UPDATE document_chunks SET embedding = :emb WHERE id = :id"),
                {"emb": str(embedding), "id": chunk_id},
            )

        await session.commit()
```

```python
# services/processing/app/services/embeddings.py
import httpx

OPENROUTER_BASE = "https://openrouter.ai/api/v1"

async def generate_embedding(api_key: str, text: str, model: str = "openai/text-embedding-3-small") -> list[float]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{OPENROUTER_BASE}/embeddings",
            json={"model": model, "input": text},
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]
```

- [ ] **Step 3: Create RAG service**

```python
# services/processing/app/services/rag.py
from app.models.base import async_session
from app.services.embeddings import generate_embedding
from app.services.llm import chat_completion
from sqlalchemy import text

async def query_rag(
    document_id: int,
    question: str,
    api_key: str,
    viewport_context: dict | None = None,
    history: list[dict] | None = None,
    top_k: int = 5,
):
    """Retrieve relevant chunks and generate answer."""
    # 1. Embed the question
    q_embedding = await generate_embedding(api_key, question)

    # 2. Vector similarity search
    async with async_session() as session:
        result = await session.execute(
            text("""
                SELECT content, page_start,
                       1 - (embedding <=> :embedding::vector) as similarity
                FROM document_chunks
                WHERE document_id = :doc_id AND embedding IS NOT NULL
                ORDER BY embedding <=> :embedding::vector
                LIMIT :top_k
            """),
            {"embedding": str(q_embedding), "doc_id": document_id, "top_k": top_k},
        )
        chunks = result.fetchall()

    # 3. Build context
    context_parts = []
    sources = []
    for content, page, sim in chunks:
        context_parts.append(f"[Page {page}]: {content}")
        sources.append({"page": page, "relevance": float(sim)})

    # Add viewport context
    viewport_info = ""
    if viewport_context:
        viewport_info = f"\nThe user is currently viewing page {viewport_context.get('page', '?')}, section: {viewport_context.get('section', 'unknown')}."

    context = "\n\n".join(context_parts)

    messages = [
        {
            "role": "system",
            "content": f"You are a research assistant. Answer questions about the document using ONLY the provided context. Cite page numbers. Render math in LaTeX.{viewport_info}\n\nDocument context:\n{context}",
        },
    ]

    # Add conversation history (last 10)
    if history:
        messages.extend(history[-10:])

    messages.append({"role": "user", "content": question})

    # 4. Stream response
    return await chat_completion(api_key, messages, stream=True), sources
```

- [ ] **Step 4: Create RAG SSE router**

```python
# services/processing/app/routers/rag.py
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.services.rag import query_rag
import json

router = APIRouter(prefix="/rag")

@router.post("/query")
async def rag_query(request: Request):
    body = await request.json()
    document_id = body["document_id"]
    question = body["question"]
    api_key = body["api_key"]
    viewport_context = body.get("viewport_context")
    history = body.get("history", [])

    token_stream, sources = await query_rag(
        document_id, question, api_key, viewport_context, history
    )

    async def event_stream():
        # Send sources first
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        async for token in token_stream:
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

Register in `main.py`: `from app.routers import rag` and `app.include_router(rag.router)`.

- [ ] **Step 5: Create viewport tracking hook**

```typescript
// src/hooks/use-viewport-tracking.ts
"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ViewportContext {
  page: number;
  scrollPct: number;
  visibleSectionIds: number[];
}

export function useViewportTracking(
  containerRef: React.RefObject<HTMLElement | null>,
  totalPages: number
): ViewportContext {
  const [context, setContext] = useState<ViewportContext>({
    page: 1,
    scrollPct: 0,
    visibleSectionIds: [],
  });

  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleScroll = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;

      const scrollPct = el.scrollTop / (el.scrollHeight - el.clientHeight);
      const page = Math.max(1, Math.ceil(scrollPct * totalPages));

      setContext({ page, scrollPct, visibleSectionIds: [] });
    }, 500); // 500ms debounce per PRD
  }, [containerRef, totalPages]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return context;
}
```

- [ ] **Step 6: Create chat message component**

```tsx
// src/components/reader/chat-message.tsx
interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  sources?: { page: number; relevance: number }[];
}

export function ChatMessage({ role, content, sources }: ChatMessageProps) {
  return (
    <div className={`py-3 ${role === "user" ? "text-right" : ""}`}>
      <div
        className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted"
        }`}
      >
        <p className="whitespace-pre-wrap">{content}</p>
        {sources && sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sources.map((s, i) => (
              <span key={i} className="rounded bg-background/50 px-1.5 py-0.5 text-[10px]">
                p.{s.page}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create chat hook**

```typescript
// src/hooks/use-chat.ts
"use client";

import { useState, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { page: number; relevance: number }[];
}

interface UseChatOptions {
  documentId: number;
  viewportContext: { page: number; scrollPct: number };
}

export function useChat({ documentId, viewportContext }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: Message = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        question: content,
        viewportContext,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok || !res.body) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Error: could not get response." }]);
      setLoading(false);
      return;
    }

    let assistantContent = "";
    let sources: { page: number; relevance: number }[] = [];

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Add placeholder message
    setMessages((prev) => [...prev, { role: "assistant", content: "", sources: [] }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "sources") {
              sources = data.sources;
            } else if (data.type === "token") {
              assistantContent += data.content;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  sources,
                };
                return updated;
              });
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    }

    setLoading(false);
  }, [documentId, viewportContext, messages]);

  return { messages, sendMessage, loading };
}
```

- [ ] **Step 8: Create chat panel**

```tsx
// src/components/reader/chat-panel.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@/hooks/use-chat";
import { ChatMessage } from "./chat-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatPanelProps {
  documentId: number;
  viewportContext: { page: number; scrollPct: number };
  open: boolean;
}

export function ChatPanel({ documentId, viewportContext, open }: ChatPanelProps) {
  const { messages, sendMessage, loading } = useChat({ documentId, viewportContext });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  if (!open) return null;

  function handleSend() {
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
    setInput("");
  }

  return (
    <div className="flex w-80 flex-col border-l bg-background">
      <div className="border-b p-3">
        <h2 className="text-sm font-semibold">Ask about this paper</h2>
        <p className="text-[10px] text-muted-foreground">
          Viewing page {viewportContext.page}
        </p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">
            Ask a question about the paper. The AI has read the entire document and knows what you're looking at.
          </p>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} {...msg} />
        ))}
      </div>
      <div className="border-t p-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask a question..."
          className="text-sm"
        />
        <Button size="sm" onClick={handleSend} disabled={loading}>
          Send
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create Next.js proxy route for RAG**

Create `src/app/api/ai/chat/route.ts` that:
1. Authenticates the user
2. Fetches their decrypted LLM API key from DB
3. Proxies the request to FastAPI `/rag/query` with the key
4. Streams the SSE response back to the client

- [ ] **Step 10: Wire chat panel and viewport tracking into the reader**

Update `reader-client.tsx` to include the ChatPanel, OutlineSidebar, and viewport tracking. Add toggle buttons in the toolbar for each panel.

- [ ] **Step 11: Test end-to-end**

1. Ensure a document has been processed (chunks + embeddings exist)
2. Open reader → open chat panel
3. Ask a question about the paper
4. Response streams in with page citations
5. Scroll → viewport context updates in panel header

- [ ] **Step 12: Commit**

```bash
git add src/db/schema/agent-conversations.ts src/db/schema/agent-messages.ts src/db/schema/index.ts \
  services/processing/app/services/rag.py services/processing/app/services/embeddings.py \
  services/processing/app/routers/rag.py services/processing/app/tasks/generate_embeddings.py \
  src/hooks/use-chat.ts src/hooks/use-viewport-tracking.ts \
  src/components/reader/chat-panel.tsx src/components/reader/chat-message.tsx \
  src/app/api/ai/
git commit -m "feat(rag): add RAG Q&A chat with viewport awareness and SSE streaming"
```

---

# Phase 2: Smart Reading (Task Outlines)

> Phases 2-4 are outlined at task level. Detailed code will be planned when Phase 1 is complete. Each can be planned as a separate detailed plan.

## Phase 2.0 — Smart Citations

**DB:** `document_references`, `library_references`, `kept_citations` tables

**Tasks:**
- [ ] Task 18: Create Drizzle schemas for references, library refs, kept citations
- [ ] Task 19: Citation extraction task (parse `[n]` markers from text layer, create DocumentReference rows)
- [ ] Task 20: Semantic Scholar API integration service (fetch metadata by title/DOI)
- [ ] Task 21: Citation card UI component (click [n] → popover with title, authors, abstract, actions)
- [ ] Task 22: "Keep It" and "Save to Library" API routes + UI
- [ ] Task 23: Library references page at `/library/references`

## Phase 2.1 — Auto-Highlight

**DB:** `document_highlights` table (auto-generated, distinct from user_highlights)

**Tasks:**
- [ ] Task 24: Auto-highlight Drizzle schema
- [ ] Task 25: Classification Celery task (send sentences to LLM → classify as novelty/method/result/background/limitation)
- [ ] Task 26: Auto-highlight overlay component (color-coded by classification, toggleable)

## Phase 2.2 — Enhanced AI Agent + TTS

**Tasks:**
- [ ] Task 27: Agent tool-use system (search doc, lookup citation, explain formula tools)
- [ ] Task 28: SSE streaming for enhanced agent responses with inline citations
- [ ] Task 29: TTS toggle on agent responses (ElevenLabs BYOK, speaker icon per message)

## Phase 2.3 — Library Management

**Tasks:**
- [ ] Task 30: Collections/folders schema and CRUD
- [ ] Task 31: Tags, search, sort, bulk operations on library page
- [ ] Task 32: Library UI redesign with filters and grid/list toggle

---

# Phase 3: Advanced AI (Task Outlines)

## Phase 3.0 — Figure & Formula Enhancement

**DB:** `document_figures`, `document_formulas` tables

**Tasks:**
- [ ] Task 33: Figure/formula Drizzle schemas
- [ ] Task 34: Figure detection Celery task (extract bounding boxes, crop images)
- [ ] Task 35: Formula extraction task (Mistral OCR → LaTeX)
- [ ] Task 36: Click-to-zoom figure component with AI explanation
- [ ] Task 37: Formula explanation panel with KaTeX rendering

## Phase 3.1 — External Links & Deep References

**DB:** `document_links` table

**Tasks:**
- [ ] Task 38: Link extraction from PDF text layer
- [ ] Task 39: DOI/URL resolution and open-access link finder
- [ ] Task 40: Related paper suggestions via Semantic Scholar

## Phase 3.2 — Voice Mode (Push-to-Talk)

**Tasks:**
- [ ] Task 41: WebSocket endpoint for bidirectional audio streaming
- [ ] Task 42: MediaRecorder + Web Audio API frontend
- [ ] Task 43: STT integration (ElevenLabs/OpenRouter)
- [ ] Task 44: TTS streaming response
- [ ] Task 45: Voice orb UI (idle/listening/processing/speaking states)
- [ ] Task 46: Interruption handling (spacebar during playback)

## Phase 3.3 — BibTeX Export

**Tasks:**
- [ ] Task 47: BibTeX formatter service
- [ ] Task 48: Export API route (`/api/library/export?format=bibtex`)
- [ ] Task 49: Copy-single-citation button on citation cards

---

# Phase 4: Polish & Scale (Task Outlines)

## Phase 4.0 — Dark Mode

- [ ] Task 50: Toggle component using existing shadcn theme vars in `globals.css`
- [ ] Task 51: CSS filter on PDF canvas for dark/sepia reading modes

## Phase 4.1 — Full-Text Search

- [ ] Task 52: PostgreSQL FTS across library (document titles, content)
- [ ] Task 53: In-document search using PDF.js built-in search API

## Phase 4.2 — Split View & Reading Memory

- [ ] Task 54: Side-by-side PDF tab view
- [ ] Task 55: Remember last reading position per document (localStorage + DB sync)

## Phase 4.3 — OAuth & Cloud Key Sync

- [ ] Task 56: Better Auth OAuth plugins (Google, GitHub)
- [ ] Task 57: Cloud key sync across devices

## Phase 4.4 — Performance & Production

- [ ] Task 58: S3 file storage migration (swap local fs → S3 in `storage.ts`)
- [ ] Task 59: CDN for static assets
- [ ] Task 60: Rate limiting on API routes
- [ ] Task 61: Sentry error tracking
- [ ] Task 62: Virtual page rendering for large PDFs (only render visible + buffer)

---

## Verification Protocol

After each sub-phase:
1. `npm run build` — zero TypeScript errors
2. `npm run dev` — feature works in browser
3. `docker compose up` — backend services healthy (Phase 1.0+)
4. Manual test acceptance criteria per task
5. Commit with descriptive message
