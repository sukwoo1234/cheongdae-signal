import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));

import { GET } from "@/app/api/auth/resume/route";

function makeClient({
  gender = "M",
  card = { id: "card-1" } as { id: string } | null,
  endsAt = "2099-01-01T00:00:00.000Z",
} = {}) {
  const profileQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { gender, banned: false }, error: null }),
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
    },
    from: vi.fn((table: string) => table === "users" ? profileQuery : configQuery),
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

  it("sends a completed participant to the end screen after the event", async () => {
    mocks.client.mockResolvedValue(makeClient({ endsAt: "2020-01-01T00:00:00.000Z" }));
    const response = await GET();
    expect(await response.json()).toEqual({ next: "/end" });
  });
});
