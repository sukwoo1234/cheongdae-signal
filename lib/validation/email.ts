import { ALLOWED_EMAIL_DOMAIN } from "@/lib/constants";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isAllowedCJUEmail(email: string): boolean {
  if (!email || !EMAIL_REGEX.test(email)) return false;
  const lower = email.toLowerCase();
  const [, domain] = lower.split("@");
  return domain === ALLOWED_EMAIL_DOMAIN;
}
