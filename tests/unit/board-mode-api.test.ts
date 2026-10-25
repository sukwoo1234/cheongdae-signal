import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ activeUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getActiveUser: mocks.activeUser,
  denialResponse: (error: string) => Response.json({ error }, { status: 401 }),
}));

import { GET } from "@/app/api/board/route";

describe("board mode API", () => {
  beforeEach(() => vi.resetAllMocks());

  it("passes the selected board gender only to the secured RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: "card-1", one_liner: "친구 구해요", color: "pink", gender: "F" }],
      error: null,
    });
    mocks.activeUser.mockResolvedValue({
      supabase: { rpc }, user: { id: "viewer" }, denial: null,
    });

    const response = await GET(new Request("https://example.test/api/board?gender=F"));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("board_cards_discovery", { p_target_gender: "F", p_sort: "random" });
    expect((await response.json()).cards).toHaveLength(1);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects an unknown board value before querying the database", async () => {
    const rpc = vi.fn();
    mocks.activeUser.mockResolvedValue({
      supabase: { rpc }, user: { id: "viewer" }, denial: null,
    });

    const response = await GET(new Request("https://example.test/api/board?gender=X"));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves the database's newest-first order and new-card flags", async () => {
    const cards = [
      { id: "new", one_liner: "카페 친구", color: "pink", gender: "M", is_new: true },
      { id: "old", one_liner: "산책 친구", color: "blue", gender: "M", is_new: false },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: cards, error: null });
    mocks.activeUser.mockResolvedValue({ supabase: { rpc }, user: { id: "viewer" }, denial: null });
    const random = vi.spyOn(Math, "random");
    try {
      const response = await GET(new Request("https://example.test/api/board?gender=M&sort=newest"));
      expect(rpc).toHaveBeenCalledWith("board_cards_discovery", { p_target_gender: "M", p_sort: "newest" });
      expect((await response.json()).cards).toEqual(cards);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it.each(["recent", "", "NEWEST"])("rejects unsupported sort %j before the RPC", async (sort) => {
    const rpc = vi.fn();
    mocks.activeUser.mockResolvedValue({ supabase: { rpc }, user: { id: "viewer" }, denial: null });
    const response = await GET(new Request(`https://example.test/api/board?sort=${sort}`));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated viewers before the discovery RPC", async () => {
    const rpc = vi.fn();
    mocks.activeUser.mockResolvedValue({ supabase: { rpc }, user: null, denial: null });
    const response = await GET(new Request("https://example.test/api/board?sort=newest"));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
