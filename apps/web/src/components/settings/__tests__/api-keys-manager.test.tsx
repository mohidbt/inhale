import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ApiKeysManager } from "../api-keys-manager";

afterEach(() => cleanup());

// Stub fetch so the component doesn't blow up on mount
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ keys: [] }),
}));

describe("ApiKeysManager — Semantic Scholar row", () => {
  it("renders Semantic Scholar option in provider type select", async () => {
    render(<ApiKeysManager />);
    const select = screen.getByLabelText(/provider type/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain("references");
  });

  it("renders Semantic Scholar label text", () => {
    render(<ApiKeysManager />);
    expect(screen.getByText(/semantic scholar/i)).toBeTruthy();
  });
});
