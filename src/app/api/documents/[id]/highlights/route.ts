import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userHighlights } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const documentId = parseInt(id, 10);
  if (isNaN(documentId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const highlights = await db
    .select()
    .from(userHighlights)
    .where(
      and(
        eq(userHighlights.documentId, documentId),
        eq(userHighlights.userId, session.user.id)
      )
    );

  return NextResponse.json({ highlights });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const documentId = parseInt(id, 10);
  if (isNaN(documentId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await request.json();

  const [highlight] = await db
    .insert(userHighlights)
    .values({
      userId: session.user.id,
      documentId,
      pageNumber: body.pageNumber,
      textContent: body.textContent,
      startOffset: body.startOffset,
      endOffset: body.endOffset,
      color: body.color ?? "yellow",
      note: body.note ?? null,
    })
    .returning();

  return NextResponse.json({ highlight }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  void id; // documentId context — ownership check uses highlightId + userId

  const url = new URL(request.url);
  const highlightId = parseInt(url.searchParams.get("highlightId") ?? "", 10);
  if (isNaN(highlightId)) return NextResponse.json({ error: "highlightId required" }, { status: 400 });

  // Verify ownership before deleting
  const [existing] = await db
    .select()
    .from(userHighlights)
    .where(
      and(
        eq(userHighlights.id, highlightId),
        eq(userHighlights.userId, session.user.id)
      )
    )
    .limit(1);

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(userHighlights).where(eq(userHighlights.id, highlightId));

  return NextResponse.json({ success: true });
}
