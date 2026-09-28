import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), admin: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getAdminContext: mocks.context }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

import { GET } from "@/app/api/admin/stats/route";

describe("admin board status", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ user: { id: "admin-id" } });
  });

  it("returns the database board-open decision to the admin page", async () => {
    const singleResults = [
      { data: { male: 3, female: 0 }, error: null },
      { data: { participants: 3, users: 3 }, error: null },
      { data: { id: 1, threshold_male: 5, threshold_female: 5 }, error: null },
    ];
    const single = vi.fn()
      .mockResolvedValueOnce(singleResults[0])
      .mockResolvedValueOnce(singleResults[1])
      .mockResolvedValueOnce(singleResults[2]);
    const query = { select: vi.fn(), eq: vi.fn(), single };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);

    const rpc = vi.fn((name: string) => {
      if (name === "gender_counts" || name === "event_purge_status") {
        return { single };
      }
      if (name === "admin_event_match_count") {
        return Promise.resolve({ data: 0, error: null });
      }
      if (name === "board_is_open") {
        return Promise.resolve({ data: false, error: null });
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    mocks.admin.mockReturnValue({ rpc, from: vi.fn(() => query) });

    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).board_open).toBe(false);
    expect(rpc).toHaveBeenCalledWith("board_is_open");
  });
});
