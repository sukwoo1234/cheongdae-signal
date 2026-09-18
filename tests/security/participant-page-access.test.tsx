import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/auth", () => ({ getActiveUser: mocks.getActiveUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import CardPagesLayout from "@/app/card/layout";
import MyPagesLayout from "@/app/my/layout";

describe.each([
  ["card pages", CardPagesLayout],
  ["my pages", MyPagesLayout],
])("%s access boundary", (_, Layout) => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects an unauthenticated visitor before rendering", async () => {
    mocks.getActiveUser.mockResolvedValue({ denial: "UNAUTHENTICATED" });

    await expect(Layout({ children: "protected participant page" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("renders for an active participant", async () => {
    mocks.getActiveUser.mockResolvedValue({ denial: null });

    const result = await Layout({ children: "protected participant page" });
    expect(result).toBe("protected participant page");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
