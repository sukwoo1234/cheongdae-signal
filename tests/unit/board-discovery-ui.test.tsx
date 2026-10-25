import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardGrid } from "@/components/BoardGrid";

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
const onCardClick = vi.fn();
const cards = [
  { id: "new", one_liner: "카페 같이 가요", color: "pink", gender: "F", is_new: true },
  { id: "old", one_liner: "산책 같이 해요", color: "blue", gender: "F", is_new: false },
];
const render = async (gender: "M" | "F" = "F", reloadKey = 0) => {
  await act(async () => root.render(<BoardGrid targetGender={gender} reloadKey={reloadKey} onCardClick={onCardClick} />));
};
const sortButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('[role="group"] button')]
  .find(button => button.textContent === label)!;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => Response.json({ cards }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("board discovery", () => {
  it("shows new badges only on recent cards and keeps card selection unchanged", async () => {
    await render();
    expect(sortButton("무작위").getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/board?sort=random&gender=F", expect.objectContaining({ cache: "no-store" }));
    const recentCard = container.querySelector<HTMLButtonElement>('button[aria-label="새 카드, 카페 같이 가요 카드 선택"]')!;
    const olderCard = container.querySelector<HTMLButtonElement>('button[aria-label="산책 같이 해요 카드 선택"]')!;
    expect(recentCard.textContent).toContain("새 카드");
    expect(olderCard.textContent).not.toContain("새 카드");
    await act(async () => recentCard.click());
    expect(onCardClick).toHaveBeenCalledExactlyOnceWith(cards[0]);
  });

  it("keeps newest sorting across gender tabs and refreshes", async () => {
    await render();
    await act(async () => sortButton("최신순").click());
    expect(sortButton("최신순").getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/board?sort=newest&gender=F", expect.any(Object));
    await render("M", 0);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/board?sort=newest&gender=M", expect.any(Object));
    await render("M", 1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sortButton("최신순").getAttribute("aria-pressed")).toBe("true");
  });

  it("does not let an older tab response replace the current cards", async () => {
    let resolveOld!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }));
    await render("F");
    await render("M");
    await act(async () => resolveOld(Response.json({ cards: [{ ...cards[0], one_liner: "늦은 응답" }] })));
    expect(container.textContent).not.toContain("늦은 응답");
    expect(container.textContent).toContain("카페 같이 가요");
  });
});
