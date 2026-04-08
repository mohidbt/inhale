import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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
    .where(eq(documents.userId, session.user.id))
    .orderBy(desc(documents.createdAt));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-semibold mb-6">Library</h1>

      <UploadZone />

      {docs.length === 0 ? (
        <div className="mt-12 text-center text-muted-foreground">
          <p className="text-lg">No documents yet.</p>
          <p className="text-sm mt-1">Upload a PDF above to get started.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
