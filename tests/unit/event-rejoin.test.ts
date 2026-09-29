import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ account: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, getVerifiedAccount: mocks.account };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

import { POST } from "@/app/api/events/join/route";

function chain(result: Record<string, unknown>) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gt: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gt.mockReturnValue(query);
  return query;
}

function request() {
  return new Request("https://stage.invalid/api/events/join", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify({ retention_consent: true }),
  });
}

describe("event rejoin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("EVENT_IDENTITY_HMAC_KEY", "test-event-identity-key-with-at-least-32-characters");
    mocks.account.mockResolvedValue({
      user: { id: "user-1", email: "student@cju.ac.kr" },
      denial: null,
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("links a retained account to the current event and sends it to a new card", async () => {
    const profile = chain({
      data: {
        gender: "M",
        banned: false,
        retention_accepted_at: "2026-09-01T00:00:00Z",
        last_active_at: "2099-01-01T00:00:00Z",
      },
      error: null,
    });
    const eventBan = chain({ data: null, error: null });
    const permanentBan = chain({ data: null, error: null });
    const config = chain({
      data: {
        event_id: "10000000-0000-4000-8000-000000000001",
        ends_at: "2099-02-01T00:00:00Z",
        purging: false,
      },
      error: null,
    });
    const cards = chain({ data: null, count: 0, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: [{ remaining: 2 }], error: null });
    mocks.admin.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => ({
        users: profile,
        banned_emails: eventBan,
        permanent_bans: permanentBan,
        session_config: config,
        cards,
      })[table]),
      auth: { admin: { deleteUser: vi.fn() } },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, next: "/card/new" });
    expect(rpc).toHaveBeenCalledWith("rejoin_event_participant", expect.objectContaining({
      p_user_id: "user-1",
      p_retention_accepted: true,
    }));
  });

  it("removes an account that has exceeded the six-month retention period", async () => {
    const profile = chain({
      data: {
        gender: "M",
        banned: false,
        retention_accepted_at: "2020-01-01T00:00:00Z",
        last_active_at: "2020-01-01T00:00:00Z",
      },
      error: null,
    });
    const empty = chain({ data: null, error: null });
    const config = chain({
      data: {
        event_id: "10000000-0000-4000-8000-000000000001",
        ends_at: "2099-02-01T00:00:00Z",
        purging: false,
      },
      error: null,
    });
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    mocks.admin.mockReturnValue({
      rpc: vi.fn(),
      from: vi.fn((table: string) => table === "users" ? profile : table === "session_config" ? config : empty),
      auth: { admin: { deleteUser } },
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "ACCOUNT_EXPIRED" });
    expect(deleteUser).toHaveBeenCalledWith("user-1");
  });
});
