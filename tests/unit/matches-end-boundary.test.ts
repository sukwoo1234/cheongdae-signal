import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveUser: vi.fn(),
  denialResponse: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getActiveUser: mocks.getActiveUser,
  denialResponse: mocks.denialResponse,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from "@/app/api/matches/me/route";

function configResult(data: Record<string, unknown> | null, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.createAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
}

describe("saved match session boundary", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    rpc.mockImplementation((name: string) => name === "my_matches"
      ? Promise.resolve({ data: [{ match_id: "match-1" }], error: null })
      : Promise.resolve({ data: [{ allowance: 1, used: 1, remaining: 0 }], error: null }));
    mocks.getActiveUser.mockResolvedValue({
      supabase: { rpc },
      user: { id: "user-1" },
      denial: null,
    });
  });

  it("returns saved matches during an active event without caching contact data", async () => {
    configResult({
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 60_000).toISOString(),
      purging: false,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).matches).toEqual([{ match_id: "match-1" }]);
    expect(rpc).toHaveBeenCalledWith("my_matches");
  });

  it("blocks the API immediately after the event ends before calling the contact RPC", async () => {
    configResult({
      starts_at: new Date(Date.now() - 120_000).toISOString(),
      ends_at: new Date(Date.now() - 60_000).toISOString(),
      purging: false,
    });

    const response = await GET();
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: "SESSION_ENDED", matches: [], slot: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed if the server cannot verify the event window", async () => {
    configResult(null, { message: "DB unavailable" });

    const response = await GET();
    expect(response.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });
});
