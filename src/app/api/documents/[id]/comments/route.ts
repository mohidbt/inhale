import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userComments, documents } from "@/db/schema";
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

  try {
    const comments = await db
      .select()
      .from(userComments)
      .where(
        and(
          eq(userComments.documentId, documentId),
          eq(userComments.userId, session.user.id)
        )
      );

    return NextResponse.json({ comments });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
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
  const { content, pageNumber, highlightId } = body;

  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content must be a non-empty string" }, { status: 422 });
  }
  if (typeof pageNumber !== "number" || !Number.isInteger(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: "pageNumber must be a positive integer" }, { status: 422 });
  }

  try {
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, session.user.id)))
      .limit(1);

    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [comment] = await db
      .insert(userComments)
      .values({
        userId: session.user.id,
        documentId,
        highlightId: typeof highlightId === "number" ? highlightId : null,
        pageNumber,
        content,
      })
      .returning();

    return NextResponse.json({ comment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const documentId = parseInt(id, 10);
  if (isNaN(documentId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const commentId = parseInt(request.nextUrl.searchParams.get("commentId") ?? "", 10);
  if (isNaN(commentId)) return NextResponse.json({ error: "commentId required" }, { status: 400 });

  try {
    await db
      .delete(userComments)
      .where(
        and(
          eq(userComments.id, commentId),
          eq(userComments.userId, session.user.id),
          eq(userComments.documentId, documentId)
        )
      );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
