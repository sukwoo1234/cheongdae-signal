import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), admin: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getAdminContext: mocks.context }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

import { GET } from "@/app/api/admin/matches/route";

describe("admin match overview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ user: { id: "admin-id" } });
  });

  it("shows directed selections and deduplicates reciprocal selections into one mutual pair", async () => {
    const matches = [
      { id: "a-to-b", viewer_user_id: "a", viewed_card_id: "card-b", bonus: false, selection_number: 1, created_at: "2026-09-30T01:00:00Z" },
      { id: "b-to-a", viewer_user_id: "b", viewed_card_id: "card-a", bonus: false, selection_number: 2, created_at: "2026-09-30T02:00:00Z" },
      { id: "c-to-b", viewer_user_id: "c", viewed_card_id: "card-b", bonus: true, selection_number: 3, created_at: "2026-09-30T03:00:00Z" },
    ];
    const cards = [
      { id: "card-a", user_id: "a", one_liner: "A의 카드" },
      { id: "card-b", user_id: "b", one_liner: "B의 카드" },
      { id: "card-c", user_id: "c", one_liner: "C의 카드" },
    ];
    const users = [
      { id: "a", email: "a@cju.ac.kr", gender: "M" },
      { id: "b", email: "b@cju.ac.kr", gender: "F" },
      { id: "c", email: "c@cju.ac.kr", gender: "M" },
    ];

    const matchQuery = { select: vi.fn(), order: vi.fn().mockResolvedValue({ data: matches, error: null }) };
    matchQuery.select.mockReturnValue(matchQuery);
    const cardQuery = { select: vi.fn().mockResolvedValue({ data: cards, error: null }) };
    const userQuery = { select: vi.fn(), in: vi.fn().mockResolvedValue({ data: users, error: null }) };
    userQuery.select.mockReturnValue(userQuery);

    mocks.admin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "matches") return matchQuery;
        if (table === "cards") return cardQuery;
        return userQuery;
      }),
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total_selections).toBe(3);
    expect(body.mutual_count).toBe(1);
    expect(body.selections.map((row: { id: string; mutual: boolean }) => [row.id, row.mutual])).toEqual([
      ["a-to-b", true],
      ["b-to-a", true],
      ["c-to-b", false],
    ]);
    expect(body.mutual_pairs).toHaveLength(1);
    expect(body.mutual_pairs[0]).toMatchObject({
      first: { email: "a@cju.ac.kr", one_liner: "A의 카드", selection_number: 1 },
      second: { email: "b@cju.ac.kr", one_liner: "B의 카드", selection_number: 2 },
      matched_at: "2026-09-30T02:00:00.000Z",
    });
  });

  it("rejects non-admin requests", async () => {
    mocks.context.mockResolvedValue({ user: null });
    const response = await GET();
    expect(response.status).toBe(403);
  });
});
