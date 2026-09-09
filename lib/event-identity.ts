import { createHmac } from "node:crypto";

const MIN_HMAC_KEY_LENGTH = 32;

/**
 * 같은 행사에서 같은 인증 이메일을 다시 알아보기 위한 가명 식별값.
 * 원문 이메일과 키는 DB에 저장하지 않고, 행사 ID가 바뀌면 결과도 바뀐다.
 */
export function createEventSubjectKey(eventId: string, email: string): string {
  const secret = process.env.EVENT_IDENTITY_HMAC_KEY?.trim();
  if (!secret || secret.length < MIN_HMAC_KEY_LENGTH) {
    throw new Error("EVENT_IDENTITY_HMAC_KEY_NOT_CONFIGURED");
  }

  return createHmac("sha256", secret)
    .update(`${eventId}:${email.trim().toLowerCase()}`)
    .digest("hex");
}
