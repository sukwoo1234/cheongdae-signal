import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ active: vi.fn(), rpc: vi.fn(), admin: vi.fn(), from: vi.fn(),
  insert: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveUser: mocks.active,
  denialResponse: (error: string) => Response.json({ error }, { status: 401 }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { POST } from "@/app/api/cards/route";

const season = { continuous_mode: true, accepted: false, event_id: "30000000-0000-4000-8000-000000000001",
  ends_at: "2027-01-30T14:59:00Z", board_mode: "selectable" };
const consent = { accepted: true, event_id: season.event_id, ends_at: season.ends_at, board_mode: season.board_mode };
const card = { one_liner: "친구 구해요", instagram_id: "student_id", contact_type: "instagram", color: "pink" };
const request = (body: unknown, ajax = true) => new Request("https://example.test/api/cards", {
  method: "POST", headers: ajax ? { "X-Requested-With": "XMLHttpRequest" } : {}, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T01:00:00Z"));
  mocks.active.mockResolvedValue({ supabase: { rpc: mocks.rpc }, user: { id: "verified-participant" },
    profile: { gender: "M" }, denial: null });
  mocks.rpc.mockResolvedValue({ data: [season], error: null });
  mocks.admin.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: { id: "new-card" }, error: null });
});
afterEach(() => vi.useRealTimers());

describe("card registration with inline season consent", () => {
  it("never records consent for invalid card data", async () => {
    expect((await POST(request({ ...card, one_liner: "   ", season_consent: consent }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects missing or false consent for a new participant", async () => {
    for (const value of [undefined, { ...consent, accepted: false }]) {
      const res = await POST(request({ ...card, season_consent: value }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "SEASON_CONSENT_REQUIRED" });
    }
    expect(mocks.rpc.mock.calls.every(([name]) => name === "my_season_state")).toBe(true);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("records the displayed terms on explicit registration, then creates the caller's card", async () => {
    const res = await POST(request({ ...card, user_id: "ignored", season_consent: consent }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "new-card" });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "accept_current_season", {
      p_event_id: consent.event_id, p_ends_at: consent.ends_at, p_board_mode: consent.board_mode,
    });
    expect(mocks.insert).toHaveBeenCalledWith({ ...card, user_id: "verified-participant" });
    expect(mocks.rpc.mock.invocationCallOrder[1]).toBeLessThan(mocks.insert.mock.invocationCallOrder[0]);
  });
  it("does not register a card when the displayed terms became stale or consent failed", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [season], error: null }).mockResolvedValueOnce({ error: { message: "SEASON_CHANGED" } });
    const res = await POST(request({ ...card, season_consent: consent }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "SEASON_CHANGED" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("allows an already-consented participant's older form without recording fictional new consent", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...season, accepted: true }], error: null });
    expect((await POST(request(card))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("my_season_state");
  });
  it("preserves ordinary event registration without adding semester consent", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...season, continuous_mode: false }], error: null });
    expect((await POST(request(card))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("my_season_state");
  });
  it("does not insert or accept when the season state is unavailable or ended", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    expect((await POST(request({ ...card, season_consent: consent }))).status).toBe(503);
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...season, ends_at: "2026-10-07T14:59:00Z" }], error: null });
    expect((await POST(request({ ...card, season_consent: consent }))).status).toBe(410);
    expect(mocks.rpc.mock.calls.every(([name]) => name === "my_season_state")).toBe(true);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("still rejects unauthenticated or non-AJAX registration", async () => {
    expect((await POST(request({ ...card, season_consent: consent }, false))).status).toBe(403);
    mocks.active.mockResolvedValue({ user: null, denial: "UNAUTHENTICATED" });
    expect((await POST(request({ ...card, season_consent: consent }))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("preserves duplicate-card and database failure responses", async () => {
    mocks.single.mockResolvedValueOnce({ error: { code: "23505" } });
    expect((await POST(request({ ...card, season_consent: consent }))).status).toBe(409);
    mocks.single.mockResolvedValueOnce({ error: { code: "unexpected" } });
    expect((await POST(request({ ...card, season_consent: consent }))).status).toBe(500);
  });
});
