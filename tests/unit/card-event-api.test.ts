import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ active: vi.fn(), userRpc: vi.fn(), adminRpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getActiveUser: mocks.active,
  denialResponse: (error: string) => Response.json({ error }, { status: 401 }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.adminRpc }),
}));

import { GET, PATCH } from "@/app/api/cards/me/route";
import { POST as toggleHide } from "@/app/api/cards/me/toggle-hide/route";

const eventA = "30000000-0000-4000-8000-000000000001";
const eventB = "30000000-0000-4000-8000-000000000002";
const userId = "10000000-0000-4000-8000-000000000001";
const ajaxHeaders = { "X-Requested-With": "XMLHttpRequest" };
const patchRequest = (body: unknown) => new Request("https://example.test/api/cards/me", {
  method: "PATCH", headers: ajaxHeaders, body: JSON.stringify(body),
});
const toggleRequest = (body: unknown) => new Request("https://example.test/api/cards/me/toggle-hide", {
  method: "POST", headers: ajaxHeaders, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.active.mockResolvedValue({ supabase: { rpc: mocks.userRpc }, user: { id: userId },
    profile: { gender: "M" }, denial: null });
  mocks.userRpc.mockImplementation(async (name: string) => name === "my_season_state"
    ? { data: [{ event_id: eventA }], error: null }
    : { data: [{ id: "card-a", one_liner: "친구 구해요" }], error: null });
  mocks.adminRpc.mockResolvedValue({ data: "card-a", error: null });
});

describe("event-bound self-card routes", () => {
  it("returns the observed event before loading the card", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ card: { id: "card-a", one_liner: "친구 구해요" }, event_id: eventA });
    expect(mocks.userRpc.mock.calls.map(([name]) => name)).toEqual(["my_season_state", "my_card"]);
  });

  it("rejects missing event IDs before every self-card write", async () => {
    const patch = await PATCH(patchRequest({ one_liner: "수정" }));
    const toggle = await toggleHide(toggleRequest({ hidden: true }));
    expect(patch.status).toBe(409);
    expect(toggle.status).toBe(409);
    expect(await patch.json()).toEqual({ error: "EVENT_CHANGED" });
    expect(await toggle.json()).toEqual({ error: "EVENT_CHANGED" });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it("sends the browser-observed event to the final database guard", async () => {
    const patch = await PATCH(patchRequest({ expected_event_id: eventA, one_liner: "새 소개" }));
    const toggle = await toggleHide(toggleRequest({ expected_event_id: eventA, hidden: false }));
    expect(patch.status).toBe(200);
    expect(toggle.status).toBe(200);
    expect(mocks.adminRpc).toHaveBeenNthCalledWith(1, "update_event_card", {
      p_expected_event_id: eventA, p_user_id: userId, p_one_liner: "새 소개",
      p_instagram_id: null, p_contact_type: null, p_color: null, p_hidden_by_user: null,
    });
    expect(mocks.adminRpc).toHaveBeenNthCalledWith(2, "update_event_card", {
      p_expected_event_id: eventA, p_user_id: userId, p_one_liner: null,
      p_instagram_id: null, p_contact_type: null, p_color: null, p_hidden_by_user: false,
    });
  });

  it("does not alter a new-event card when an old page submits after the same user rejoins", async () => {
    mocks.userRpc.mockResolvedValue({ data: [{ event_id: eventB }], error: null });
    mocks.adminRpc.mockResolvedValue({ data: null, error: { message: "STALE_EVENT" } });
    for (const res of [
      await PATCH(patchRequest({ expected_event_id: eventA, one_liner: "오래된 수정" })),
      await toggleHide(toggleRequest({ expected_event_id: eventA, hidden: true })),
    ]) {
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "EVENT_CHANGED" });
    }
    expect(mocks.adminRpc).toHaveBeenCalledTimes(2);
    expect(mocks.adminRpc.mock.calls.every(([, args]) => args.p_expected_event_id === eventA)).toBe(true);
  });

  it("keeps the missing-card response distinct from stale-event conflicts", async () => {
    mocks.adminRpc.mockResolvedValue({ data: null, error: { message: "CARD_NOT_FOUND" } });
    const patch = await PATCH(patchRequest({ expected_event_id: eventA, color: "blue" }));
    const toggle = await toggleHide(toggleRequest({ expected_event_id: eventA, hidden: true }));
    expect(patch.status).toBe(404);
    expect(toggle.status).toBe(404);
    expect(await patch.json()).toEqual({ error: "CARD_NOT_FOUND" });
    expect(await toggle.json()).toEqual({ error: "CARD_NOT_FOUND" });
  });
});
