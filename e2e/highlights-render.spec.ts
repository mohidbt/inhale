import { test, expect, Page } from "@playwright/test";
import { signUpAndLogin } from "./helpers/auth";
import * as fs from "fs";
import * as path from "path";

const PDF_PATH = path.join(__dirname, "fixtures/test_real_paper.pdf");

async function uploadTestPdf(page: Page, filename: string): Promise<{ id: number }> {
  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const response = await page.request.post("/api/documents/upload", {
    multipart: {
      file: {
        name: filename,
        mimeType: "application/pdf",
        buffer: pdfBuffer,
      },
    },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return { id: body.document.id as number };
}

test("saving a highlight renders a colored overlay on the PDF", async ({ page }) => {
  await signUpAndLogin(page);
  const { id } = await uploadTestPdf(page, "test_real_paper.pdf");
  await page.goto(`/reader/${id}`);

  // Wait for the first page canvas to render
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10_000 });

  // Wait until the text layer has rendered spans (react-pdf renders text
  // asynchronously after the canvas) AND the page element has its natural
  // size attributes populated — those are needed to compute rects for the
  // highlight overlay.
  await page.waitForFunction(
    () => {
      const pageEl = document.querySelector<HTMLElement>(
        '[data-page-number="1"][data-natural-width]'
      );
      if (!pageEl) return false;
      const w = Number(pageEl.getAttribute("data-natural-width"));
      if (!Number.isFinite(w) || w <= 0) return false;
      return document.querySelectorAll(".react-pdf__Page__textContent span").length > 0;
    },
    undefined,
    { timeout: 10_000 }
  );

  // Select a word on page 1 via DOM Range. Pick a span that is well inside
  // the viewport so the floating selection toolbar isn't clipped off-screen.
  await page.evaluate(() => {
    const spans = Array.from(
      document.querySelectorAll<HTMLElement>(".react-pdf__Page__textContent span")
    );
    const viewportH = window.innerHeight;
    const candidate =
      spans.find((s) => {
        const r = s.getBoundingClientRect();
        return r.top > 120 && r.bottom < viewportH - 40 && s.textContent?.trim();
      }) ?? spans[Math.floor(spans.length / 2)];
    if (!candidate) throw new Error("no text span");
    const r = document.createRange();
    r.selectNodeContents(candidate);
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
    document.dispatchEvent(new Event("selectionchange"));
  });

  // Wait for the floating selection toolbar to appear, then click yellow.
  await expect(page.getByTitle("yellow")).toBeVisible({ timeout: 5_000 });
  await page.getByTitle("yellow").click();

  // A highlight rectangle should appear on the canvas overlay.
  await expect(page.locator("[data-highlight-id]").first()).toBeVisible({ timeout: 10_000 });

  // Reload: highlight must persist and re-render from the lifted fetch.
  await page.reload();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-highlight-id]").first()).toBeVisible({ timeout: 10_000 });
});
