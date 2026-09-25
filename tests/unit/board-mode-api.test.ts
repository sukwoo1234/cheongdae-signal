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
    expect(rpc).toHaveBeenCalledWith("board_cards", { p_target_gender: "F" });
    expect((await response.json()).cards).toHaveLength(1);
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
});
