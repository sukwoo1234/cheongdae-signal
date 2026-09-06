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

    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      single: vi.fn().mockResolvedValue({ data: { gender: null, banned: false }, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.createAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) });

    return { signOut };
  }

  beforeEach(() => {
    vi.resetAllMocks();

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

  it("rejects a forwarded callback without explicit cross-browser confirmation", async () => {
    const { signOut } = useValidSession();
    const next = await finishSignIn("b".repeat(43));

    expect(next).toBe("/?error=auth_failed");
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("allows a confirmed CJU user to continue in the email app's browser", async () => {
    const { signOut } = useValidSession();
    const next = await finishSignIn("b".repeat(43), { crossBrowserConfirmed: true });

    expect(next).toBe("/onboarding");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("never grants the cross-browser exception to the administrator", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_USER_ID", "admin-id");
    const { signOut } = useValidSession({
      id: "admin-id",
      email: "admin@example.com",
      email_confirmed_at: "2026-09-06T00:00:00Z",
    });

    const next = await finishSignIn("b".repeat(43), { crossBrowserConfirmed: true });

    expect(next).toBe("/?error=auth_failed");
    expect(signOut).toHaveBeenCalledOnce();
  });
});
