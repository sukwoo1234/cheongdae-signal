import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  createClient: vi.fn(),
  fetch: vi.fn(),
  setSession: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/supabase/browser", () => ({ createClient: mocks.createClient }));
vi.mock("@/components/CampusShell", () => ({
  CampusShell: ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children),
}));
vi.mock("@/components/ui/Button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement("button", props),
}));
vi.mock("@/components/SignalLoading", () => ({
  SignalLoading: ({ message }: { message: string }) => React.createElement("p", null, message),
}));

import AuthCallbackPage from "@/app/auth/callback/page";

const state = "a".repeat(43);
// A forged expired payload must never be used as an account confirmation.
const forgedAccessToken = `e30.${btoa(JSON.stringify({ email: "victim@cju.ac.kr", exp: 1 }))}.c2ln`;
const callbacks = [
  {
    kind: "session",
    path: `/auth/callback?state=${state}#access_token=${forgedAccessToken}&refresh_token=attacker-refresh-token`,
    method: "setSession" as const,
    credential: { access_token: forgedAccessToken, refresh_token: "attacker-refresh-token" },
  },
  {
    kind: "OTP",
    path: `/auth/callback?state=${state}&token_hash=unconsumed-token&type=email`,
    method: "verifyOtp" as const,
    credential: { token_hash: "unconsumed-token", type: "email" },
  },
  {
    kind: "PKCE",
    path: `/auth/callback?state=${state}&code=unconsumed-code`,
    method: "exchangeCodeForSession" as const,
    credential: "unconsumed-code",
  },
];

describe("callback browser-state boundary", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.createClient.mockImplementation(() => {
      expect(window.location.search).toBe("");
      expect(window.location.hash).toBe("");
      return { auth: {
        setSession: mocks.setSession,
        verifyOtp: mocks.verifyOtp,
        exchangeCodeForSession: mocks.exchangeCodeForSession,
      } };
    });
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.history.replaceState({}, "", "/");
    vi.unstubAllGlobals();
  });

  async function openCallback(path: string) {
    window.history.replaceState({}, "", path);
    await act(async () => root.render(React.createElement(AuthCallbackPage)));
  }

  function expectNoCredentialExchange() {
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/check-state"]);
    expect(container.textContent).toContain("새 로그인 링크 요청하기");
    expect(container.textContent).not.toContain("victim@cju.ac.kr");
    expect(container.textContent).not.toContain("이 계정으로 계속");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  }

  it.each(callbacks)("does not consume $kind credentials when browser state differs", async ({ path }) => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ matches: false })));

    await openCallback(path);

    expectNoCredentialExchange();
    await act(async () => container.querySelector("button")!.click());
    expect(mocks.replace).toHaveBeenCalledWith("/");
    expectNoCredentialExchange();
  });

  it.each(["network error", "HTTP error", "invalid JSON", "non-boolean result"])(
    "fails closed on state-check %s",
    async (failure) => {
      if (failure === "network error") mocks.fetch.mockRejectedValue(new Error("offline"));
      if (failure === "HTTP error") mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ matches: true }), { status: 503 }));
      if (failure === "invalid JSON") mocks.fetch.mockResolvedValue(new Response("invalid"));
      if (failure === "non-boolean result") mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ matches: "true" })));

      await openCallback(callbacks[1].path);

      expectNoCredentialExchange();
    },
  );

  it.each(callbacks)("completes the $kind flow after the browser state matches", async ({ path, method, credential }) => {
    mocks.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ matches: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ next: "/board" })));

    await openCallback(path);

    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks[method]).toHaveBeenCalledExactlyOnceWith(credential);
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/check-state", "/api/auth/finish"]);
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({ state });
    expect(mocks.replace).toHaveBeenCalledWith("/board");
  });
});
