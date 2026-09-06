import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("rejects a password session even when the email and login state are valid", async () => {
    const next = await finishSignIn("a".repeat(43));

    expect(next).toBe("/?error=auth_failed");
    expect(mocks.createClient.mock.results[0]?.value).toBeDefined();
    const client = await mocks.createClient.mock.results[0].value;
    expect(client.auth.signOut).toHaveBeenCalledOnce();
  });

  it("rejects a forwarded callback when the browser has no matching state", async () => {
    const next = await finishSignIn("b".repeat(43));

    expect(next).toBe("/?error=auth_failed");
    const client = await mocks.createClient.mock.results[0].value;
    expect(client.auth.getClaims).not.toHaveBeenCalled();
    expect(client.auth.signOut).toHaveBeenCalledOnce();
  });
});
