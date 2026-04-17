import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { libraryReferences } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ReferenceCard } from "@/components/library/reference-card";

export default async function ReferencesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const refs = await db
    .select()
    .from(libraryReferences)
    .where(eq(libraryReferences.userId, session.user.id))
    .orderBy(desc(libraryReferences.createdAt));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-semibold mb-6">Saved References</h1>

      {refs.length === 0 ? (
        <div className="mt-12 text-center text-muted-foreground">
          <p className="text-lg">No saved references yet.</p>
          <p className="text-sm mt-1">
            Click a citation in a paper and use &ldquo;Save to Library&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {refs.map((r) => (
            <ReferenceCard
              key={r.id}
              id={r.id}
              title={r.title}
              authors={r.authors}
              year={r.year}
              venue={r.venue}
              citationCount={r.citationCount}
              abstract={r.abstract}
              doi={r.doi}
              url={r.url}
            />
          ))}
        </div>
      )}
    </div>
  );
}
