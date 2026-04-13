import { test, expect } from "@playwright/test";
import { signUpAndLogin } from "./helpers/auth";
import * as fs from "fs";
import * as path from "path";

const pdfPath = path.join(__dirname, "fixtures/test.pdf");

async function uploadTestPdf(page: Parameters<typeof signUpAndLogin>[0]) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const response = await page.request.post("/api/documents/upload", {
    multipart: {
      file: { name: "test.pdf", mimeType: "application/pdf", buffer: pdfBuffer },
    },
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return body.document as { id: number };
}

test("chat history drawer lists conversations and loads messages", async ({ page }) => {
  await signUpAndLogin(page);
  const { id: docId } = await uploadTestPdf(page);

  await page.route(`**/api/documents/${docId}/conversations`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversations: [
          {
            id: 101,
            title: "What is the main finding?",
            createdAt: new Date("2026-04-10T10:00:00Z").toISOString(),
            updatedAt: new Date("2026-04-10T10:00:00Z").toISOString(),
          },
          {
            id: 102,
            title: null,
            createdAt: new Date("2026-04-11T10:00:00Z").toISOString(),
            updatedAt: new Date("2026-04-11T10:00:00Z").toISOString(),
          },
        ],
      }),
    });
  });

  await page.route("**/api/conversations/101/messages", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { id: 1, role: "user", content: "What is the main finding?", createdAt: "2026-04-10T10:00:00Z" },
          { id: 2, role: "assistant", content: "The main finding is X.", createdAt: "2026-04-10T10:00:01Z" },
        ],
      }),
    });
  });

  await page.goto(`/reader/${docId}`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Chat" }).click();
  await expect(page.getByText("AI Assistant")).toBeVisible();

  await page.getByRole("button", { name: "Conversation history" }).click();
  await expect(page.getByText("What is the main finding?")).toBeVisible();
  await expect(page.getByText("Conversation #102")).toBeVisible();

  await page.getByText("What is the main finding?").first().click();
  await expect(page.getByText("The main finding is X.")).toBeVisible();
});

test("New conversation resets the thread", async ({ page }) => {
  await signUpAndLogin(page);
  const { id: docId } = await uploadTestPdf(page);

  await page.route("**/api/documents/*/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body:
        'data: {"type":"sources","sources":[{"page":1}],"conversationId":1}\n\n' +
        'data: {"type":"token","content":"Hello."}\n\ndata: [DONE]\n\n',
    });
  });

  await page.goto(`/reader/${docId}`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Chat" }).click();
  await page.getByPlaceholder("Ask about this paper...").fill("Hi");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Hello.")).toBeVisible({ timeout: 8_000 });

  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByText("Hello.")).toBeHidden();
  await expect(page.getByText("Ask a question about this paper")).toBeVisible();
});
