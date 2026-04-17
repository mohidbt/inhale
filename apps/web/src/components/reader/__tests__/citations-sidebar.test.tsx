import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { CitationsSidebar } from "../citations-sidebar";
import type { CitationWithStatus } from "../citation-card";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock CitationCard to make assertions easy
vi.mock("../citation-card", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../citation-card")>();
  return {
    ...actual,
    CitationCard: ({ citation, variant }: { citation: CitationWithStatus; variant?: string }) => (
      <div data-testid="citation-card" data-variant={variant} data-citation-id={citation.id} />
    ),
  };
});

// Mock sonner toast
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCitation(overrides: Partial<CitationWithStatus> = {}): CitationWithStatus {
  return {
    id: 1,
    documentId: 1,
    markerText: "[1]",
    markerIndex: 1,
    rawText: null,
    title: "Test Paper",
    authors: null,
    year: null,
    doi: null,
    url: null,
    semanticScholarId: "s2id-123",
    abstract: null,
    venue: null,
    citationCount: null,
    pageNumber: null,
    createdAt: new Date(),
    influentialCitationCount: null,
    openAccessPdfUrl: null,
    tldrText: null,
    externalIds: null,
    bibtex: null,
    isOpenAccess: null,
    keptId: null,
    libraryReferenceId: null,
    ...overrides,
  };
}

const DOCUMENT_ID = 42;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ enriched: 1, total: 1 }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CitationsSidebar — compact CitationCard rendering", () => {
  it("renders CitationCard with variant=compact for each citation", () => {
    const citations = [
      makeCitation({ id: 1 }),
      makeCitation({ id: 2, markerIndex: 2 }),
    ];
    render(
      <CitationsSidebar
        documentId={DOCUMENT_ID}
        open={true}
        citations={citations}
        loading={false}
      />
    );
    const cards = screen.getAllByTestId("citation-card");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.getAttribute("data-variant")).toBe("compact");
    }
  });

  it("does not render citation cards when loading", () => {
    render(
      <CitationsSidebar
        documentId={DOCUMENT_ID}
        open={true}
        citations={[makeCitation()]}
        loading={true}
      />
    );
    expect(screen.queryAllByTestId("citation-card")).toHaveLength(0);
  });
});

describe("CitationsSidebar — auto-enrich", () => {
  it("POSTs to enrich when any ref lacks semanticScholarId", async () => {
    const citations = [
      makeCitation({ id: 1, semanticScholarId: "exists" }),
      makeCitation({ id: 2, semanticScholarId: null }),
    ];
    render(
      <CitationsSidebar
        documentId={DOCUMENT_ID}
        open={true}
        citations={citations}
        loading={false}
      />
    );
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/documents/${DOCUMENT_ID}/citations/enrich`,
        { method: "POST" }
      );
    });
  });

  it("does NOT POST when all refs have semanticScholarId", async () => {
    const citations = [
      makeCitation({ id: 1, semanticScholarId: "s2id-1" }),
      makeCitation({ id: 2, semanticScholarId: "s2id-2" }),
    ];
    render(
      <CitationsSidebar
        documentId={DOCUMENT_ID}
        open={true}
        citations={citations}
        loading={false}
      />
    );
    // Wait a tick to confirm no fetch fires
    await new Promise((r) => setTimeout(r, 50));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does NOT POST when citations list is empty", async () => {
    render(
      <CitationsSidebar
        documentId={DOCUMENT_ID}
        open={true}
        citations={[]}
        loading={false}
      />
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls onExtracted on successful enrich", async () => {
    const onExtracted = vi.fn();
    const citations = [makeCitation({ semanticScholarId: null })];
    render(
      <CitationsSidebar
        documentId={DOCUMENT_ID}
        open={true}
        citations={citations}
        loading={false}
        onExtracted={onExtracted}
      />
    );
    await waitFor(() => expect(onExtracted).toHaveBeenCalledTimes(1));
  });

  it("does NOT fire enrich a second time on re-render", async () => {
    const citations = [makeCitation({ semanticScholarId: null })];
    const { rerender } = render(
      <CitationsSidebar
        documentId={DOCUMENT_ID}
        open={true}
        citations={citations}
        loading={false}
      />
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // Re-render with same citations
    rerender(
      <CitationsSidebar
        documentId={DOCUMENT_ID}
        open={true}
        citations={citations}
        loading={false}
      />
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("shows enriching indicator while in flight, hides when done", async () => {
    // Use a slow fetch to observe the loading state
    let resolveEnrich!: () => void;
    const slowFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveEnrich = () =>
            resolve({
              ok: true,
              json: async () => ({ enriched: 1, total: 1 }),
            } as Response);
        })
    );
    global.fetch = slowFetch;

    const citations = [makeCitation({ semanticScholarId: null })];
    render(
      <CitationsSidebar
        documentId={DOCUMENT_ID}
        open={true}
        citations={citations}
        loading={false}
      />
    );

    await waitFor(() =>
      expect(screen.queryByText(/enriching/i)).not.toBeNull()
    );

    resolveEnrich();

    await waitFor(() =>
      expect(screen.queryByText(/enriching/i)).toBeNull()
    );
  });

  it("does not crash on fetch error; does not show enriching indicator after error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network fail"));
    const citations = [makeCitation({ semanticScholarId: null })];
    render(
      <CitationsSidebar
        documentId={DOCUMENT_ID}
        open={true}
        citations={citations}
        loading={false}
      />
    );
    await waitFor(() =>
      expect(screen.queryByText(/enriching/i)).toBeNull()
    );
  });
});
