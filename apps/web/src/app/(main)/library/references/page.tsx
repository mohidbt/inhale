import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { libraryReferences } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { authorsToDisplay } from "@/lib/citations/author-utils";

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
          {refs.map((ref) => {
            const abstract =
              ref.abstract && ref.abstract.length > 300
                ? ref.abstract.slice(0, 300) + "…"
                : ref.abstract;

            return (
              <div
                key={ref.id}
                className="border rounded-lg p-4 space-y-1.5"
              >
                <p className="font-semibold leading-snug">{ref.title}</p>

                {authorsToDisplay(ref.authors) && (
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {authorsToDisplay(ref.authors)}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                  {ref.year && <span>{ref.year}</span>}
                  {ref.venue && (
                    <>
                      {ref.year && <span aria-hidden>·</span>}
                      <span className="italic line-clamp-1">{ref.venue}</span>
                    </>
                  )}
                  {ref.citationCount != null && (
                    <>
                      {(ref.year || ref.venue) && <span aria-hidden>·</span>}
                      <span>{ref.citationCount} citations</span>
                    </>
                  )}
                </div>

                {abstract && (
                  <p className="text-sm text-foreground/80 leading-relaxed pt-1">
                    {abstract}
                  </p>
                )}

                {ref.doi && (
                  <a
                    href={`https://doi.org/${ref.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    doi:{ref.doi}
                  </a>
                )}
                {!ref.doi && ref.url && (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {ref.url}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
