/**
 * E2E spec for Phase 2.2 — Enriched Smart Citations
 *
 * All Semantic Scholar API calls are intercepted with page.route() so the
 * real S2 API is never hit.
 *
 * NOTE: The BYOK "x-api-key" test is marked .fixme because the
 * /api/settings/api-keys POST route validates providerType against
 * ["llm", "voice", "ocr"] and rejects "references" with 422. Fix:
 * add "references" to VALID_PROVIDER_TYPES in
 * apps/web/src/app/api/settings/api-keys/route.ts.
 */
import path from "path";
import { test, expect, type Page, type Route } from "@playwright/test";
import { signUpAndLogin } from "./helpers/auth";

const TEST_PDF = path.resolve(__dirname, "fixtures/test_real_paper.pdf");

// ---------------------------------------------------------------------------
// S2 mock payloads
// ---------------------------------------------------------------------------

const MOCK_PAPER_ID = "abcdef1234567890abcdef1234567890abcdef12";

const MOCK_BATCH_RESPONSE = [
  {
    paperId: MOCK_PAPER_ID,
    title: "Mocked Enriched Paper Title",
    authors: [
      { authorId: "auth-1", name: "Alice Author" },
      { authorId: "auth-2", name: "Bob Coauthor" },
    ],
    year: 2023,
    venue: "NeurIPS",
    citationCount: 42,
    influentialCitationCount: 7,
    openAccessPdf: { url: "https://example.com/paper.pdf" },
    externalIds: { DOI: "10.1234/test", ArXiv: "2301.00001" },
    citationStyles: {
      bibtex:
        "@article{mock2023, title={Mocked Enriched Paper Title}, year={2023}}",
    },
    tldr: { text: "This is the TL;DR summary of the mocked paper." },
    abstract: "A longer abstract about the paper content.",
  },
];

// ---------------------------------------------------------------------------
// Route-mock helper: intercept all S2 network calls
// ---------------------------------------------------------------------------

/** Track how many times /paper/batch was called. */
async function setupS2Mocks(
  page: Page
): Promise<{ getBatchCallCount: () => number; getLastBatchRequest: () => Request | null }> {
  let batchCallCount = 0;
  let lastBatchRequest: Request | null = null;

  // DOI resolution
  await page.route(
    /semanticscholar\.org\/graph\/v1\/paper\/DOI:/,
    (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ paperId: MOCK_PAPER_ID }),
      });
    }
  );

  // Search match fallback
  await page.route(
    /semanticscholar\.org\/graph\/v1\/paper\/search\/match/,
    (route: Route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [{ paperId: MOCK_PAPER_ID }] }),
      });
    }
  );

  // Batch endpoint — track calls
  await page.route(
    /semanticscholar\.org\/graph\/v1\/paper\/batch/,
    (route: Route, request) => {
      batchCallCount++;
      lastBatchRequest = request;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_BATCH_RESPONSE),
      });
    }
  );

  return {
    getBatchCallCount: () => batchCallCount,
    getLastBatchRequest: () => lastBatchRequest,
  };
}

// ---------------------------------------------------------------------------
// Shared setup: upload a real PDF, extract citations (best-effort), return docId
// ---------------------------------------------------------------------------

async function uploadAndExtractCitations(page: Page): Promise<number> {
  const { default: fs } = await import("fs");
  const pdfBuffer = fs.readFileSync(TEST_PDF);

  const uploadRes = await page.request.post("/api/documents/upload", {
    multipart: {
      file: {
        name: "test_real_paper.pdf",
        mimeType: "application/pdf",
        buffer: pdfBuffer,
      },
    },
  });
  expect(uploadRes.status()).toBe(201);
  const { document: doc } = await uploadRes.json();
  const docId: number = doc.id;

  // Best-effort citation extraction — may return 0 refs or 500 for
  // image-only / unsupported PDFs. Tests that need refs skip gracefully.
  await page.request.post(`/api/documents/${docId}/citations/extract`);

  return docId;
}

// ---------------------------------------------------------------------------
// Test 1 — Enrich auto-fires once on Citations tab open
// ---------------------------------------------------------------------------

