import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("my card deletion confirmation", () => {
  const source = readFileSync(resolve(process.cwd(), "app", "my", "card", "page.tsx"), "utf8");

  it("uses the concise deletion question", () => {
    expect(source).toContain('confirm("계정·카드·매칭 정보를 삭제할까요?")');
    expect(source).not.toContain("행사 내 중복 이용 방지 기록은 행사 폐기 시 함께 삭제됩니다.");
  });
});
