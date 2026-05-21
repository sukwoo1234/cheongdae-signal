export const ALLOWED_EMAIL_DOMAIN = "cju.ac.kr";

export const POSTIT_COLORS = ["yellow", "pink", "green", "blue", "purple", "orange"] as const;
export type PostitColor = (typeof POSTIT_COLORS)[number];

export const POSTIT_COLOR_HEX: Record<PostitColor, string> = {
  yellow: "#fff3b0",
  pink: "#ffd6e0",
  green: "#c8e6c9",
  blue: "#b3e5fc",
  purple: "#e1bee7",
  orange: "#ffccbc",
};

export const ONELINER_MAX_LENGTH = 20;
export const INSTAGRAM_ID_REGEX = /^[a-zA-Z0-9._]{1,30}$/;
export const PHONE_REGEX = /0\d{1,2}-?\d{3,4}-?\d{4}/;

export const DEFAULT_THRESHOLD = 5;
export const MAGIC_LINK_TTL_MINUTES = 15;
export const MAGIC_LINK_RESEND_COOLDOWN_SEC = 60;

export const RATIO_WARN_THRESHOLD = 0.6;
export const RATIO_CRITICAL_THRESHOLD = 0.75;

export const COUNTDOWN_NOTICE_HOURS = [24, 1] as const;

export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@example.com";
