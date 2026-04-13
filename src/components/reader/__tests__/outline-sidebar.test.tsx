import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutlineSidebar } from "../outline-sidebar";

describe("OutlineSidebar", () => {
  it("always shows Pages tab; navigates on page click", () => {
    const onNav = vi.fn();
    render(<OutlineSidebar totalPages={5} pdfOutline={null} onNavigate={onNav} />);
    expect(screen.getByRole("tab", { name: /pages/i })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /contents/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^page 3$/i }));
    expect(onNav).toHaveBeenCalledWith(3);
  });

  it("shows Contents tab when pdfOutline is non-empty", () => {
    const outline = [{ title: "Intro", pageIndex: 0, items: [] }];
    render(<OutlineSidebar totalPages={5} pdfOutline={outline} onNavigate={() => {}} />);
    expect(screen.getByRole("tab", { name: /contents/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /contents/i }));
    expect(screen.getByText("Intro")).toBeTruthy();
  });
});
