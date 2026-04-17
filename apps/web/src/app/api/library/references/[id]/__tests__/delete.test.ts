import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
const deleteWhere = vi.fn();
vi.mock("@/db", () => ({
  db: {
    delete: vi.fn(() => ({ where: deleteWhere })),
  },
}));

import { auth } from "@/lib/auth";
import { DELETE } from "../route";

const req = () =>
  new Request("http://x/api/library/references/9", { method: "DELETE" }) as unknown as import("next/server").NextRequest;

beforeEach(() => vi.resetAllMocks());

describe("DELETE /api/library/references/[id]", () => {
  it("401 when unauthenticated", async () => {
    (auth.api.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(req(), { params: Promise.resolve({ id: "9" }) });
    expect(res.status).toBe(401);
  });

  it("400 on bad id", async () => {
    (auth.api.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    const res = await DELETE(req(), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(400);
  });

  it("200 + scopes delete to user", async () => {
    (auth.api.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    deleteWhere.mockResolvedValue(undefined);
    const res = await DELETE(req(), { params: Promise.resolve({ id: "9" }) });
    expect(res.status).toBe(200);
    expect(deleteWhere).toHaveBeenCalledOnce();
  });
});
