import { test, expect } from "@playwright/test";
import { signUpAndLogin } from "./helpers/auth";
import path from "path";
import fs from "fs";

const PDF_PATH = path.join(__dirname, "fixtures/test.pdf");

// Upload a PDF via the API and return its document ID.
async function uploadDocument(page: import("@playwright/test").Page): Promise<number> {
  const pdfBytes = fs.readFileSync(PDF_PATH);

  const response = await page.request.post("/api/documents/upload", {
    multipart: {
      file: {
        name: "test.pdf",
        mimeType: "application/pdf",
        buffer: pdfBytes,
      },
    },
  });

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(typeof body.document.id).toBe("number");
  return body.document.id as number;
}

test.describe("Highlights API", () => {
  test("create, list, and delete a highlight", async ({ page }) => {
    await signUpAndLogin(page);
    const docId = await uploadDocument(page);
    const base = `/api/documents/${docId}/highlights`;

    // POST — create highlight
    const createRes = await page.request.post(base, {
      data: {
        pageNumber: 1,
        textContent: "Hello world",
        startOffset: 0,
        endOffset: 11,
        color: "yellow",
        note: "My first highlight",
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.highlight).toBeDefined();
    const highlightId: number = createBody.highlight.id;
    expect(typeof highlightId).toBe("number");
    expect(createBody.highlight.textContent).toBe("Hello world");
    expect(createBody.highlight.color).toBe("yellow");
    expect(createBody.highlight.pageNumber).toBe(1);

    // GET — list should contain the new highlight
    const listRes = await page.request.get(base);
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(Array.isArray(listBody.highlights)).toBe(true);
    const found = listBody.highlights.find((h: { id: number }) => h.id === highlightId);
    expect(found).toBeDefined();
    expect(found.textContent).toBe("Hello world");

    // DELETE — remove the highlight
    const deleteRes = await page.request.delete(`${base}?highlightId=${highlightId}`);
    expect(deleteRes.status()).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.success).toBe(true);

    // GET — highlight should no longer appear
    const listAfterRes = await page.request.get(base);
    expect(listAfterRes.status()).toBe(200);
    const listAfterBody = await listAfterRes.json();
    const stillPresent = listAfterBody.highlights.find((h: { id: number }) => h.id === highlightId);
    expect(stillPresent).toBeUndefined();
  });

  test("defaults color to yellow when an invalid color is supplied", async ({ page }) => {
    await signUpAndLogin(page);
    const docId = await uploadDocument(page);

    const res = await page.request.post(`/api/documents/${docId}/highlights`, {
      data: {
        pageNumber: 1,
        textContent: "Color fallback text",
        startOffset: 0,
        endOffset: 19,
        color: "purple", // not in the valid list
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.highlight.color).toBe("yellow");
  });

  test("returns 422 when required fields are missing", async ({ page }) => {
    await signUpAndLogin(page);
    const docId = await uploadDocument(page);

    // Missing textContent
    const res = await page.request.post(`/api/documents/${docId}/highlights`, {
      data: {
        pageNumber: 1,
        startOffset: 0,
        endOffset: 5,
      },
    });
    expect(res.status()).toBe(422);
  });

  test("returns 401 when not authenticated", async ({ page }) => {
    // Do NOT sign in — attempt request cold
    const res = await page.request.get("/api/documents/1/highlights");
    expect(res.status()).toBe(401);
  });
});

test.describe("Comments API", () => {
  test("create and list a standalone comment", async ({ page }) => {
    await signUpAndLogin(page);
    const docId = await uploadDocument(page);
    const base = `/api/documents/${docId}/comments`;

    // POST — create comment without a highlight link
    const createRes = await page.request.post(base, {
      data: {
        content: "This is a standalone comment",
        pageNumber: 2,
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.comment).toBeDefined();
    const commentId: number = createBody.comment.id;
    expect(typeof commentId).toBe("number");
    expect(createBody.comment.content).toBe("This is a standalone comment");
    expect(createBody.comment.pageNumber).toBe(2);
    expect(createBody.comment.highlightId).toBeNull();

    // GET — list should contain the comment
    const listRes = await page.request.get(base);
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    expect(Array.isArray(listBody.comments)).toBe(true);
    const found = listBody.comments.find((c: { id: number }) => c.id === commentId);
    expect(found).toBeDefined();
    expect(found.content).toBe("This is a standalone comment");
  });

  test("create a comment linked to a highlight", async ({ page }) => {
    await signUpAndLogin(page);
    const docId = await uploadDocument(page);

    // First create a highlight to link to
    const hlRes = await page.request.post(`/api/documents/${docId}/highlights`, {
      data: {
        pageNumber: 1,
        textContent: "Linked highlight text",
        startOffset: 0,
        endOffset: 21,
        color: "green",
      },
    });
    expect(hlRes.status()).toBe(201);
    const hlBody = await hlRes.json();
    const highlightId: number = hlBody.highlight.id;

    // Create a comment referencing that highlight
    const createRes = await page.request.post(`/api/documents/${docId}/comments`, {
      data: {
        content: "Comment on the highlight",
        pageNumber: 1,
        highlightId,
      },
    });
    expect(createRes.status()).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.comment.highlightId).toBe(highlightId);
    expect(createBody.comment.content).toBe("Comment on the highlight");
  });

  test("delete a comment", async ({ page }) => {
    await signUpAndLogin(page);
    const docId = await uploadDocument(page);
    const base = `/api/documents/${docId}/comments`;

    const createRes = await page.request.post(base, {
      data: { content: "Comment to delete", pageNumber: 3 },
    });
    expect(createRes.status()).toBe(201);
    const commentId: number = (await createRes.json()).comment.id;

    // DELETE
    const deleteRes = await page.request.delete(`${base}?commentId=${commentId}`);
    expect(deleteRes.status()).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.success).toBe(true);

    // GET — comment should be gone
    const listRes = await page.request.get(base);
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    const stillPresent = listBody.comments.find((c: { id: number }) => c.id === commentId);
    expect(stillPresent).toBeUndefined();
  });

  test("returns 422 when content is empty", async ({ page }) => {
    await signUpAndLogin(page);
    const docId = await uploadDocument(page);

    const res = await page.request.post(`/api/documents/${docId}/comments`, {
      data: { content: "   ", pageNumber: 1 },
    });
    expect(res.status()).toBe(422);
  });

  test("returns 422 when pageNumber is missing or invalid", async ({ page }) => {
    await signUpAndLogin(page);
    const docId = await uploadDocument(page);

    const missingPage = await page.request.post(`/api/documents/${docId}/comments`, {
      data: { content: "No page" },
    });
    expect(missingPage.status()).toBe(422);

    const zeroPaged = await page.request.post(`/api/documents/${docId}/comments`, {
      data: { content: "Zero page", pageNumber: 0 },
    });
    expect(zeroPaged.status()).toBe(422);
  });

  test("returns 401 when not authenticated", async ({ page }) => {
    const res = await page.request.get("/api/documents/1/comments");
    expect(res.status()).toBe(401);
  });
});

test.describe("Highlights and Comments isolation", () => {
  test("a second user cannot see highlights created by the first user", async ({
    browser,
  }) => {
    // User A
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await signUpAndLogin(pageA);
    const docId = await uploadDocument(pageA);

    const hlRes = await pageA.request.post(`/api/documents/${docId}/highlights`, {
      data: {
        pageNumber: 1,
        textContent: "User A exclusive",
        startOffset: 0,
        endOffset: 16,
        color: "blue",
      },
    });
    expect(hlRes.status()).toBe(201);

    // User B — separate session
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await signUpAndLogin(pageB);

    // User B requests User A's document highlights — document is owned by A so
    // the highlight query will return only B's own highlights (none) because the
    // DB filters by userId. The endpoint itself returns 200 with an empty list
    // rather than 404 because the route only filters highlights by userId, not
    // the document's owner. Either outcome is acceptable; what matters is that
    // User A's highlight is NOT present.
    const listRes = await pageB.request.get(`/api/documents/${docId}/highlights`);
    // Could be 200 (empty) or 404 depending on implementation — both are fine.
    if (listRes.status() === 200) {
      const body = await listRes.json();
      const leaked = (body.highlights ?? []).find(
        (h: { textContent: string }) => h.textContent === "User A exclusive"
      );
      expect(leaked).toBeUndefined();
    } else {
      expect([401, 403, 404]).toContain(listRes.status());
    }

    await ctxA.close();
    await ctxB.close();
  });
});
