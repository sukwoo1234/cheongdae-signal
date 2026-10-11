import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { finishSignIn } from "@/lib/auth-flow";
import { POST as finishRoute } from "@/app/api/auth/finish/route";

describe("finishSignIn runtime boundary", () => {
  function useValidSession(user = {
    id: "student-id",
    email: "student@cju.ac.kr",
    email_confirmed_at: "2026-09-06T00:00:00Z",
  }) {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { sub: user.id, aal: "aal1", amr: [{ method: "otp", timestamp: 1 }] } },
          error: null,
        }),
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
        signOut,
      },
    });

    const chain = (result: Record<string, unknown>) => {
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
    };
    const bannedEmails = chain({ data: null, error: null });
    const permanentBans = chain({ data: null, error: null });
    const sessionConfig = chain({
      data: { event_id: "00000000-0000-4000-8000-000000000099", purging: false },
      error: null,
    });
    const users = chain({ data: null, error: null });
    users.single.mockResolvedValue({ data: { gender: null, banned: false, last_active_at: "2099-01-01T00:00:00Z" }, error: null });
    const cards = chain({ data: null, count: 0, error: null });
    const admin = {
      from: vi.fn((table: string) => ({
        banned_emails: bannedEmails,
        permanent_bans: permanentBans,
        session_config: sessionConfig,
        users,
        cards,
      })[table]),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.createAdminClient.mockReturnValue(admin);

    return { signOut, permanentBans, admin, users };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("EVENT_IDENTITY_HMAC_KEY", "audit-event-identity-key-with-at-least-32-characters");

    const state = "a".repeat(43);
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: state })),
      set: vi.fn(),
    });

    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: { claims: { amr: [{ method: "password", timestamp: 1 }] } },
          error: null,
        }),
        getUser: vi.fn(),
        signOut,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a password session even when the email and login state are valid", async () => {
    const next = await finishSignIn("a".repeat(43));

    expect(next).toBe("/?error=auth_failed");
    expect(mocks.createClient.mock.results[0]?.value).toBeDefined();
    const client = await mocks.createClient.mock.results[0].value;
    expect(client.auth.signOut).toHaveBeenCalledOnce();
  });

  it("rejects a forwarded callback before creating an auth client", async () => {
    const { signOut } = useValidSession();
    const next = await finishSignIn("b".repeat(43));

    expect(next).toBe("/?error=auth_failed");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("rejects the legacy cross-browser confirmation flag at the finish API", async () => {
    const { signOut } = useValidSession();
    const response = await finishRoute(new Request("https://example.com/api/auth/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ state: "b".repeat(43), cross_browser_confirmed: true }),
    }));

    expect(await response.json()).toEqual({ next: "/?error=auth_failed" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("finishes a school login only when the browser state matches", async () => {
    const { signOut } = useValidSession();

    expect(await finishSignIn("a".repeat(43))).toBe("/onboarding");
    expect(mocks.createAdminClient).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])("rejects a missing callback state (%s)", async (state) => {
    useValidSession();

    expect(await finishSignIn(state)).toBe("/?error=auth_failed");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects a callback when the browser state cookie is missing", async () => {
    useValidSession();
    mocks.cookies.mockResolvedValue({ get: vi.fn(), set: vi.fn() });

    expect(await finishSignIn("a".repeat(43))).toBe("/?error=auth_failed");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("sends an account retained from a previous event to explicit rejoin", async () => {
    const { signOut, admin, users } = useValidSession();
    users.maybeSingle.mockResolvedValue({ data: { gender: "M", banned: false, last_active_at: "2099-01-01T00:00:00Z" }, error: null });
    admin.rpc.mockResolvedValue({ data: [], error: null });

    const next = await finishSignIn("a".repeat(43));

    expect(next).toBe("/join");
    expect(signOut).not.toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledWith("admin_event_participant_state", {
      p_user_id: "student-id",
    });
  });

  it("rejects a permanently banned account at the callback boundary", async () => {
    const { signOut, permanentBans } = useValidSession();
    permanentBans.maybeSingle.mockResolvedValue({ data: { email: "student@cju.ac.kr" }, error: null });

    expect(await finishSignIn("a".repeat(43))).toBe("/?error=banned");
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("fails closed if the permanent-ban lookup is unavailable", async () => {
    const { signOut, permanentBans } = useValidSession();
    permanentBans.maybeSingle.mockResolvedValue({ data: null, error: { message: "DB unavailable" } });

    expect(await finishSignIn("a".repeat(43))).toBe("/?error=auth_failed");
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("requires the matching browser state for administrators too", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_USER_ID", "admin-id");
    const { signOut } = useValidSession({
      id: "admin-id",
      email: "admin@example.com",
      email_confirmed_at: "2026-09-06T00:00:00Z",
    });

    const next = await finishSignIn("b".repeat(43));

    expect(next).toBe("/?error=auth_failed");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
