import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DockableSidebar } from "../dockable-sidebar";

function installMemoryStorage() {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => { store.delete(k); },
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
}

describe("DockableSidebar", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("renders children and persists dock change to localStorage", () => {
    render(<DockableSidebar id="test-sb" defaultDock="right"><div>content</div></DockableSidebar>);
    expect(screen.getByText("content")).toBeTruthy();
    const summary = screen.getByRole("button", { name: /dock/i }).closest("summary");
    if (summary) fireEvent.click(summary);
    fireEvent.click(screen.getByRole("menuitem", { name: /bottom/i }));
    expect(localStorage.getItem("dockable-sidebar:test-sb:dock")).toBe("bottom");
  });

  it("restores previously persisted dock from localStorage on mount", () => {
    localStorage.setItem("dockable-sidebar:restore:dock", "left");
    render(<DockableSidebar id="restore"><div>x</div></DockableSidebar>);
    const root = screen.getByText("x").closest(".relative");
    expect(root?.className).toContain("border-r");
  });
});
