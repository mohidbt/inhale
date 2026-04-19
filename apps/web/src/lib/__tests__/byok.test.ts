import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db and decrypt before importing the module under test
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/encryption", () => ({ decrypt: vi.fn() }));

import { db } from "@/db";
import { decrypt } from "@/lib/encryption";
import { getUserS2Key } from "@/lib/byok";

const mockDecrypt = vi.mocked(decrypt);

function mockSelect(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
  vi.mocked(db.select).mockReturnValue(chain as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUserS2Key", () => {
  it("returns null when no row exists", async () => {
    mockSelect([]);
    const result = await getUserS2Key("user-1");
    expect(result).toBeNull();
  });

  it("returns decrypted key when row exists with providerType references", async () => {
    mockSelect([{ encryptedKey: "encrypted-blob" }]);
    mockDecrypt.mockReturnValue("my-s2-api-key");

    const result = await getUserS2Key("user-1");

    expect(mockDecrypt).toHaveBeenCalledWith("encrypted-blob");
    expect(result).toBe("my-s2-api-key");
  });
});
