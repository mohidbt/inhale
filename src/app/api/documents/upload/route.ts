import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents, documentChunks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { saveFile } from "@/lib/storage";
import { extractPdfPages } from "@/lib/ai/pdf-text";
import { chunkPages } from "@/lib/ai/chunking";
import { embedTexts } from "@/lib/ai/embeddings";

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

  try {
    await db.update(documents).set({ processingStatus: "processing" }).where(eq(documents.id, doc.id));

    const pages = await extractPdfPages(doc.filePath);
    const chunks = chunkPages(pages);

    const BATCH = 64;
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH).map((c) => c.content);
      const vecs = await embedTexts(session.user.id, batch);
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
    await db.update(documents).set({ processingStatus: "failed" }).where(eq(documents.id, doc.id));
    // Still return 201 — file is uploaded, processing failed separately
  }

  return NextResponse.json({ document: doc }, { status: 201 });
}
