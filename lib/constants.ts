export const ALLOWED_EMAIL_DOMAIN = "cju.ac.kr";

export const SERVICE_NAME = "청대 시그널";
export const SERVICE_TAGLINE = "한 줄로 시작하는 인스타 매칭";
export const SERVICE_SUBTITLE = "청주대학교 학생 전용";

// 개인정보 처리방침에 표기하는 문의 창구.
// 운영자 개인 메일이 아니라 서비스 전용 주소를 쓴다 — 개인정보보호법상
// 보호책임자는 "성명 또는 담당부서의 명칭과 연락처"로 갈음할 수 있다.
export const CONTACT_TEAM_NAME = "청대 시그널 운영팀";
export const CONTACT_EMAIL = "cheongdaesignal@gmail.com";

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

// 매직링크 발송 서버측 한도.
// 이메일 기준: 개인 메일함이 폭탄 맞지 않게. 이 값은 넉넉히 잡을 이유가 없다.
export const MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR = 5;
// IP 기준: 이메일 주소를 바꿔가며 도는 스크립트를 막는 용도.
// 주의 — 교내 와이파이는 수백 명이 같은 공인 IP를 쓴다(NAT). 너무 조이면
// 행사 초반 몰릴 때 정상 학생이 막힌다. 막혔다는 문의가 나오면 이 값을 올릴 것.
export const MAGIC_LINK_MAX_PER_IP_PER_HOUR = 60;
export const MAGIC_LINK_IP_COOLDOWN_SEC = 3;

export const RATIO_WARN_THRESHOLD = 0.6;
export const RATIO_CRITICAL_THRESHOLD = 0.75;

export const COUNTDOWN_NOTICE_HOURS = [24, 1] as const;
