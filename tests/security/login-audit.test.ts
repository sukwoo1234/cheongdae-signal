// Security regression tests. All Auth/DB/Turnstile traffic is mocked; no email,
// live account, Cloudflare request, or remote database is touched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), server: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.server }));

import { POST as sendLink } from "@/app/api/auth/magic-link/route";
import { POST as banUser } from "@/app/api/admin/users/[id]/ban/route";
import { getActiveUser, getAdminContext } from "@/lib/auth";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as getSession } from "@/app/api/session/route";
import { POST as removeCard } from "@/app/api/admin/cards/[id]/remove/route";

const headers = { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" };
const student = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "audit@cju.ac.kr",
  email_confirmed_at: "2026-09-09T00:00:00Z",
};

function request(email = student.email, ip = "192.0.2.1", captcha = "valid-audit-token") {
  return new Request("https://audit.invalid/api/auth/magic-link", {
    method: "POST",
    headers: { ...headers, "x-vercel-forwarded-for": ip },
    body: JSON.stringify({ email, captcha_token: captcha }),
  });
}

function turnstileResult(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    success: true,
    hostname: "audit.invalid",
    action: "magic_link",
    ...overrides,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function adminMock() {
  const query: any = {
    select: vi.fn(), eq: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: { email: student.email }, error: null }),
  };
  for (const method of ["select", "eq", "update", "delete"]) query[method].mockReturnValue(query);
  query.upsert.mockResolvedValue({ error: null });
  const admin = {
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      admin: {
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  };
  mocks.admin.mockReturnValue(admin);
  return { admin, query };
}

function serverMock(user = student, aal = "aal1", method = "otp") {
  const query: any = {
    select: vi.fn(), eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "DB unavailable" } }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const server = {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: user.id, aal, amr: [{ method }] } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: { message: "network error" } }),
    },
    from: vi.fn().mockReturnValue(query),
  };
  mocks.server.mockResolvedValue(server);
  return server;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "audit-placeholder-not-a-real-secret");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "audit-turnstile-secret");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://audit.invalid");
  vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
  vi.stubEnv("ADMIN_USER_ID", "00000000-0000-4000-8000-000000000002");
  vi.stubEnv("ADMIN_REQUIRE_MFA", "true");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => turnstileResult()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("login security boundary", () => {
  it("rejects an absent production CAPTCHA before any email is sent", async () => {
    const { admin } = adminMock();
    expect((await sendLink(request(student.email, "192.0.2.1", ""))).status).toBe(400);
    expect(admin.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed on quota DB errors", async () => {
    const { admin } = adminMock();
    admin.rpc.mockResolvedValue({ data: null, error: { message: "DB unavailable" } });
    expect((await sendLink(request())).status).toBe(429);
    expect(admin.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("rejects a token that Cloudflare Siteverify does not validate", async () => {
    const { admin } = adminMock();
    vi.mocked(fetch).mockResolvedValueOnce(turnstileResult({ success: false }));

    expect((await sendLink(request())).status).toBe(400);
    expect(admin.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the banned-address lookup is unavailable", async () => {
    const { admin, query } = adminMock();
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "DB unavailable" } });

    expect((await sendLink(request())).status).toBe(500);
    expect(admin.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("validates the token server-side and does not forward the consumed token", async () => {
    const { admin } = adminMock();
    expect((await sendLink(request())).status).toBe(200);

    expect(fetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
    expect(admin.auth.signInWithOtp).toHaveBeenCalledWith({
      email: student.email,
      options: { emailRedirectTo: expect.stringContaining("/auth/callback?state=") },
    });
  });

  it("uses Vercel's forwarding header ahead of a spoofable generic header", async () => {
    const { admin } = adminMock();
    const req = request();
    req.headers.set("x-vercel-forwarded-for", "192.0.2.10");
    req.headers.set("x-forwarded-for", "198.51.100.99");
    await sendLink(req);

    const siteverifyBody = vi.mocked(fetch).mock.calls[0][1]?.body as URLSearchParams;
    expect(siteverifyBody.get("remoteip")).toBe("192.0.2.10");
    expect(admin.rpc).toHaveBeenCalledTimes(2);
  });

  it("returns the same body and login-state cookie for banned and normal addresses", async () => {
    const { admin, query } = adminMock();
    const normal = await sendLink(request());
    query.maybeSingle.mockResolvedValue({ data: { email: student.email }, error: null });
    const banned = await sendLink(request());

    expect(await normal.json()).toEqual(await banned.json());
    expect(normal.headers.get("set-cookie")).toContain("cd_login_state=");
    expect(banned.headers.get("set-cookie")).toContain("cd_login_state=");
    expect(admin.auth.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("denies password-only sessions at the active-user boundary", async () => {
    serverMock(student, "aal1", "password");
    expect((await getActiveUser()).denial).toBe("UNAUTHENTICATED");
  });

  it("does not expose session configuration or participant counts without an active session", async () => {
    const server = serverMock(student, "aal1", "password");
    (server as typeof server & { rpc: ReturnType<typeof vi.fn> }).rpc = vi.fn();

    const response = await getSession();

    expect(response.status).toBe(401);
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the profile/ban lookup fails", async () => {
    const server = serverMock();
    const result = await getActiveUser();
    expect(result.denial).toBe("UNAUTHENTICATED");
    expect(result.user).toBeNull();
    expect(server.auth.signOut).toHaveBeenCalledOnce();
  });

  it("denies AAL1 administrator sessions by default", async () => {
    serverMock({ ...student, id: process.env.ADMIN_USER_ID!, email: "admin@example.com" });
    expect((await getAdminContext()).user).toBeNull();
  });

  it("deletes and event-blocks a banned user instead of treating a UUID as a session token", async () => {
    const { admin } = adminMock();
    serverMock(
      { ...student, id: process.env.ADMIN_USER_ID!, email: "admin@example.com" },
      "aal2",
    );
    const response = await banUser(
      new Request("https://audit.invalid/api/admin/users/test/ban", { method: "POST", headers }),
      { params: Promise.resolve({ id: student.id }) },
    );

    expect(admin.rpc).toHaveBeenCalledWith("ban_event_participant", {
      p_user_id: student.id,
      p_reason: "admin_ban",
    });
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(student.id);
    expect(response.status).toBe(200);
  });

  it("deletes a participant account without adding an event ban", async () => {
    const { admin, query } = adminMock();
    query.maybeSingle.mockResolvedValueOnce({
      data: { user_id: student.id },
      error: null,
    });
    serverMock(
      { ...student, id: process.env.ADMIN_USER_ID!, email: "admin@example.com" },
      "aal2",
    );

    const response = await removeCard(
      new Request("https://audit.invalid/api/admin/cards/test/remove", { method: "POST", headers }),
      { params: Promise.resolve({ id: "20000000-0000-4000-8000-000000000001" }) },
    );

    expect(response.status).toBe(200);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(student.id);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("reports logout revocation failure instead of a false success", async () => {
    serverMock();
    const response = await logout(
      new Request("https://audit.invalid/api/auth/logout", { method: "POST", headers }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "LOGOUT_FAILED" });
  });
});
