import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), admin: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getAdminContext: mocks.context }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

import { GET } from "@/app/api/admin/users/[id]/route";

describe("admin user match history", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ user: { id: "admin-id" } });
  });

  it("returns every viewed card and labels bonus selections", async () => {
    const userQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: { id: "user-id", email: "student@cju.ac.kr", gender: "M", banned: false },
        error: null,
      }),
    };
    userQuery.select.mockReturnValue(userQuery);
    userQuery.eq.mockReturnValue(userQuery);

    const matchRows = [
      { id: "match-1", bonus: false, created_at: "2026-09-21T01:00:00Z", cards: { one_liner: "첫 카드" } },
      { id: "match-2", bonus: true, created_at: "2026-09-21T02:00:00Z", cards: { one_liner: "두 번째 카드" } },
    ];
    const matchQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue({ data: matchRows, error: null }),
    };
    matchQuery.select.mockReturnValue(matchQuery);
    matchQuery.eq.mockReturnValue(matchQuery);

    const client = {
      from: vi.fn((table: string) => table === "users" ? userQuery : matchQuery),
      rpc: vi.fn().mockResolvedValue({
        data: [{ allowance: 2, used: 2, remaining: 0, received_reveals: 0, banned: false }],
        error: null,
      }),
    };
    mocks.admin.mockReturnValue(client);

    const response = await GET(
      new Request("https://audit.invalid/api/admin/users/student%40cju.ac.kr"),
      { params: Promise.resolve({ id: "student%40cju.ac.kr" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(matchQuery.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(body.viewed_cards).toEqual([
      { match_id: "match-1", one_liner: "첫 카드", bonus: false, created_at: "2026-09-21T01:00:00Z" },
      { match_id: "match-2", one_liner: "두 번째 카드", bonus: true, created_at: "2026-09-21T02:00:00Z" },
    ]);
  });
});
