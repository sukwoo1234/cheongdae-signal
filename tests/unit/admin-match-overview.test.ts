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

    const matchQuery = { select: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: matches, error: null }) };
    matchQuery.select.mockReturnValue(matchQuery);
    matchQuery.order.mockReturnValue(matchQuery);
    const cardQuery = { select: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: cards, error: null }) };
    cardQuery.select.mockReturnValue(cardQuery);
    cardQuery.order.mockReturnValue(cardQuery);
    const userQuery = { select: vi.fn(), in: vi.fn().mockResolvedValue({ data: users, error: null }) };
    userQuery.select.mockReturnValue(userQuery);

    mocks.admin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "matches") return matchQuery;
        if (table === "cards") return cardQuery;
        return userQuery;
      }),
      rpc: vi.fn().mockResolvedValue({ data: 5, error: null }),
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total_selections).toBe(5);
    expect(body.visible_selections).toBe(3);
    expect(body.unavailable_selections).toBe(2);
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

  it("loads selections and target cards beyond the PostgREST row cap", async () => {
    const matches = Array.from({ length: 1001 }, (_, index) => ({
      id: `match-${index}`, viewer_user_id: "viewer", viewed_card_id: "target-card",
      bonus: false, selection_number: index + 1, created_at: "2026-09-30T01:00:00Z",
    }));
    const cards = [
      ...Array.from({ length: 1000 }, (_, index) => ({
        id: `filler-${String(index).padStart(4, "0")}`, user_id: `filler-user-${index}`, one_liner: "filler",
      })),
      { id: "target-card", user_id: "target", one_liner: "target" },
    ];
    const matchQuery = { select: vi.fn(), order: vi.fn(), range: vi.fn(async (from: number, to: number) => ({
      data: matches.slice(from, to + 1), error: null,
    })) };
    matchQuery.select.mockReturnValue(matchQuery);
    matchQuery.order.mockReturnValue(matchQuery);
    const cardQuery = { select: vi.fn(), order: vi.fn(), range: vi.fn(async (from: number, to: number) => ({
      data: cards.slice(from, to + 1), error: null,
    })) };
    cardQuery.select.mockReturnValue(cardQuery);
    cardQuery.order.mockReturnValue(cardQuery);
    const userQuery = { select: vi.fn(), in: vi.fn().mockResolvedValue({
      data: [
        { id: "viewer", email: "viewer@cju.ac.kr", gender: "M" },
        { id: "target", email: "target@cju.ac.kr", gender: "F" },
      ], error: null,
    }) };
    userQuery.select.mockReturnValue(userQuery);
    mocks.admin.mockReturnValue({
      from: vi.fn((table: string) => table === "matches" ? matchQuery : table === "cards" ? cardQuery : userQuery),
      rpc: vi.fn().mockResolvedValue({ data: 1001, error: null }),
    });

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.visible_selections).toBe(1001);
    expect(body.unavailable_selections).toBe(0);
    expect(body.selections[1000].target.one_liner).toBe("target");
    expect(matchQuery.range).toHaveBeenCalledTimes(3);
    expect(cardQuery.range).toHaveBeenCalledTimes(3);
  });
});