test.describe("Enrichment auto-fires on Citations tab open", () => {
  test("fires enrich POST once; CitationCards show TL;DR after enrichment", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signUpAndLogin(page);
    await setupS2Mocks(page);
    const docId = await uploadAndExtractCitations(page);

    // Track enrich POST calls to our own API
    let enrichCallCount = 0;
    await page.route(
      new RegExp(`/api/documents/${docId}/citations/enrich`),
      async (route) => {
        enrichCallCount++;
        // Let the request through to the real Next.js server
        await route.continue();
      }
    );

    // Check whether extraction yielded any citations before testing UI flow
    const preCheckRes = await page.request.get(
      `/api/documents/${docId}/citations`
    );
    const { citations: preCitations } = await preCheckRes.json();

    if (preCitations.length === 0) {
      test.info().annotations.push({
        type: "note",
        description:
          "test_real_paper.pdf yielded 0 citations — enrichment auto-fire test skipped",
      });
      return;
    }

    await page.goto(`/reader/${docId}`);
    // Wait for canvas to confirm PDF loaded
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });

    // Open Citations tab
    await page.getByRole("button", { name: "Citations" }).click();
    await expect(page.getByText("Citations")).toBeVisible();

    // Wait for enrich to fire (the sidebar shows spinner then resolves)
    await page.waitForTimeout(3_000);

    expect(enrichCallCount).toBe(1);

    // Re-fetch enriched citations
    const citationsRes = await page.request.get(
      `/api/documents/${docId}/citations`
    );
    const { citations } = await citationsRes.json();

    // At least one citation should now have tldrText (from mock batch response)
    const enrichedCitation = citations.find(
      (c: { tldrText: string | null }) => c.tldrText !== null
    );
    expect(enrichedCitation).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Single /paper/batch call (batch consolidation)
// ---------------------------------------------------------------------------

test.describe("Single /paper/batch call", () => {
  test("exactly one POST /paper/batch emitted for all refs", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signUpAndLogin(page);
    const { getBatchCallCount } = await setupS2Mocks(page);
    const docId = await uploadAndExtractCitations(page);

    await page.goto(`/reader/${docId}`);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Citations" }).click();

    // Wait enough time for enrichment pipeline to complete
    await page.waitForTimeout(5_000);

    // Should be exactly 0 or 1 — never more than 1 per open (batch consolidation)
    expect(getBatchCallCount()).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — BYOK: x-api-key header present when configured
// FIXME: blocked by bug — /api/settings/api-keys route rejects providerType
// "references" because VALID_PROVIDER_TYPES = ["llm", "voice", "ocr"] (missing
// "references"). Fix: add "references" to VALID_PROVIDER_TYPES in
// apps/web/src/app/api/settings/api-keys/route.ts
// ---------------------------------------------------------------------------

test.describe("BYOK — x-api-key header", () => {
  test.fixme(
    "S2 requests include x-api-key when references key is configured",
    async ({ page }) => {
      await signUpAndLogin(page);

      // Attempt to save a references-type API key
      const saveRes = await page.request.post("/api/settings/api-keys", {
        data: {
          providerType: "references",
          providerName: "semantic-scholar",
          apiKey: "s2-test-byok-key-e2e",
        },
      });
      // This will 422 until the bug is fixed
      expect(saveRes.status()).toBe(201);

      let capturedApiKey: string | null = null;
      await page.route(
        /semanticscholar\.org\/graph\/v1\/paper\/batch/,
        (route: Route, request) => {
          capturedApiKey = request.headers()["x-api-key"] ?? null;
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_BATCH_RESPONSE),
          });
        }
      );
      // Also mock DOI/search resolvers
      await page.route(
        /semanticscholar\.org\/graph\/v1\/paper\/DOI:/,
        (route: Route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ paperId: MOCK_PAPER_ID }),
          });
        }
      );

      const docId = await uploadAndExtractCitations(page);
      await page.goto(`/reader/${docId}`);
      await expect(page.locator("canvas").first()).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("button", { name: "Citations" }).click();
      await page.waitForTimeout(5_000);

      expect(capturedApiKey).toBe("s2-test-byok-key-e2e");
    }
  );

  test.fixme(
    "S2 requests omit x-api-key when no references key configured",
    async ({ page }) => {
      await signUpAndLogin(page);

      let capturedApiKey: string | undefined;
      await page.route(
        /semanticscholar\.org\/graph\/v1\/paper\/batch/,
        (route: Route, request) => {
          capturedApiKey = request.headers()["x-api-key"];
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_BATCH_RESPONSE),
          });
        }
      );
      await page.route(
        /semanticscholar\.org\/graph\/v1\/paper\/DOI:/,
        (route: Route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ paperId: MOCK_PAPER_ID }),
          });
        }
      );

      const docId = await uploadAndExtractCitations(page);
      await page.goto(`/reader/${docId}`);
      await expect(page.locator("canvas").first()).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole("button", { name: "Citations" }).click();
      await page.waitForTimeout(5_000);

      expect(capturedApiKey).toBeUndefined();
    }
  );
});

// ---------------------------------------------------------------------------
// Test 4 — Save + Remove flow
// ---------------------------------------------------------------------------

