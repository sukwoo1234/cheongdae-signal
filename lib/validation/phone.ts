import { PHONE_REGEX } from "@/lib/constants";

export function containsPhoneNumber(text: string): boolean {
  // 전각 숫자(NFKC 정규화)와 흔한 구분자(. _ - 공백 괄호)를 제거한 뒤 검사한다.
  // 그러지 않으면 010.1234.5678 / 010_1234_5678 같은 표기가 그대로 통과한다.
  const normalized = text.normalize("NFKC").replace(/[\s.\-_()]/g, "");
  return PHONE_REGEX.test(normalized);
}
