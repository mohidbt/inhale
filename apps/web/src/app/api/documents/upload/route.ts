import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { saveFile } from "@/lib/storage";
import { extractPdfPages } from "@/lib/ai/pdf-text";
import { chunkPages } from "@/lib/ai/chunking";
import { getDecryptedApiKey } from "@/lib/ai/embeddings";
import { signRequest } from "@/lib/agents/sign-request";

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

    if (chunks.length === 0) {
      await db
        .update(documents)
        .set({ processingStatus: "ready", pageCount: pages.length })
        .where(eq(documents.id, doc.id));
    } else {
      const apiKey = await getDecryptedApiKey(session.user.id);
      const payload = JSON.stringify({
        documentId: doc.id,
        chunks: chunks.map((c) => ({
          chunkIndex: c.chunkIndex,
          content: c.content,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          tokenCount: c.tokenCount,
        })),
      });
      const { headers: agentHeaders } = signRequest({
        method: "POST",
        path: "/agents/embed-chunks",
        body: payload,
        userId: session.user.id,
        documentId: doc.id,
        llmKey: apiKey,
      });
      const agentRes = await fetch(`${process.env.AGENTS_URL}/agents/embed-chunks`, {
        method: "POST",
        headers: { ...agentHeaders, "Content-Type": "application/json" },
        body: payload,
      });
      if (!agentRes.ok) throw new Error(`embed-chunks failed: ${agentRes.status}`);

      await db
        .update(documents)
        .set({ processingStatus: "ready", pageCount: pages.length })
        .where(eq(documents.id, doc.id));
    }
  } catch (err) {
    console.error("Inline processing failed", err);
    await db.update(documents).set({ processingStatus: "failed" }).where(eq(documents.id, doc.id));
    // Still return 201 — file is uploaded, processing failed separately
  }

  const [updatedDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
  return NextResponse.json({ document: updatedDoc ?? doc }, { status: 201 });
}
