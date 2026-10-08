import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), fetch: vi.fn() }));
const router = { replace: mocks.replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) =>
  React.createElement("a", { href }, children) }));
vi.mock("@/components/CampusShell", () => ({ CampusShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/SignalLoading", () => ({ SignalLoading: ({ message }: { message: string }) => message }));
vi.mock("@/components/PetalCard", () => ({ PetalCard: ({ text }: { text: string }) =>
  React.createElement("span", { "data-testid": "petal" }, text) }));
import MyMatchesPage from "@/app/my/matches/page";

let root: Root;
let container: HTMLDivElement;
const savedMatches = (count: number) => Array.from({ length: count }, (_, index) => ({
  match_id: `match-${count - index}`, card_id: `card-${count - index}`,
  one_liner: `소개 ${count - index}`, color: "pink", instagram_id: `student${count - index}`,
  contact_type: "instagram", created_at: new Date(Date.UTC(2026, 9, count - index)).toISOString(),
}));
const renderMatches = async (count: number) => {
  mocks.fetch.mockImplementation(async () => Response.json({ matches: savedMatches(count) }));
  await act(async () => root.render(<MyMatchesPage />));
};
const petals = () => [...container.querySelectorAll('[data-testid="petal"]')].map(node => node.textContent);
const toggle = () => container.querySelector<HTMLButtonElement>('button[aria-controls="my-matches-list"]');

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", mocks.fetch);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("my matches latest-five disclosure", () => {
  it.each([0, 3, 5])("shows all %i matches without an unnecessary toggle", async (count) => {
    await renderMatches(count);
    expect(petals()).toHaveLength(count);
    expect(container.querySelector("h1")?.textContent).toBe(`내 매칭 ${count}`);
    expect(toggle()).toBeNull();
    if (count === 0) expect(container.textContent).toContain("아직 선택한 카드가 없어요.");
  });
  it("initially shows only the five latest selections but keeps the full total", async () => {
    await renderMatches(6);
    expect(petals()).toEqual(["소개 6", "소개 5", "소개 4", "소개 3", "소개 2"]);
    expect(container.querySelector("h1")?.textContent).toBe("내 매칭 6");
    expect(container.textContent).not.toContain("student1");
    expect(toggle()?.textContent).toBe("더보기 (1개)");
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
  });
  it("expands all older matches and collapses back to five without another request or data loss", async () => {
    await renderMatches(34);
    expect(toggle()?.textContent).toBe("더보기 (29개)");
    await act(async () => toggle()!.click());
    expect(petals()).toHaveLength(34);
    expect(petals()[0]).toBe("소개 34");
    expect(petals()[33]).toBe("소개 1");
    expect(container.textContent).toContain("student1");
    expect(toggle()?.textContent).toBe("접기 · 최신 5개만 보기");
    expect(toggle()?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("h1")?.textContent).toBe("내 매칭 34");
    await act(async () => toggle()!.click());
    expect(petals()).toEqual(["소개 34", "소개 33", "소개 32", "소개 31", "소개 30"]);
    expect(container.querySelector("h1")?.textContent).toBe("내 매칭 34");
    expect(toggle()?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle()!.click());
    expect(petals()).toHaveLength(34);
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("/api/matches/me");
  });
  it("still redirects to the end page when the season has ended", async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ error: "SESSION_ENDED" }, { status: 410 }));
    await act(async () => root.render(<MyMatchesPage />));
    expect(mocks.replace).toHaveBeenCalledWith("/end");
    expect(petals()).toHaveLength(0);
    expect(toggle()).toBeNull();
  });
});
