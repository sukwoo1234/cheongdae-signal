import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

import { GET } from "@/app/api/auth/resume/route";

function makeClient({
  gender = "M",
  card = { id: "card-1" } as { id: string } | null,
  endsAt = "2099-01-01T00:00:00.000Z",
  participant = true,
  lastActiveAt = "2099-01-01T00:00:00Z",
} = {}) {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { gender, banned: false, last_active_at: lastActiveAt }, error: null }),
  };
  profileQuery.select.mockReturnValue(profileQuery);
  profileQuery.eq.mockReturnValue(profileQuery);

  const configQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: { ends_at: endsAt, purging: false }, error: null }),
  };
  configQuery.select.mockReturnValue(configQuery);
  configQuery.eq.mockReturnValue(configQuery);

  mocks.admin.mockReturnValue({
    auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: null }) } },
    from: vi.fn((table: string) => table === "session_config" ? configQuery : profileQuery),
    rpc: vi.fn().mockResolvedValue({
      data: participant ? [{ allowance: 1, used: 0, remaining: 1, banned: false }] : [],
      error: null,
    }),
  });

  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: "user-1", amr: [{ method: "magiclink" }] } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1", email: "student@cju.ac.kr", email_confirmed_at: "2026-09-01" } },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => configQuery),
    rpc: vi.fn().mockResolvedValue({ data: card ? [card] : [], error: null }),
  };
}

describe("auth resume", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps unauthenticated visitors on the login page", async () => {
    mocks.client.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: null, error: new Error("no session") }),
      },
    });

    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ next: null });
  });

  it("returns an active participant directly to the board", async () => {
    mocks.client.mockResolvedValue(makeClient());
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ next: "/board" });
  });

  it("returns unfinished participants to their next required step", async () => {
    mocks.client.mockResolvedValue(makeClient({ gender: null as unknown as string }));
    let response = await GET();
    expect(await response.json()).toEqual({ next: "/onboarding" });

    mocks.client.mockResolvedValue(makeClient({ card: null }));
    response = await GET();
    expect(await response.json()).toEqual({ next: "/card/new" });
  });

  it("sends a retained account without a current-event ledger to rejoin", async () => {
    mocks.client.mockResolvedValue(makeClient({ participant: false }));
    const response = await GET();
    expect(await response.json()).toEqual({ next: "/join" });
  });

  it("sends a completed participant to the end screen after the event", async () => {
    mocks.client.mockResolvedValue(makeClient({ endsAt: "2020-01-01T00:00:00.000Z" }));
    const response = await GET();
    expect(await response.json()).toEqual({ next: "/end" });
  });

  it("preserves a current participant and card after the account retention date", async () => {
    mocks.client.mockResolvedValue(makeClient({ lastActiveAt: "2020-01-01T00:00:00Z" }));
    const response = await GET();

    expect(await response.json()).toEqual({ next: "/board" });
    expect(mocks.admin.mock.results[0].value.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes an expired account with no current-event participation", async () => {
    mocks.client.mockResolvedValue(makeClient({
      lastActiveAt: "2020-01-01T00:00:00Z", participant: false,
    }));
    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.admin.mock.results[0].value.auth.admin.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("deletes an expired account after its current event has ended", async () => {
    mocks.client.mockResolvedValue(makeClient({
      lastActiveAt: "2020-01-01T00:00:00Z", endsAt: "2020-01-02T00:00:00Z",
    }));
    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.admin.mock.results[0].value.auth.admin.deleteUser).toHaveBeenCalledWith("user-1");
  });
});
