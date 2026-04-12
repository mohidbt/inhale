const BASE_URL = "https://api.semanticscholar.org/graph/v1/paper";
const FIELDS = "paperId,title,authors,year,externalIds,abstract,venue,citationCount";
const RETRY_DELAY_MS = 5_000;
const ENRICH_DELAY_MS = 200;

export interface PaperMetadata {
  semanticScholarId: string;
  title: string;
  authors: string; // comma-separated
  year: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  venue: string | null;
  citationCount: number | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawPaper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  year: number | null;
  externalIds: Record<string, string>;
  abstract: string | null;
  venue: string | null;
  citationCount: number | null;
}

function mapPaper(raw: RawPaper): PaperMetadata {
  return {
    semanticScholarId: raw.paperId,
    title: raw.title,
    authors: (raw.authors ?? []).map((a) => a.name).join(", "),
    year: raw.year != null ? String(raw.year) : null,
    doi: raw.externalIds?.DOI ?? null,
    url: `https://www.semanticscholar.org/paper/${raw.paperId}`,
    abstract: raw.abstract ?? null,
    venue: raw.venue ?? null,
    citationCount: raw.citationCount ?? null,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<RawPaper | null> {
  let response = await fetch(url);

  if (response.status === 429) {
    await delay(RETRY_DELAY_MS);
    response = await fetch(url);
  }

  if (response.status === 404) return null;
  if (!response.ok) return null;

  const data = await response.json();
  return data as RawPaper;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search Semantic Scholar by paper title. Returns the best match or null.
 */
export async function searchPaperByTitle(title: string): Promise<PaperMetadata | null> {
  if (!title) return null;

  const encoded = encodeURIComponent(title).replace(/%20/g, "+");
  const url = `${BASE_URL}/search?query=${encoded}&limit=1&fields=${FIELDS}`;

  let response = await fetch(url);

  if (response.status === 429) {
    await delay(RETRY_DELAY_MS);
    response = await fetch(url);
  }

  if (response.status === 404) return null;
  if (!response.ok) return null;

  const data = (await response.json()) as { data: RawPaper[] };
  if (!data.data || data.data.length === 0) return null;

  return mapPaper(data.data[0]);
}

/**
 * Look up a paper by DOI. Returns the paper or null.
 */
export async function lookupPaperByDoi(doi: string): Promise<PaperMetadata | null> {
  if (!doi) return null;

  const encoded = encodeURIComponent(`DOI:${doi}`);
  const url = `${BASE_URL}/${encoded}?fields=${FIELDS}`;

  const raw = await fetchWithRetry(url);
  return raw ? mapPaper(raw) : null;
}

/**
 * Look up a paper by Semantic Scholar paper ID. Returns the paper or null.
 */
export async function lookupPaperById(paperId: string): Promise<PaperMetadata | null> {
  if (!paperId) return null;

  const url = `${BASE_URL}/${paperId}?fields=${FIELDS}`;

  const raw = await fetchWithRetry(url);
  return raw ? mapPaper(raw) : null;
}

/**
 * Enrich a batch of references. Tries DOI lookup first (more precise),
 * falls back to title search. Adds a small delay between requests to
 * respect the Semantic Scholar rate limit (~100 req / 5 min).
 */
export async function enrichReferences(
  refs: Array<{ id: number; title?: string | null; doi?: string | null }>
): Promise<Map<number, PaperMetadata>> {
  const result = new Map<number, PaperMetadata>();

  for (const ref of refs) {
    const hasDoi = ref.doi && ref.doi.trim() !== "";
    const hasTitle = ref.title && ref.title.trim() !== "";

    if (!hasDoi && !hasTitle) continue;

    let metadata: PaperMetadata | null = null;

    if (hasDoi) {
      metadata = await lookupPaperByDoi(ref.doi!);
    }

    if (!metadata && hasTitle) {
      metadata = await searchPaperByTitle(ref.title!);
    }

    if (metadata) {
      result.set(ref.id, metadata);
    }

    // Delay between requests to stay within rate limits
    await delay(ENRICH_DELAY_MS);
  }

  return result;
}
