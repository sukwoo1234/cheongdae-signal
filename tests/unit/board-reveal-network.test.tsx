import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), fetch: vi.fn() }));
const router = { replace: mocks.replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/SeasonBoundary", () => ({ SeasonBoundary: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/CountdownBanner", () => ({ CountdownBanner: () => null }));
vi.mock("@/components/BoardGrid", () => ({ BoardGrid: ({ onCardClick }: { onCardClick: (card: object) => void }) =>
  <button onClick={() => onCardClick({ id: "target", one_liner: "카페 친구", color: "pink", gender: "F", is_new: true })}>카페 친구 선택</button> }));
import BoardPage from "@/app/board/page";

let root: Root;
let container: HTMLDivElement;
let remaining: number;
const matchesPost = () => mocks.fetch.mock.calls.filter(([url, options]) => url === "/api/matches" && options?.method === "POST");
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text)!;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", mocks.fetch);
  remaining = 1;
  mocks.fetch.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url === "/api/matches" && options?.method === "POST") {
      remaining = 0; // The server committed the selection before the response was lost.
      throw new TypeError("Failed to fetch");
    }
    if (url === "/api/session") return Response.json({
      board_open: true, in_postsession: false, viewer_gender: "M",
      config: { ends_at: "2027-01-30T14:59:00Z", board_mode: "selectable", continuous_mode: false },
    });
    if (url === "/api/cards/me") return Response.json({ card: null });
    if (url === "/api/matches/me") return Response.json({ matches: [], slot: { remaining, used: 1 - remaining, base_remaining: remaining, bonus_remaining: 0 } });
    throw new Error(`Unexpected request: ${url}`);
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("card reveal network recovery", () => {
  it("closes the dialog on a lost response and synchronizes the spent choice", async () => {
    await act(async () => root.render(<BoardPage />));
    await act(async () => button("카페 친구 선택").click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => button("확인하기").click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("내 매칭");
    expect(container.textContent).not.toContain("확인 중...");
    expect(container.querySelector('[aria-label="선택 기회 0회 남음"]')).not.toBeNull();
    await act(async () => button("카페 친구 선택").click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(matchesPost()).toHaveLength(1);
  });

  it("times out a stalled request and releases the busy dialog", async () => {
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/matches" && options?.method === "POST") {
        return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
      }
      return original(url, options);
    });
    await act(async () => root.render(<BoardPage />));
    await act(async () => button("카페 친구 선택").click());
    await act(async () => button("확인하기").click());
    expect(button("확인 중...").disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("내 매칭");
    expect(matchesPost()).toHaveLength(1);
  });

  it("recovers when a successful response body is interrupted", async () => {
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/matches" && options?.method === "POST") {
        remaining = 0;
        return Promise.resolve(new Response('{"instagram_id":', { status: 200 }));
      }
      return original(url, options);
    });
    await act(async () => root.render(<BoardPage />));
    await act(async () => button("카페 친구 선택").click());
    await act(async () => button("확인하기").click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("내 매칭");
    expect(container.querySelector('[aria-label="선택 기회 0회 남음"]')).not.toBeNull();
  });

  it("keeps further selections blocked if the recovery ledger request fails", async () => {
    const original = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/matches/me" && matchesPost().length > 0) {
        return Promise.resolve(Response.json({ error: "DB_ERROR" }, { status: 500 }));
      }
      return original(url, options);
    });
    await act(async () => root.render(<BoardPage />));
    await act(async () => button("카페 친구 선택").click());
    await act(async () => button("확인하기").click());
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => button("카페 친구 선택").click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("아직 확인하지 못했어요");
    expect(matchesPost()).toHaveLength(1);
  });
});