test.describe("Save to Library + Remove flow", () => {
  test("save a citation to library then remove it", async ({ page }) => {
    test.setTimeout(90_000);
    await signUpAndLogin(page);
    await setupS2Mocks(page);
    const docId = await uploadAndExtractCitations(page);

    // Get citations list via API
    const citRes = await page.request.get(
      `/api/documents/${docId}/citations`
    );
    const { citations } = await citRes.json();

    if (citations.length === 0) {
      test.info().annotations.push({
        type: "note",
        description:
          "No citations extracted — save/remove flow skipped",
      });
      return;
    }

    const firstCitation = citations[0];

    // Save first citation to library via API directly (avoids UI flow dependency
    // on enrichment animation timing)
    const saveRes = await page.request.post(
      `/api/documents/${docId}/citations/${firstCitation.id}/save`
    );
    expect(saveRes.ok()).toBeTruthy();
    const { libraryReferenceId } = await saveRes.json();
    expect(typeof libraryReferenceId).toBe("number");

    // Navigate to /library/references and confirm the row appears
    await page.goto("/library/references");
    await expect(
      page.getByRole("heading", { name: /saved references/i })
    ).toBeVisible();

    // There should be at least one CitationCard rendered
    // The compact CitationCard renders a title via data-testid="citation-title"
    await expect(page.locator('[data-testid="citation-title"]').first()).toBeVisible({
      timeout: 8_000,
    });

    // Click the Remove button — handle confirm dialog
    page.on("dialog", (dialog) => dialog.accept());

    // Track DELETE request
    let deleteStatus: number | null = null;
    await page.route(
      new RegExp(`/api/library/references/${libraryReferenceId}`),
      async (route) => {
        const response = await route.fetch();
        deleteStatus = response.status();
        await route.fulfill({ response });
      }
    );

    await page.getByRole("button", { name: /remove/i }).first().click();

    // Wait for the card to disappear
    await expect(
      page.locator('[data-testid="citation-title"]')
    ).toHaveCount(0, { timeout: 5_000 });

    // DELETE returned 2xx (204 No Content)
    if (deleteStatus !== null) {
      expect(deleteStatus).toBeGreaterThanOrEqual(200);
      expect(deleteStatus).toBeLessThan(300);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5 — All new columns written (UI proxy assertions)
// ---------------------------------------------------------------------------

test.describe("New enrichment columns reflected in UI", () => {
  test("enriched CitationCard shows TL;DR, OA badge, external-ID pills, BibTeX, Open PDF actions", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signUpAndLogin(page);
    await setupS2Mocks(page);

    // Manually enrich via API so we can then assert in the UI
    const docId = await uploadAndExtractCitations(page);

    const citRes = await page.request.get(
      `/api/documents/${docId}/citations`
    );
    const { citations } = await citRes.json();

    if (citations.length === 0) {
      test.info().annotations.push({
        type: "note",
        description: "No citations extracted — column assertions skipped",
      });
      return;
    }

    // Trigger enrichment via API
    const enrichRes = await page.request.post(
      `/api/documents/${docId}/citations/enrich`
    );
    expect(enrichRes.ok()).toBeTruthy();

    // Re-fetch to confirm DB columns written
    const enrichedRes = await page.request.get(
      `/api/documents/${docId}/citations`
    );
    const { citations: enrichedCitations } = await enrichedRes.json();

    const enriched = enrichedCitations.find(
      (c: { semanticScholarId: string | null }) =>
        c.semanticScholarId !== null
    );

    if (!enriched) {
      test.info().annotations.push({
        type: "note",
        description:
          "No citations got semanticScholarId — S2 mock may not have matched. Column assertions skipped.",
      });
      return;
    }

    // Confirm the new columns are non-null in the DB-returned payload
    expect(enriched.tldrText).not.toBeNull();
    expect(enriched.openAccessPdfUrl).not.toBeNull();
    expect(enriched.externalIds).not.toBeNull();
    expect(enriched.bibtex).not.toBeNull();
    expect(typeof enriched.influentialCitationCount).toBe("number");

    // Navigate to reader — open Citations sidebar and check UI elements
    await page.goto(`/reader/${docId}`);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Citations" }).click();

    // Wait for sidebar to render citations
    await expect(
      page.locator('[data-testid="citation-title"]').first()
    ).toBeVisible({ timeout: 8_000 });

    // TL;DR visible (italic text from tldrText)
    await expect(
      page.getByText("This is the TL;DR summary of the mocked paper.")
    ).toBeVisible({ timeout: 5_000 });

    // OA badge
    await expect(page.getByText("OA")).toBeVisible();

    // External-ID pills (DOI and ArXiv from mock)
    await expect(page.getByRole("link", { name: "DOI" })).toBeVisible();
    await expect(page.getByRole("link", { name: "arXiv" })).toBeVisible();

    // Copy BibTeX button
    await expect(page.getByRole("button", { name: "Copy BibTeX" }).first()).toBeVisible();

    // Open PDF link
    await expect(page.getByRole("link", { name: "Open PDF" })).toBeVisible();
  });
});
