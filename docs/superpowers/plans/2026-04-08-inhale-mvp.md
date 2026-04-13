# Inhale — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an AI-enhanced interactive PDF reader for scientific papers where every element is interactive and AI-augmented, using a BYOK (Bring Your Own Key) model.

**Architecture:** Pure Next.js 16 App Router monorepo. CRUD, auth, AI/RAG, and document processing all run as Next.js route handlers and server actions — no separate Python service. Postgres 16 + pgvector for storage and vector search. Drizzle ORM owns the schema. SSE for AI streaming, WebSocket only for voice mode (Phase 3.2).

**Tech Stack:** Next.js 16, React 19, Tailwind 4, shadcn/ui (nova), Better Auth, Drizzle ORM, react-pdf v9, Zustand, `@openrouter/sdk` (BYOK), pgvector (Postgres extension), Node.js crypto AES-256-GCM

> **Not using LangChain TS.** OpenRouter SDK's `callModel` + `tool()` + `stopWhen` covers v0 RAG and any future tool use. Revisit LangChain/LangGraph if/when multi-agent or human-in-the-loop workflows are actually needed.

**PRD Source:** `/Users/mohidbutt/Documents/Claudius/Second Brain/Projects/Episteme/Inhale_PRD_ERD.md`

**Previous plan (reference):** `.claude/plans/staged-drifting-crab.md`

---

## Progress

