import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe.each(["magic-link.html", "confirmation.html"])("%s", (file) => {
  const html = readFileSync(resolve(process.cwd(), "supabase", "templates", file), "utf8");

  it("routes the token hash through the app callback without a scanner-consumable confirmation URL", () => {
    expect(html).toContain("{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email");
    expect(html).not.toContain("{{ .ConfirmationURL }}");
  });

  it("identifies the service as independently operated", () => {
    expect(html).toContain("청주대학교 총학생회가 주관·주최하는 공식 사업이 아닌");
    expect(html).toContain("학생 개인 운영 서비스입니다.");
  });

  it("uses the campus background and redesigned signal email layout", () => {
    expect(html).toContain("https://cheongdae-signal.vercel.app/hero-campus.webp");
    expect(html).toContain("좋은 인연이");
    expect(html).toContain("참여할</span> 준비가 됐어요.");
    expect(html).toContain("버튼이 열리지 않나요?");
  });
});
