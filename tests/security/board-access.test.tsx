import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/auth", () => ({ getActiveUser: mocks.getActiveUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import BoardLayout from "@/app/board/layout";

describe("board page access boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects an unauthenticated visitor before rendering the board", async () => {
    mocks.getActiveUser.mockResolvedValue({ denial: "UNAUTHENTICATED" });

    await expect(BoardLayout({ children: "protected board" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("renders the board for an active participant", async () => {
    mocks.getActiveUser.mockResolvedValue({ denial: null });

    const result = await BoardLayout({ children: "protected board" });
    expect(result).toBe("protected board");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