| Phase | Status | Notes |
|---|---|---|
| **0.0 — Infrastructure & Database** | DONE | Postgres Docker, Drizzle schema (users, documents, user_api_keys), migration applied |
| **0.1 — Authentication** | DONE | Better Auth + Drizzle adapter, login/signup pages, middleware |
| **0.2 — Document Upload & Library** | DONE | Upload route, library grid, delete |
| **0.3 — PDF Reader (Core Rendering)** | DONE | next/dynamic SSR fix, Prev/Next scroll, manual-scroll no-feedback fix, real-paper benchmark passing (18/18 e2e) |
| **0.4 — Highlighting** | DONE | Schema, CRUD, color picker toolbar, sidebar, AbortController + DOMRect serialization fixes |
| **0.5 — Comments & BYOK Settings** | DONE | Encrypted user_api_keys storage, settings UI |
| **1.0 — BYOK OpenRouter (server-side)** | DONE | `getDecryptedApiKey` + `getOpenRouterClient` + `MODELS`. `services/processing/` deleted. `@openrouter/sdk` named import. |
| **1.1 — Chunking + pgvector** | DONE | `unpdf` text extraction, sliding-window chunker, OpenRouter embeddings via fetch, inline on upload with `processingStatus`. |
| **1.2 — AI Outline via Next.js route** | DONE | `/api/documents/[id]/outline` (cached in `documentSections`), `/api/ai/explain` SSE, `OutlineSidebar` + `ConceptsPanel` + `SectionPreview` wired into reader. |
| **1.3 — Minimal RAG Chat** | DONE | `/api/documents/[id]/chat` — pgvector retrieval + viewport bias, SSE, conversation persistence, `conversationId` round-trip. Client BYOK fetch removed. + viewport page-awareness in system prompt. |
| **E2E — Playwright test suite** | DONE | `e2e/ai-features.spec.ts` — 4 tests: upload→chunk API contract, outline sidebar (mocked), explain SSE (mocked), RAG chat turn (mocked). Added `data-testid` to `OutlineSidebar` + `ConceptsPanel` for stable selectors. Tests 2–4 use `page.route()` — no real OpenRouter key needed. |
| **Hotfix — local DB schema drift** | DONE | Chat 500'd with `column "page_start" does not exist`. Root cause: local Postgres was out of sync with Phase 1.1's schema — `document_chunks` was missing `page_start`/`page_end`/`embedding` columns and the ivfflat index, and the pgvector extension had never been installed. Cause: Phase 1.1 edited `document-chunks.ts` but never ran `drizzle-kit generate`/`push`; `drizzle/0002_enable_pgvector.sql` was authored but not in the journal. Fix: built pgvector 0.8.2 from source against `postgresql@16` (brew's formula only ships pg17/pg18 binaries), then applied 4 raw SQL statements manually. DB now aligned. **E2E blind spot:** test 1 accepts `processingStatus: /^(ready\|failed)$/`, so silent chunking failures pass; tests 2–4 mock `/api/documents/*/chat` so the real SQL path is never exercised. No commit — all changes were DB-side. |
| **Migration rebaseline — drift debt** | NEXT | `drizzle/` has only `0000_goofy_spencer_smythe.sql`, which predates chunking entirely. Every table since Phase 0.4+ (`document_chunks`, `document_sections`, `user_highlights`, `user_comments`, agent tables, pgvector extension) was created via ad-hoc `drizzle-kit push` and is NOT reflected in any migration file or the journal. A fresh clone + `drizzle-kit migrate` will not reproduce the current state. **Todo:** (1) snapshot the current schema into real migration files — either via `drizzle-kit introspect` (reads live DB → produces schema + migration) or by hand-rolling; update `drizzle/meta/_journal.json` + `*_snapshot.json` accordingly. (2) Fold `drizzle/0002_enable_pgvector.sql` in (note: `CREATE EXTENSION vector` requires superuser, separate from app role — either script it outside drizzle or document it). (3) Add a macOS setup note/README for pgvector on pg16: brew ships pg17/pg18 only, so either build from source (`git clone pgvector && make PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config && make install`) or switch to the `pgvector/pgvector:pg16` Docker image already referenced in `docker-compose.yml`. (4) Evaluate whether local dev should standardize on Docker Postgres to prevent this class of drift. (5) Tighten E2E so it catches schema drift — e.g. a test that uploads with a real/fake key stub and asserts `processingStatus === "ready"` and `COUNT(document_chunks) > 0` for the doc, rather than accepting `failed` as a valid outcome. |
| **PDF text selection — multi-row + gaps + triple-click** | DONE | Ported `TextLayerBuilder.#enableGlobalSelectionListener` from `pdfjs-dist/web/pdf_viewer.mjs` into `src/hooks/use-pdf-text-selection.ts` (called once from `PdfViewer`). `react-pdf` only toggles `.selecting` on mousedown/mouseup; it was missing the `selectionchange` handler that dynamically moves `.endOfContent` into the DOM adjacent to the selection anchor and sets its width/height to cover the layer. Without that, Chrome's selection extension jumped to end-of-page when the pointer entered the gap between rows. Side effect: also fixed per-word highlight gaps (endOfContent now covers the layer area) and triple-click line select. Verified via DOM assertions (endOfContent repositioned, `.selecting` applied, selection height bounded to selected rows). |
| **Tech debt — PDF text selection (remaining)** | KNOWN | Two remaining issues, both inherent to pdfjs's transparent-text-over-canvas architecture: (1) **double-click word overlay width slightly misaligned** — browser renders fallback font, pdfjs scales span via `shouldScaleText`, but glyph metrics don't perfectly match the canvas-rendered PDF text. (2) **multi-column layouts with a divider** — selection drags across columns pick up text in reading order (all of column 1 end → start of column 2) rather than staying within the intended column, making cross-column selection look buggy. **Future options:** (a) custom inline text layer with per-line `scaleX` correction matching PDF glyph widths (fixes #1), (b) column-aware selection handler that detects divider gaps and constrains selection (fixes #2), (c) switch to `@react-pdf-viewer/core`, (d) accept limitations. Chrome's built-in PDF viewer uses a native C++ renderer, so 1:1 parity via JS is fundamentally limited. |
| 2.0–2.3 | Pending | — |
| 3.0–3.3 | Pending | — |
| 4.0–4.4 | Pending | — |

---

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Backend | Pure Next.js 16 route handlers + server actions | One language, one runtime, one deploy target. No dual-stack tax. |
| Auth | Better Auth (self-hosted TS lib) | Email+password built-in, OAuth plugin later, stores in your Postgres, no vendor lock-in |
| ORM | Drizzle ORM | Lightweight, SQL-like, excellent TS inference, schema-as-code |
| Streaming | SSE for text agent + all AI features; WebSocket only for voice | SSE simpler, works through Vercel/Cloudflare, auto-reconnects |
| PDF rendering | react-pdf v9 (wraps PDF.js), loaded via `next/dynamic` to bypass SSR | React 19 support, canvas + text layer |
| Reader state | Zustand | Minimal boilerplate for page/zoom/scroll state |
| Vector DB | pgvector (Postgres extension) | No separate service, lives in existing Postgres |
| Background work | Inline in upload route handler (v0); revisit if jobs >5s become common | Avoid Celery/Redis/queue complexity until measured demand exists |
| LLM | OpenRouter via `@openrouter/sdk` (BYOK) | User provides key, multi-model access, native TS, `callModel` + tools + streaming |
| Embeddings | OpenRouter OpenAI-compatible REST endpoint via `fetch` | SDK does not currently expose embeddings; use `POST https://openrouter.ai/api/v1/embeddings` with `openai/text-embedding-3-small` |
| Agent framework | None (raw `callModel` + `tool()`) | LangChain TS not justified for v0; revisit if multi-agent or HITL is needed |
| OCR | Mistral OCR API (BYOK), called via `fetch` from Next.js route | Best-in-class for scientific PDFs |
| Citations | Semantic Scholar API (free) | Comprehensive, good rate limits |
| Encryption | Node.js crypto AES-256-GCM | Built-in, zero dependencies |
| Repo structure | Single Next.js project under `src/` | No separate services directory |

---

## Dependency Graph

```
0.0 (Infra) ✅ → 0.1 (Auth) ✅ → 0.2 (Upload) ✅ → 0.3 (Reader) ✅ → 0.4 (Highlights) ✅ → 0.5 (Comments/BYOK) ✅
                                                                                                  |
                                                                                                  v
                                                                                          1.0 (BYOK OpenRouter)
                                                                                                  |
                                                                                                  v
                                                                                          1.1 (Chunking + pgvector)
                                                                                                  |
                                                                                          ┌───────┴───────┐
                                                                                          v               v
                                                                                  1.2 (AI Outline)   1.3 (RAG Chat)
                                                                                                  |
                                                                                  2.0–2.3 (independent of each other)
                                                                                                  |
                                                                                  3.0–3.3 (independent of each other)
                                                                                                  |
                                                                                  4.0–4.4 (can interleave after Phase 1)
```

---

## Existing Files (Phase 0.0 — already built)

- `docker-compose.yml` — Postgres 16 (pgvector)
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

### Phase 1: First AI Features (pure Next.js)

```
src/
├── lib/
│   └── ai/
│       ├── openrouter.ts            # Get decrypted key from user_api_keys → returns initialized OpenRouter SDK client
│       ├── embeddings.ts            # fetch wrapper for OpenRouter /embeddings (text-embedding-3-small)
│       ├── chunking.ts              # ~500-token chunks, ~50-token overlap (no langchain)
│       └── pdf-text.ts              # Extract text from a stored PDF (pdf-parse / unpdf — pure JS)
├── db/schema/
│   ├── document-sections.ts         # already exists (used by outline)
│   ├── document-chunks.ts           # already exists; add `embedding vector(1536)` column in 1.1
│   ├── document-outlines.ts         # already exists
│   ├── agent-conversations.ts      # already exists
│   └── agent-messages.ts            # already exists
├── app/api/
│   └── documents/
│       └── [id]/
│           ├── outline/route.ts     # GET → run LLM, persist to document_sections (Task 16)
│           └── chat/route.ts        # POST → embed q → pgvector top-K → callModel + getTextStream → SSE (Task 17)
├── components/
│   ├── library/
│   │   └── processing-badge.tsx     # Status indicator on cards (kept as inline-flag)
│   └── reader/
│       ├── outline-sidebar.tsx      # already exists; rewire to /api/documents/[id]/outline
│       ├── section-preview.tsx      # Hover preview popover
│       ├── concepts-panel.tsx       # Selected text explanation (already exists; rewire)
│       ├── chat-panel.tsx           # already exists; remove `apiKey` prop, hit /api/documents/[id]/chat
│       └── chat-message.tsx         # already exists
└── hooks/
    ├── use-chat.ts                  # already exists; point at /api/documents/${id}/chat, drop api_key from body
    └── use-viewport-tracking.ts     # already exists; pass {page} into chat POST body
```

> **Removed:** the entire `services/processing/` Python tree from the previous plan. A separate execution step (Task 14) calls for deleting that directory if it has been created on disk.

---

# Phase 0: Core Reader

## Phase 0.0 — Infrastructure & Database [DONE]

Already complete. Docker Compose (Postgres 16 + pgvector), Drizzle ORM setup, initial schema (users, documents, user_api_keys), migration applied.

**Prerequisite for all subsequent tasks:** Run `docker compose up -d` and `npx drizzle-kit push` to create tables. Redis is no longer required.

---

## Phase 0.1 — Authentication [DONE]

> Tasks 1–3 below are kept for historical reference. All steps were completed and verified.

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

## Phase 0.2 — Document Upload & Library [DONE]

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

## Phase 0.3 — PDF Reader (Core Rendering) [DONE]

> **Verified today (2026-04-09):** 18/18 e2e tests passing including the real-paper benchmark. Today's fixes:
> - SSR fix — `react-pdf` is now imported via `next/dynamic({ ssr: false })` from `pdf-viewer.tsx`
> - Prev/Next scroll — toolbar buttons in `reader-toolbar.tsx` now scroll the viewer to the target page instead of only updating state
> - Manual-scroll no-feedback fix — `use-reader-state.ts` no longer fights the user's own scroll updates
> - Real-paper benchmark — `e2e/reader.spec.ts` exercises an actual scientific paper end to end
> - `loading.tsx` for the reader route was added earlier in the day
>
> Tasks 6–7 below are kept for historical reference and represent the final shipped state.

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

## Phase 0.4 — Highlighting [DONE]

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

## Phase 0.5 — Comments & BYOK Settings [DONE]

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

# Phase 1: First AI Features (pure Next.js)

> This phase replaces the old "FastAPI Service Bootstrap / Celery Pipeline / RAG via FastAPI" path entirely. Everything runs in Next.js route handlers using the `@openrouter/sdk` TS package and `pgvector` in the existing Postgres. No Python service, no separate worker, no message queue.

## Phase 1.0 — BYOK OpenRouter (server-side)

### Task 14: OpenRouter SDK helper + delete legacy Python tree

**Files:**
- Create: `src/lib/ai/openrouter.ts`
- Modify: `package.json` (add `@openrouter/sdk`)
- Delete: `services/processing/` (entire directory if it exists from earlier scaffolding)
- Modify: `docker-compose.yml` (remove any `processing` / `celery-worker` / `redis` services that may have been added)

- [ ] **Step 1: Install the OpenRouter TS SDK**

```bash
npm install @openrouter/sdk
```

> Read the package's published README before writing the helper. APIs from training data are not authoritative. The shapes used below (`callModel`, `getTextStream`, `tool()`, `stepCountIs`, `stopWhen`) are the ones we plan against — verify them against the installed version and adjust this helper if names changed.

- [ ] **Step 2: Create the per-user OpenRouter client factory**

```typescript
// src/lib/ai/openrouter.ts
import OpenRouter from "@openrouter/sdk";
import { db } from "@/db";
import { userApiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";

/**
 * Load the user's stored OpenRouter (provider_type = 'llm') key,
 * decrypt it, and return an initialized client.
 *
 * Throws if the user has not stored an LLM key yet — callers should
 * surface a "Add an OpenRouter key in Settings" message.
 */
export async function getOpenRouterClient(userId: string): Promise<OpenRouter> {
  const [row] = await db
    .select({ encryptedKey: userApiKeys.encryptedKey })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.providerType, "llm")));

  if (!row) {
    throw new Error("NO_LLM_KEY");
  }

  const apiKey = decrypt(row.encryptedKey);
  return new OpenRouter({ apiKey });
}

/** Default models used across the app. Centralized so we can swap easily. */
export const MODELS = {
  chat: "openai/gpt-4o-mini",
  outline: "openai/gpt-4o-mini",
  embedding: "openai/text-embedding-3-small",
} as const;
```

- [ ] **Step 3: Delete the legacy `services/processing/` directory**

If a previous run of the old plan created `services/processing/` (FastAPI + Celery), remove it now. There is no Python backend in this architecture.

```bash
rm -rf services/processing
# If any 'processing', 'celery-worker', or 'redis' service blocks were added
# to docker-compose.yml, remove those blocks too. Postgres (pgvector) is the
# only docker service we need.
```

- [ ] **Step 4: Verification — one live ping**

Add a temporary route or a `tsx` script that calls `getOpenRouterClient(userId)` and runs:

```ts
const client = await getOpenRouterClient(userId);
const result = client.callModel({
  model: MODELS.chat,
  input: [{ role: "user", content: "Reply with the word PONG only." }],
});
let out = "";
for await (const delta of result.getTextStream()) out += delta;
console.log(out); // expect: PONG
```

Acceptance: a single live call returns text. Delete the temporary script after verifying.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/openrouter.ts package.json package-lock.json docker-compose.yml
# (and `git rm -r services/processing` if it existed)
git commit -m "feat(ai): add OpenRouter SDK client factory; remove legacy Python service"
```

---

## Phase 1.1 — Chunking + pgvector (inline on upload)

### Task 15: Enable pgvector, add embedding column, chunk + embed inline

**Files:**
- Modify: `src/db/schema/document-chunks.ts` (add `embedding vector(1536)` column + ivfflat index)
- Create: `drizzle/000X_enable_pgvector.sql` (manual migration to `CREATE EXTENSION IF NOT EXISTS vector`)
- Create: `src/lib/ai/chunking.ts`
- Create: `src/lib/ai/embeddings.ts`
- Create: `src/lib/ai/pdf-text.ts`
- Modify: `src/app/api/documents/upload/route.ts` (call extract → chunk → embed inline after the file is saved)

> **Schemas already exist** from Phase 0: `documentChunks`, `documentSections`, `documentOutlines`, `agentConversations`, `agentMessages`. Phase 1 only adds the `embedding` column on `documentChunks` and an ivfflat index. Do not redefine those tables.

- [ ] **Step 1: Enable the pgvector extension**

Create `drizzle/000X_enable_pgvector.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Apply via `npx drizzle-kit push` (or `psql` directly). The Postgres image in `docker-compose.yml` is already `pgvector/pgvector:pg16`, so the extension is available.

- [ ] **Step 2: Add the `embedding` column to `documentChunks`**

```typescript
// src/db/schema/document-chunks.ts — add the column + index
import { pgTable, text, timestamp, serial, integer, vector, index } from "drizzle-orm/pg-core";
// ...

export const documentChunks = pgTable(
  "document_chunks",
  {
    // ...existing columns...
    embedding: vector("embedding", { dimensions: 1536 }),
  },
  (t) => ({
    embeddingIdx: index("document_chunks_embedding_idx")
      .using("ivfflat", t.embedding.op("vector_cosine_ops"))
      .with({ lists: 100 }),
  })
);
```

Run `npx drizzle-kit push`. Confirm the column and index exist in `psql`.

- [ ] **Step 3: Create the PDF text extractor**

```typescript
// src/lib/ai/pdf-text.ts
// Pure JS / no native deps. `unpdf` is a good fit (no canvas, ESM-friendly).
import { extractText, getDocumentProxy } from "unpdf";
import { getFile } from "@/lib/storage";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export async function extractPdfPages(filePath: string): Promise<ExtractedPage[]> {
  const buffer = await getFile(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages } = pdf;
  const pages: ExtractedPage[] = [];
  for (let i = 1; i <= totalPages; i++) {
    const { text } = await extractText(pdf, { mergePages: false, pageNumbers: [i] });
    pages.push({ pageNumber: i, text: Array.isArray(text) ? text.join("\n") : text });
  }
  return pages;
}
```

> If `unpdf` is unavailable in the installed Next.js version, fall back to `pdf-parse`. Goal: a `(pageNumber, text)[]` array. No native bindings.

- [ ] **Step 4: Create the chunker (no langchain)**

```typescript
// src/lib/ai/chunking.ts
import type { ExtractedPage } from "./pdf-text";

export interface DocumentChunk {
  chunkIndex: number;
  content: string;
  pageStart: number;
  pageEnd: number;
  tokenCount: number;
}

// Cheap token estimator: ~4 chars per token. Good enough for chunk sizing.
const APPROX_CHARS_PER_TOKEN = 4;
const CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;

export function chunkPages(pages: ExtractedPage[]): DocumentChunk[] {
  // Build a flat stream of (char, page) so chunks know which pages they span.
  const stream: { ch: string; page: number }[] = [];
  for (const p of pages) {
    for (const ch of p.text) stream.push({ ch, page: p.pageNumber });
    stream.push({ ch: "\n", page: p.pageNumber });
  }

  const chunkChars = CHUNK_TOKENS * APPROX_CHARS_PER_TOKEN;
  const overlapChars = OVERLAP_TOKENS * APPROX_CHARS_PER_TOKEN;
  const step = chunkChars - overlapChars;

  const chunks: DocumentChunk[] = [];
  let idx = 0;
  for (let start = 0; start < stream.length; start += step) {
    const end = Math.min(start + chunkChars, stream.length);
    const slice = stream.slice(start, end);
    if (slice.length === 0) break;
    const content = slice.map((s) => s.ch).join("").trim();
    if (!content) continue;
    chunks.push({
      chunkIndex: idx++,
      content,
      pageStart: slice[0].page,
      pageEnd: slice[slice.length - 1].page,
      tokenCount: Math.ceil(slice.length / APPROX_CHARS_PER_TOKEN),
    });
    if (end === stream.length) break;
  }
  return chunks;
}
```

- [ ] **Step 5: Create the embeddings helper**

The OpenRouter TS SDK does not currently expose an embeddings method, so call OpenRouter's OpenAI-compatible REST endpoint via `fetch`. Use the user's already-decrypted key.

```typescript
// src/lib/ai/embeddings.ts
import { db } from "@/db";
import { userApiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { MODELS } from "./openrouter";

const EMBED_URL = "https://openrouter.ai/api/v1/embeddings";

async function getDecryptedKey(userId: string): Promise<string> {
  const [row] = await db
    .select({ encryptedKey: userApiKeys.encryptedKey })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.providerType, "llm")));
  if (!row) throw new Error("NO_LLM_KEY");
  return decrypt(row.encryptedKey);
}

export async function embedTexts(userId: string, inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const apiKey = await getDecryptedKey(userId);
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODELS.embedding, input: inputs }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter embeddings failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

export async function embedQuery(userId: string, query: string): Promise<number[]> {
  const [vec] = await embedTexts(userId, [query]);
  return vec;
}
```

- [ ] **Step 6: Wire chunking + embedding into the upload route (inline, no queue)**

After `saveFile` in `src/app/api/documents/upload/route.ts`:

```typescript
// after the documents row is inserted
import { extractPdfPages } from "@/lib/ai/pdf-text";
import { chunkPages } from "@/lib/ai/chunking";
import { embedTexts } from "@/lib/ai/embeddings";
import { documentChunks } from "@/db/schema";

try {
  await db.update(documents).set({ processingStatus: "processing" }).where(eq(documents.id, doc.id));

  const pages = await extractPdfPages(doc.filePath);
  const chunks = chunkPages(pages);

  // Embed in batches of 64 to keep request bodies small.
  const BATCH = 64;
  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH).map((c) => c.content);
    const vecs = await embedTexts(Number(session.user.id), batch);
    embeddings.push(...vecs);
  }

  await db.insert(documentChunks).values(
    chunks.map((c, i) => ({
      documentId: doc.id,
      chunkIndex: c.chunkIndex,
      content: c.content,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      tokenCount: c.tokenCount,
      embedding: embeddings[i],
    }))
  );

  await db
    .update(documents)
    .set({ processingStatus: "ready", pageCount: pages.length })
    .where(eq(documents.id, doc.id));
} catch (err) {
  console.error("Inline processing failed", err);
  await db
    .update(documents)
    .set({ processingStatus: "failed" })
    .where(eq(documents.id, doc.id));
  // Still return 201 — the file is uploaded. The UI can show "Processing failed; retry".
}
```

> **Why inline:** for v0, embeddings on a typical 5–40 page paper finish in a few seconds. Avoid Celery / Redis / queues until measurement justifies them. If a single upload takes >5s consistently, revisit by moving processing into a Next.js Route Handler invoked from the client after upload (still no Python).

- [ ] **Step 7: Verification**

1. Upload a multi-page paper via the library UI.
2. `psql`: `SELECT COUNT(*), MIN(chunk_index), MAX(chunk_index) FROM document_chunks WHERE document_id = <id>;` — non-zero, contiguous indices.
3. `SELECT id, page_start, page_end, octet_length(embedding::text) FROM document_chunks WHERE document_id = <id> LIMIT 5;` — embeddings populated.
4. Run a sanity cosine query in `psql` against a hard-coded embedding from `embedQuery` and confirm the top result is from a sensible page.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema/document-chunks.ts drizzle/ \
  src/lib/ai/openrouter.ts src/lib/ai/chunking.ts src/lib/ai/embeddings.ts src/lib/ai/pdf-text.ts \
  src/app/api/documents/upload/route.ts
git commit -m "feat(ai): add pgvector embeddings + inline chunking on upload"
```

---

## Phase 1.2 — AI Outline via Next.js route

### Task 16: Outline route + sidebar wiring

**Files:**
- Create: `src/app/api/documents/[id]/outline/route.ts`
- Modify: `src/components/reader/outline-sidebar.tsx` (already exists; rewire to the new route)
- Modify: `src/components/reader/section-preview.tsx` (already exists; consume `documentSections` row shape)
- Modify: `src/components/reader/concepts-panel.tsx` (already exists; rewire `/api/ai/explain` to `src/app/api/ai/explain/route.ts` — pure Next.js, no FastAPI proxy)

> The `documentSections` and `documentOutlines` tables already exist. The outline endpoint runs the LLM and persists rows into `documentSections` so the sidebar can reuse the same rows for navigation.

- [ ] **Step 1: Create the outline route**

```typescript
// src/app/api/documents/[id]/outline/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents, documentSections } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getOpenRouterClient, MODELS } from "@/lib/ai/openrouter";
import { extractPdfPages } from "@/lib/ai/pdf-text";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const documentId = Number(id);
  const userId = Number(session.user.id);

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If sections already exist, return them.
  const existing = await db
    .select()
    .from(documentSections)
    .where(eq(documentSections.documentId, documentId))
    .orderBy(asc(documentSections.orderIndex));
  if (existing.length > 0) {
    return NextResponse.json({ sections: existing });
  }

  // Otherwise, generate.
  let client;
  try {
    client = await getOpenRouterClient(userId);
  } catch {
    return NextResponse.json({ error: "Add an OpenRouter key in Settings" }, { status: 400 });
  }

  const pages = await extractPdfPages(doc.filePath);
  // Cap context: first ~30 pages of text is plenty for outline generation.
  const sample = pages
    .slice(0, 30)
    .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
    .join("\n\n");

  const result = client.callModel({
    model: MODELS.outline,
    instructions:
      "You are a research paper analyzer. Return a JSON array of sections describing the paper. " +
      'Schema: [{"title": string, "level": 1|2|3, "page": number, "preview": string}]. ' +
      "Levels: 1 = top section, 2 = subsection, 3 = sub-subsection. " +
      "Use real page numbers from the [Page N] markers. Return ONLY the JSON array.",
    input: [{ role: "user", content: sample }],
  });

  let raw = "";
  for await (const delta of result.getTextStream()) raw += delta;

  // Strip code fences if the model emitted any.
  const jsonText = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: { title: string; level: number; page: number; preview?: string }[];
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return NextResponse.json({ error: "Model returned invalid JSON", raw }, { status: 502 });
  }

  const inserted = await db
    .insert(documentSections)
    .values(
      parsed.map((s, i) => ({
        documentId,
        title: s.title,
        level: s.level ?? 1,
        pageStart: s.page,
        contentPreview: s.preview ?? null,
        orderIndex: i,
      }))
    )
    .returning();

  return NextResponse.json({ sections: inserted });
}
```

- [ ] **Step 2: Rewire `outline-sidebar.tsx`**

Point at `/api/documents/${documentId}/outline`. Render rows of shape `{ id, title, level, pageStart, contentPreview }`. On click, call `onNavigate(section.pageStart)`. Drop any old fetch URL that referenced FastAPI.

- [ ] **Step 3: Create `/api/ai/explain` (Next.js, no proxy)**

```typescript
// src/app/api/ai/explain/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getOpenRouterClient, MODELS } from "@/lib/ai/openrouter";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { text } = (await request.json()) as { text: string; documentId: number };
  if (!text?.trim()) return new Response("Bad Request", { status: 400 });

  const client = await getOpenRouterClient(Number(session.user.id));
  const result = client.callModel({
    model: MODELS.chat,
    instructions:
      "You are a concise research tutor. Explain the highlighted passage in plain English in <120 words.",
    input: [{ role: "user", content: text }],
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const delta of result.getTextStream()) {
          controller.enqueue(encoder.encode(`data: ${delta}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: [ERROR] ${(err as Error).message}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Verification**

1. Open a previously uploaded paper in the reader.
2. Open the outline sidebar — first request runs the LLM and persists rows; subsequent requests return immediately from `documentSections`.
3. Click a section → reader scrolls to that page.
4. Select text → "Explain this" → SSE tokens stream into the panel.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/documents/\[id\]/outline/ src/app/api/ai/explain/ \
  src/components/reader/outline-sidebar.tsx src/components/reader/section-preview.tsx \
  src/components/reader/concepts-panel.tsx
git commit -m "feat(ai): add Next.js outline route and explain SSE; drop FastAPI proxy"
```

---

## Phase 1.3 — Minimal RAG Chat (Next.js + SSE)

### Task 17: RAG chat route + client cleanup

**Files:**
- Create: `src/app/api/documents/[id]/chat/route.ts`
- Modify: `src/hooks/use-chat.ts` (point at `/api/documents/${id}/chat`; drop `api_key` from body)
- Modify: `src/components/reader/chat-panel.tsx` (drop `apiKey` prop)
- Modify: `src/app/(reader)/reader/[documentId]/reader-client.tsx` (delete the api-key fetching `useEffect` and `apiKey` state)
- Reuse existing: `src/hooks/use-viewport-tracking.ts`, `src/components/reader/chat-message.tsx`, `agentConversations`, `agentMessages` schemas

> The current chat UI in `src/components/reader/chat-panel.tsx` + `src/hooks/use-chat.ts` points at a nonexistent `http://localhost:8000/rag/chat` Python backend. This phase deletes that path and replaces it with a single Next.js route handler.

- [ ] **Step 1: Create the RAG chat route**

```typescript
// src/app/api/documents/[id]/chat/route.ts
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  documents,
  documentChunks,
  agentConversations,
  agentMessages,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getOpenRouterClient, MODELS } from "@/lib/ai/openrouter";
import { embedQuery } from "@/lib/ai/embeddings";

interface ChatBody {
  question: string;
  conversationId?: number;
  viewportContext?: { page?: number };
  history?: { role: "user" | "assistant"; content: string }[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const documentId = Number(id);
  const userId = Number(session.user.id);

  // Ownership check.
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  if (!doc) return new Response("Not found", { status: 404 });

  const body = (await request.json()) as ChatBody;
  if (!body.question?.trim()) return new Response("Bad Request", { status: 400 });

  let client;
  try {
    client = await getOpenRouterClient(userId);
  } catch {
    return new Response("Add an OpenRouter key in Settings", { status: 400 });
  }

  // 1. Embed the question.
  const queryVec = await embedQuery(userId, body.question);

  // 2. pgvector top-K, biased by current viewport page (±1).
  const currentPage = body.viewportContext?.page ?? null;
  const topK = 6;

  // Cosine distance via the <=> operator. Bias = chunks whose pages overlap
  // [page-1, page+1] get a small score boost.
  const rows = await db.execute<{
    id: number;
    content: string;
    page_start: number;
    page_end: number;
    score: number;
  }>(sql`
    SELECT id, content, page_start, page_end,
      (1 - (embedding <=> ${sql.raw(`'[${queryVec.join(",")}]'`)}::vector))
        + CASE
            WHEN ${currentPage}::int IS NOT NULL
             AND page_start <= ${currentPage}::int + 1
             AND page_end   >= ${currentPage}::int - 1
            THEN 0.05
            ELSE 0
          END AS score
    FROM document_chunks
    WHERE document_id = ${documentId}
      AND embedding IS NOT NULL
    ORDER BY score DESC
    LIMIT ${topK}
  `);

  const contextText = rows
    .map((r) => `[Page ${r.page_start}]\n${r.content}`)
    .join("\n\n---\n\n");

  // 3. Conversation persistence.
  let conversationId = body.conversationId;
  if (!conversationId) {
    const [conv] = await db
      .insert(agentConversations)
      .values({ userId, documentId, title: body.question.slice(0, 80) })
      .returning({ id: agentConversations.id });
    conversationId = conv.id;
  }

  await db.insert(agentMessages).values({
    conversationId,
    role: "user",
    content: body.question,
    inputMode: "text",
    viewportContext: body.viewportContext ?? null,
  });

  // 4. Build messages and stream.
  const systemPrompt =
    "You are a research assistant answering questions about a single PDF. " +
    "Use ONLY the provided context. Cite page numbers inline as (p. N). " +
    "If the answer is not in the context, say so.";

  const inputMessages: { role: "user" | "assistant" | "system"; content: string }[] = [
    { role: "system", content: `${systemPrompt}\n\nContext:\n${contextText}` },
    ...(body.history ?? []).slice(-10),
    { role: "user", content: body.question },
  ];

  const result = client.callModel({
    model: MODELS.chat,
    input: inputMessages,
  });

  // 5. Stream as SSE in the OpenAI-style shape that `use-chat.ts` parses:
  //    `data: { type: 'sources', sources: [...] }`
  //    `data: { type: 'token',   content: '...' }`
  //    `data: [DONE]`
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      const sources = rows.map((r) => ({ page: r.page_start, relevance: Number(r.score) }));
      send({ type: "sources", sources });

      let assistantContent = "";
      try {
        for await (const delta of result.getTextStream()) {
          assistantContent += delta;
          send({ type: "token", content: delta });
        }
      } catch (err) {
        send({ type: "token", content: `\n\n[error: ${(err as Error).message}]` });
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();

      // Persist assistant message after the stream closes.
      await db.insert(agentMessages).values({
        conversationId: conversationId!,
        role: "assistant",
        content: assistantContent,
        inputMode: "text",
        ragSources: sources,
        modelUsed: MODELS.chat,
      });
      await db
        .update(agentConversations)
        .set({ updatedAt: new Date(), messageCount: sql`message_count + 2` })
        .where(eq(agentConversations.id, conversationId!));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

> **Note on the SDK shape:** `callModel` + `getTextStream()` is the v0 surface. If multi-step tool use is wanted later (e.g. let the model call a `lookupCitation` tool), add `tools: [tool({...})]` and `stopWhen: [stepCountIs(5)]` to the same `callModel` call. No agent framework needed.

- [ ] **Step 2: Update `src/hooks/use-chat.ts`**

- Change the URL to `/api/documents/${documentId}/chat`.
- Drop `api_key` from the POST body. Drop any code that tried to fetch the key client-side.
- Keep the existing SSE parsing — the route emits the same `{type: 'sources'|'token'}` shape.
- POST body becomes `{ question, viewportContext, history, conversationId? }`.

- [ ] **Step 3: Update `src/components/reader/chat-panel.tsx`**

- Remove the `apiKey` prop entirely.
- Component depends only on `documentId` + `viewportContext` + `open`.

- [ ] **Step 4: Update `src/app/(reader)/reader/[documentId]/reader-client.tsx`**

- Delete the `useEffect` that fetched the user's API key on the client.
- Delete the `apiKey` state.
- Pass nothing extra to `<ChatPanel />`.

- [ ] **Step 5: Verification**

1. Upload a fresh PDF; wait for processing to flip to `ready`.
2. Open the reader → open the chat panel.
3. Ask "What is this paper about?" → tokens stream in, sources show `(p. N)` chips.
4. Scroll to a specific page → ask a question that should be answered from that page → top result is from `page ± 1`.
5. `psql`: confirm new rows in `agent_conversations` and `agent_messages` (one user + one assistant per turn, with `rag_sources` populated).
6. Confirm no network requests go to `localhost:8000`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/documents/\[id\]/chat/ \
  src/hooks/use-chat.ts \
  src/components/reader/chat-panel.tsx \
  src/app/\(reader\)/reader/\[documentId\]/reader-client.tsx
git commit -m "feat(rag): add Next.js RAG chat route and clean up client BYOK plumbing"
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
- [ ] Task 25: Classification job (Next.js route handler — sentences → LLM → classify as novelty/method/result/background/limitation)
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
- [ ] Task 34: Figure detection job (Next.js route handler — extract bounding boxes, crop images)
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
3. `docker compose up -d` — Postgres (pgvector) is the only required service
4. Manual test acceptance criteria per task
5. Commit with descriptive message
