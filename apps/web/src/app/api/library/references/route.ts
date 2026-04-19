import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { libraryReferences } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refs = await db
    .select()
    .from(libraryReferences)
    .where(eq(libraryReferences.userId, session.user.id))
    .orderBy(desc(libraryReferences.createdAt));

  return NextResponse.json(refs);
}
