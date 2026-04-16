import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchPaperByTitle,
  lookupPaperByDoi,
  lookupPaperById,
  enrichReferences,
} from "../semantic-scholar";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAPER_RESPONSE = {
  paperId: "abc123",
  title: "Attention Is All You Need",
  authors: [{ name: "Ashish Vaswani" }, { name: "Noam Shazeer" }],
  year: 2017,
  externalIds: { DOI: "10.5555/3295222.3295349", ArXiv: "1706.03762" },
  abstract: "The dominant sequence transduction models...",
  venue: "NeurIPS",
  citationCount: 50000,
};

const EXPECTED_METADATA = {
  semanticScholarId: "abc123",
  title: "Attention Is All You Need",
  authors: "Ashish Vaswani, Noam Shazeer",
  year: "2017",
  doi: "10.5555/3295222.3295349",
  url: "https://www.semanticscholar.org/paper/abc123",
  abstract: "The dominant sequence transduction models...",
  venue: "NeurIPS",
  citationCount: 50000,
};

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

// ---------------------------------------------------------------------------
// searchPaperByTitle
// ---------------------------------------------------------------------------

describe("searchPaperByTitle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns PaperMetadata on successful search", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { data: [PAPER_RESPONSE] }));
    const result = await searchPaperByTitle("Attention Is All You Need");
    expect(result).toEqual(EXPECTED_METADATA);
  });

  it("encodes the title in the query string", async () => {
    const fetchMock = mockFetch(200, { data: [PAPER_RESPONSE] });
    vi.stubGlobal("fetch", fetchMock);
    await searchPaperByTitle("Attention Is All You Need");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("query=Attention+Is+All+You+Need");
  });

  it("returns null when data array is empty", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { data: [] }));
    const result = await searchPaperByTitle("Unknown Paper");
    expect(result).toBeNull();
  });

  it("returns null on 404", async () => {
    vi.stubGlobal("fetch", mockFetch(404, {}));
    const result = await searchPaperByTitle("Missing Paper");
    expect(result).toBeNull();
  });

  it("handles null/empty title gracefully", async () => {
    const result = await searchPaperByTitle("");
    expect(result).toBeNull();
  });

  it("retries once on 429 and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [PAPER_RESPONSE] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const promise = searchPaperByTitle("Attention Is All You Need");
    // Advance past the retry delay (5000ms)
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(EXPECTED_METADATA);
  });

  it("returns null when 429 persists after retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = searchPaperByTitle("Some Paper");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("maps authors array to comma-separated string", async () => {
    const paper = {
      ...PAPER_RESPONSE,
      authors: [{ name: "A" }, { name: "B" }, { name: "C" }],
    };
    vi.stubGlobal("fetch", mockFetch(200, { data: [paper] }));
    const result = await searchPaperByTitle("Multi-author paper");
    expect(result?.authors).toBe("A, B, C");
  });

  it("handles missing optional fields (null year, no DOI)", async () => {
    const paper = {
      paperId: "xyz789",
      title: "Minimal Paper",
      authors: [],
      year: null,
      externalIds: {},
      abstract: null,
      venue: null,
      citationCount: null,
    };
    vi.stubGlobal("fetch", mockFetch(200, { data: [paper] }));
    const result = await searchPaperByTitle("Minimal Paper");
    expect(result).toEqual({
      semanticScholarId: "xyz789",
      title: "Minimal Paper",
      authors: "",
      year: null,
      doi: null,
      url: "https://www.semanticscholar.org/paper/xyz789",
      abstract: null,
      venue: null,
      citationCount: null,
    });
  });
});

// ---------------------------------------------------------------------------
// lookupPaperByDoi
// ---------------------------------------------------------------------------

describe("lookupPaperByDoi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns PaperMetadata on success", async () => {
    vi.stubGlobal("fetch", mockFetch(200, PAPER_RESPONSE));
    const result = await lookupPaperByDoi("10.5555/3295222.3295349");
    expect(result).toEqual(EXPECTED_METADATA);
  });

  it("encodes DOI in the URL path", async () => {
    const fetchMock = mockFetch(200, PAPER_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);
    await lookupPaperByDoi("10.1000/xyz 123");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("DOI%3A10.1000%2Fxyz%20123");
  });

  it("returns null on 404", async () => {
    vi.stubGlobal("fetch", mockFetch(404, {}));
    const result = await lookupPaperByDoi("10.9999/nonexistent");
    expect(result).toBeNull();
  });

  it("handles null/empty DOI gracefully", async () => {
    const result = await lookupPaperByDoi("");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// lookupPaperById
// ---------------------------------------------------------------------------

describe("lookupPaperById", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns PaperMetadata on success", async () => {
    vi.stubGlobal("fetch", mockFetch(200, PAPER_RESPONSE));
    const result = await lookupPaperById("abc123");
    expect(result).toEqual(EXPECTED_METADATA);
  });

  it("includes the paper ID in the URL", async () => {
    const fetchMock = mockFetch(200, PAPER_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);
    await lookupPaperById("abc123");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/paper/abc123");
  });

  it("returns null on 404", async () => {
    vi.stubGlobal("fetch", mockFetch(404, {}));
    const result = await lookupPaperById("nonexistent");
    expect(result).toBeNull();
  });

  it("handles null/empty ID gracefully", async () => {
    const result = await lookupPaperById("");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// enrichReferences
// ---------------------------------------------------------------------------

describe("enrichReferences", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("prefers DOI lookup over title search when DOI is present", async () => {
    const fetchMock = mockFetch(200, PAPER_RESPONSE);
    vi.stubGlobal("fetch", fetchMock);

    const refs = [{ id: 1, title: "Some Title", doi: "10.5555/3295222.3295349" }];
    const promise = enrichReferences(refs);
    await vi.runAllTimersAsync();
    const result = await promise;

    // Should use DOI endpoint (contains "DOI%3A" in URL), not search endpoint
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("DOI%3A");
    expect(result.get(1)).toEqual(EXPECTED_METADATA);
  });

  it("falls back to title search when no DOI", async () => {
    const fetchMock = mockFetch(200, { data: [PAPER_RESPONSE] });
    vi.stubGlobal("fetch", fetchMock);

    const refs = [{ id: 2, title: "Attention Is All You Need", doi: null }];
    const promise = enrichReferences(refs);
    await vi.runAllTimersAsync();
    const result = await promise;

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("paper/search");
    expect(result.get(2)).toEqual(EXPECTED_METADATA);
  });

  it("skips refs with no title and no DOI", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const refs = [{ id: 3, title: null, doi: null }];
    const promise = enrichReferences(refs);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("returns an empty map for an empty refs array", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const promise = enrichReferences([]);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("skips refs where fetch returns null and continues with others", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: [PAPER_RESPONSE] }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const refs = [
      { id: 10, title: "Not Found Paper", doi: null },
      { id: 11, title: "Attention Is All You Need", doi: null },
    ];
    const promise = enrichReferences(refs);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.has(10)).toBe(false);
    expect(result.has(11)).toBe(true);
  });

  it("processes multiple refs with delays between them", async () => {
    const fetchMock = mockFetch(200, { data: [PAPER_RESPONSE] });
    vi.stubGlobal("fetch", fetchMock);

    const refs = [
      { id: 1, title: "Paper A", doi: null },
      { id: 2, title: "Paper B", doi: null },
      { id: 3, title: "Paper C", doi: null },
    ];
    const promise = enrichReferences(refs);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.size).toBe(3);
  });
});
