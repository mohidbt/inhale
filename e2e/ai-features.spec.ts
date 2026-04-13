import { test, expect } from "@playwright/test";
import { signUpAndLogin } from "./helpers/auth";
import * as fs from "fs";
import * as path from "path";

const pdfPath = path.join(__dirname, "fixtures/test.pdf");

interface TestDocument {
  id: number;
  processingStatus: string;
}

async function uploadTestPdf(
  page: Parameters<typeof signUpAndLogin>[0]
): Promise<TestDocument> {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const response = await page.request.post("/api/documents/upload", {
    multipart: {
      file: {
        name: "test.pdf",
        mimeType: "application/pdf",
        buffer: pdfBuffer,
      },
    },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return body.document as TestDocument;
}

test("upload sets processingStatus to ready or failed", async ({ page }) => {
  await signUpAndLogin(page);
  const doc = await uploadTestPdf(page);

  expect(typeof doc.id).toBe("number");
  expect(doc.id).toBeGreaterThan(0);
  expect(doc.processingStatus).toBe("ready");
});

test("outline sidebar fetches and displays document sections", async ({ page }) => {
  await signUpAndLogin(page);
  const { id: docId } = await uploadTestPdf(page);

  await page.route("**/api/documents/*/outline", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: [
          {
            id: 1,
            sectionIndex: 0,
            title: "Introduction",
            pageStart: 1,
            pageEnd: 2,
            content: "Overview of the paper.",
          },
        ],
      }),
    });
  });

  await page.goto(`/reader/${docId}`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Outline" }).click();
  const outlineSidebar = page.getByTestId("outline-sidebar");
  await expect(outlineSidebar.getByRole("heading", { name: "Outline" })).toBeVisible();
  await expect(outlineSidebar.getByText("Introduction")).toBeVisible();
  await expect(outlineSidebar.getByText("Page 1")).toBeVisible();
});

test("chat panel sends question and streams answer with source badges", async ({ page }) => {
  await signUpAndLogin(page);
  const { id: docId } = await uploadTestPdf(page);

  await page.route("**/api/documents/*/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
      body: 'data: {"type":"sources","sources":[{"page":1,"content":"context text"}],"conversationId":1}\n\ndata: {"type":"token","content":"The answer is 42."}\n\ndata: [DONE]\n\n',
    });
  });

  await page.goto(`/reader/${docId}`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Chat" }).click();
  await expect(page.getByText("AI Assistant")).toBeVisible();

  await page.getByPlaceholder("Ask about this paper...").fill("What is this about?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("The answer is 42.")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText("p.1")).toBeVisible();
});
