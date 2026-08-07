import { sanitizeInstagramId, isValidInstagramId } from "@/lib/validation/instagram";
import { containsProfanity } from "@/lib/validation/profanity";
import { containsPhoneNumber } from "@/lib/validation/phone";
import { ONELINER_MAX_LENGTH, POSTIT_COLORS, type PostitColor } from "@/lib/constants";

export type CardFieldError =
  | "INVALID_ONELINER"
  | "PROFANITY_DETECTED"
  | "PHONE_DETECTED"
  | "INVALID_INSTAGRAM_ID"
  | "INVALID_COLOR";

type Result<T> =
  | { error: CardFieldError; value?: undefined }
  | { error?: undefined; value: T };

export function validateOneLiner(raw: unknown): Result<string> {
  if (typeof raw !== "string") return { error: "INVALID_ONELINER" };
  const value = raw.trim();
  // DB 제약은 char_length(= 코드포인트 수)를 쓴다. JS의 .length는 UTF-16 단위라
  // 이모지가 2로 세어져 20자 제한이 서로 어긋난다. 스프레드로 코드포인트를 센다.
  const length = [...value].length;
  if (length === 0 || length > ONELINER_MAX_LENGTH) return { error: "INVALID_ONELINER" };
  if (containsProfanity(value)) return { error: "PROFANITY_DETECTED" };
  if (containsPhoneNumber(value)) return { error: "PHONE_DETECTED" };
  return { value };
}

export function validateInstagramId(raw: unknown): Result<string> {
  if (typeof raw !== "string") return { error: "INVALID_INSTAGRAM_ID" };
  const value = sanitizeInstagramId(raw);
  if (!isValidInstagramId(value)) return { error: "INVALID_INSTAGRAM_ID" };
  return { value };
}

export function validateColor(raw: unknown): Result<PostitColor> {
  if (typeof raw !== "string" || !POSTIT_COLORS.includes(raw as PostitColor)) {
    return { error: "INVALID_COLOR" };
  }
  return { value: raw as PostitColor };
}
