import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { libraryReferences } from "@/db/schema";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const refId = parseInt(id, 10);
  if (isNaN(refId)) {
    return NextResponse.json({ error: "Invalid reference ID" }, { status: 400 });
  }

  await db
    .delete(libraryReferences)
    .where(and(eq(libraryReferences.id, refId), eq(libraryReferences.userId, session.user.id)));

  return NextResponse.json({ success: true });
}
