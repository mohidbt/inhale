import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ReaderClient } from "./reader-client";

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { documentId } = await params;
  const id = parseInt(documentId, 10);
  if (isNaN(id)) notFound();
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, id),
        eq(documents.userId, session.user.id)
      )
    )
    .limit(1);

  if (!doc) notFound();

  return (
    <ReaderClient
      documentId={doc.id}
      title={doc.title}
      processingStatus={doc.processingStatus}
    />
  );
}
