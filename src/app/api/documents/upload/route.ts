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
      userId: session.user.id,
      title: file.name.replace(/\.pdf$/i, ""),
      filename: file.name,
      filePath: path,
      fileSizeBytes: size,
      processingStatus: "pending",
    })
    .returning();

  return NextResponse.json({ document: doc }, { status: 201 });
}
