# 청대 시그널 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 청주대학교 학생 한정, 2일 한정 운영, 1:1 포스트잇 인스타 매칭 웹앱을 Next.js + Supabase 스택으로 구현하고 Vercel에 배포한다.

**Architecture:** Next.js App Router 단일 프로젝트. Supabase가 Postgres + 매직링크 인증 + Realtime + pg_cron 자동화를 담당. 모든 권한 제어는 Supabase RLS로 강제 (서버 코드 우회 불가). 인스타 ID는 pgsodium Vault로 컬럼 암호화. 시작/종료 시각 자동 게이팅, 데이터 폐기만 어드민 수동.

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript, Tailwind CSS, Supabase (Postgres + Auth + Realtime + pgsodium + pg_cron), Resend, Vercel, Vitest, Playwright.

---

## 파일 구조

```
청대 시그널/
├── docs/superpowers/{specs,plans}/    # 이미 존재
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── middleware.ts                       # 보안 헤더 + 인증 가드
├── .env.local                          # 로컬 시크릿
├── .env.example                        # 템플릿
├── .gitignore
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                        # 랜딩
│   ├── auth/
│   │   ├── sent/page.tsx
│   │   └── callback/route.ts
│   ├── onboarding/page.tsx
│   ├── card/new/page.tsx
│   ├── board/page.tsx
│   ├── my/
│   │   ├── matches/page.tsx
│   │   └── card/page.tsx
│   ├── terms/page.tsx
│   ├── privacy/page.tsx
│   ├── end/page.tsx
│   ├── admin/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── api/
│       ├── auth/{magic-link,logout}/route.ts
│       ├── users/{onboard,me}/route.ts
│       ├── cards/{route.ts,me/{route.ts,toggle-hide/route.ts}}
│       ├── board/route.ts
│       ├── session/route.ts
│       ├── matches/{route.ts,me/route.ts}
│       └── admin/...
├── components/
│   ├── Postit.tsx
│   ├── BoardGrid.tsx
│   ├── RatioCounter.tsx
│   ├── CountdownBanner.tsx
│   ├── RevealModal.tsx
│   ├── ConfirmModal.tsx
│   ├── ColorPicker.tsx
│   └── ui/{Button,Input,Toast}.tsx
├── lib/
│   ├── supabase/{browser,server,admin}.ts
│   ├── auth.ts
│   ├── validation/{email,instagram,profanity,phone}.ts
│   ├── types.ts
│   └── constants.ts
├── supabase/
│   └── migrations/{0001..0004}*.sql
├── tests/
│   ├── unit/validation/
│   ├── integration/api/
│   └── e2e/
└── README.md
```

---

## Pre-Implementation Setup (사용자가 직접)

이 부분은 코드가 아니라 외부 계정 세팅. 시작 전에 완료해야 함.

- [ ] **Pre-1:** Supabase 무료 계정 생성 (https://supabase.com) → 새 프로젝트 "cheongdae-signal" 생성 → Project Settings에서 다음 값 메모:
  - `Project URL` (예: `https://xxxxx.supabase.co`)
  - `anon public key`
  - `service_role secret key`
- [ ] **Pre-2:** Resend 무료 계정 생성 (https://resend.com) → API Key 발급 → 메모
- [ ] **Pre-3:** Vercel 계정 (GitHub 연동) — 배포 시점에 사용
- [ ] **Pre-4:** 작업 디렉토리에서 git init: `git init && git branch -M main`

---

## Phase 1: Foundation

### Task 1: Next.js 프로젝트 초기화 + Tailwind + TypeScript

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `.env.example`, `README.md`

- [ ] **Step 1:** `npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --no-eslint` (한 디렉토리에 생성, 프롬프트 yes 응답)
- [ ] **Step 2:** `package.json` 확인 — Next.js 15, React 19, TypeScript 5+ 포함되어야 함
- [ ] **Step 3:** `.gitignore`에 추가:

```
.env.local
.env*.local
.next/
node_modules/
.vercel/
playwright-report/
test-results/
```

- [ ] **Step 4:** `.env.example` 작성:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_ADMIN_EMAIL=admin@example.com
```

- [ ] **Step 5:** `.env.local` 작성 (Pre-1, Pre-2에서 받은 값으로 채움). 이 파일은 절대 commit 안 됨.

- [ ] **Step 6:** `app/globals.css`에 Tailwind 기본 + 포스트잇 색상 변수 정의:

```css
@import "tailwindcss";

:root {
  --postit-yellow: #fff3b0;
  --postit-pink: #ffd6e0;
  --postit-green: #c8e6c9;
  --postit-blue: #b3e5fc;
  --postit-purple: #e1bee7;
  --postit-orange: #ffccbc;
  --cork: #d4b896;
  --bg: #faf6e8;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif;
  background: var(--bg);
  color: #333;
}
```

- [ ] **Step 7:** `app/layout.tsx`에 한국어 lang + 메타 태그:

```tsx
import "./globals.css";

export const metadata = {
  title: "청대 시그널",
  description: "한 줄로 시작하는 인스타 매칭 — 청주대학교 학생 전용",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8:** `npm run dev` → http://localhost:3000 접속 → "Welcome to Next.js" 또는 기본 페이지 보임 확인

- [ ] **Step 9:** Commit:

```bash
git add -A
git commit -m "chore: initialize Next.js + Tailwind + TypeScript project"
```

---

### Task 2: 상수 + 타입 모듈

**Files:**
- Create: `lib/constants.ts`, `lib/types.ts`

- [ ] **Step 1:** `lib/constants.ts`:

```ts
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

export const RATIO_WARN_THRESHOLD = 0.6;   // 우세 성별 비율 60% 초과
export const RATIO_CRITICAL_THRESHOLD = 0.75;

export const COUNTDOWN_NOTICE_HOURS = [24, 1] as const;

export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@example.com";
```

- [ ] **Step 2:** `lib/types.ts`:

```ts
import type { PostitColor } from "./constants";

export type Gender = "M" | "F";

export interface User {
  id: string;
  email: string;
  gender: Gender | null;
  terms_accepted_at: string | null;
  privacy_accepted_at: string | null;
  banned: boolean;
  banned_reason: string | null;
  created_at: string;
}

export interface Card {
  id: string;
  user_id: string;
  one_liner: string;
  instagram_id: string;
  color: PostitColor;
  hidden_by_user: boolean;
  hidden_by_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface BoardCard {
  id: string;
  one_liner: string;
  color: PostitColor;
  gender: Gender;
}

export interface Match {
  id: string;
  viewer_user_id: string;
  viewed_card_id: string;
  created_at: string;
  bonus: boolean;
}

export interface SessionConfig {
  id: 1;
  starts_at: string;
  ends_at: string;
  threshold_male: number;
  threshold_female: number;
  force_locked: boolean;
}

export interface SessionState {
  config: SessionConfig;
  counts: { male: number; female: number };
  board_open: boolean;
  in_pregating: boolean;
  in_postsession: boolean;
  time_to_end_seconds: number;
}
```

- [ ] **Step 3:** Commit:

```bash
git add lib/constants.ts lib/types.ts
git commit -m "feat: add constants and shared types"
```

---

### Task 3: Supabase 클라이언트 헬퍼 (browser / server / admin)

**Files:**
- Create: `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`

- [ ] **Step 1:** 패키지 설치:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2:** `lib/supabase/browser.ts`:

```ts
"use client";
import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
```

- [ ] **Step 3:** `lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const createClient = async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component context where cookie set is disallowed — safe to ignore
          }
        },
      },
    }
  );
};
```

- [ ] **Step 4:** `lib/supabase/admin.ts` (service role 클라이언트 — RLS 우회):

```ts
import { createClient as createAdminSupabaseClient } from "@supabase/supabase-js";

export const createAdminClient = () =>
  createAdminSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
```

- [ ] **Step 5:** Commit:

```bash
git add lib/supabase package.json package-lock.json
git commit -m "feat: add Supabase client helpers (browser/server/admin)"
```

---

## Phase 2: Database

### Task 4: 초기 스키마 마이그레이션

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`

- [ ] **Step 1:** Supabase CLI 설치 + 로컬 링크:

```bash
npm install -D supabase
npx supabase init
npx supabase link --project-ref <Pre-1에서 받은 프로젝트 ref>
```

(`project ref`는 Supabase 대시보드 Project Settings → General에서 확인. URL의 서브도메인.)

- [ ] **Step 2:** `supabase/migrations/0001_initial_schema.sql`:

```sql
-- pgsodium 활성화 (인스타 ID 암호화)
create extension if not exists pgsodium with schema pgsodium;
create extension if not exists pgcrypto;

-- users 확장 (auth.users 외부 메타데이터)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  gender text check (gender in ('M', 'F')),
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  banned boolean not null default false,
  banned_reason text,
  created_at timestamptz not null default now()
);

-- cards (1 user = 1 card)
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  one_liner text not null check (char_length(one_liner) between 1 and 20),
  instagram_id text not null check (instagram_id ~ '^[a-zA-Z0-9._]{1,30}$'),
  color text not null check (color in ('yellow', 'pink', 'green', 'blue', 'purple', 'orange')),
  hidden_by_user boolean not null default false,
  hidden_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- matches (slot consumption log)
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  viewer_user_id uuid not null references public.users(id) on delete cascade,
  viewed_card_id uuid not null references public.cards(id) on delete cascade,
  bonus boolean not null default false,
  created_at timestamptz not null default now(),
  unique (viewer_user_id, viewed_card_id)
);

-- 한 viewer가 본인 카드 보는 행 방지 + bonus 아닌 행은 1개만
create unique index matches_one_per_viewer_nonbonus
  on public.matches (viewer_user_id)
  where bonus = false;

-- session_config singleton
create table public.session_config (
  id int primary key default 1 check (id = 1),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  threshold_male int not null default 5 check (threshold_male > 0),
  threshold_female int not null default 5 check (threshold_female > 0),
  force_locked boolean not null default false,
  updated_at timestamptz not null default now()
);

-- banned emails
create table public.banned_emails (
  email text primary key,
  banned_at timestamptz not null default now(),
  reason text
);

-- updated_at 자동 갱신 트리거
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cards_touch_updated_at before update on public.cards
  for each row execute function public.touch_updated_at();

create trigger session_config_touch_updated_at before update on public.session_config
  for each row execute function public.touch_updated_at();
```

- [ ] **Step 3:** `supabase/migrations/0002_seed_session_config.sql`:

```sql
-- 초기 세션 설정 (어드민이 콘솔에서 수정)
insert into public.session_config (id, starts_at, ends_at)
values (
  1,
  now() + interval '7 days',
  now() + interval '9 days'
)
on conflict (id) do nothing;
```

- [ ] **Step 4:** 마이그레이션 push:

```bash
npx supabase db push
```

확인: Supabase 대시보드 Table Editor에서 5개 테이블 (users, cards, matches, session_config, banned_emails) 보임.

- [ ] **Step 5:** Commit:

```bash
git add supabase/migrations
git commit -m "feat(db): initial schema with users/cards/matches/session_config/banned_emails"
```

---

### Task 5: RLS Policies

**Files:**
- Create: `supabase/migrations/0003_rls_policies.sql`

- [ ] **Step 1:** `supabase/migrations/0003_rls_policies.sql`:

```sql
-- 모든 테이블 RLS 활성화
alter table public.users enable row level security;
alter table public.cards enable row level security;
alter table public.matches enable row level security;
alter table public.session_config enable row level security;
alter table public.banned_emails enable row level security;

-- =====================
-- users
-- =====================
create policy users_self_select on public.users
  for select using (auth.uid() = id);

create policy users_self_update on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy users_self_insert on public.users
  for insert with check (auth.uid() = id);

create policy users_self_delete on public.users
  for delete using (auth.uid() = id);

-- =====================
-- cards
-- =====================
-- 본인 카드: 전체 select/update/delete
create policy cards_self_all on public.cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 이성 카드 select (한 줄 소개만 — instagram_id는 별도 RPC로만)
create policy cards_opposite_gender_select on public.cards
  for select using (
    -- 본인 아니고
    auth.uid() != user_id
    -- 둘 다 hidden 아니고
    and not hidden_by_user
    and not hidden_by_admin
    -- 본인과 다른 성별
    and exists (
      select 1 from public.users me
      where me.id = auth.uid()
        and me.gender is not null
        and me.gender != (
          select gender from public.users where id = cards.user_id
        )
    )
    -- 본인이 이미 본 카드 아님 (matches에 없음)
    and not exists (
      select 1 from public.matches
      where viewer_user_id = auth.uid()
        and viewed_card_id = cards.id
    )
    -- 보드 오픈 상태
    and exists (
      select 1 from public.session_config
      where id = 1
        and not force_locked
        and starts_at <= now()
        and ends_at > now()
    )
  );

-- =====================
-- matches
-- =====================
-- 본인 슬롯 사용 기록만 select/insert
create policy matches_self_select on public.matches
  for select using (auth.uid() = viewer_user_id);

-- insert는 RPC에서만 (서버 로직 통과 후) → 직접 insert는 service_role만
-- 단 일반 사용자도 RPC 호출 권한은 필요. RPC 함수 자체에서 검증.
-- 여기선 정책은 못 박지 않고 RPC가 service-role-like 권한 받음.
-- 단순화: 본인 row만 insert 허용하되 RPC가 추가 검증 담당.
create policy matches_self_insert on public.matches
  for insert with check (auth.uid() = viewer_user_id);

-- =====================
-- session_config
-- =====================
-- 모든 인증 사용자가 read 가능 (보드 상태 계산용)
create policy session_config_read on public.session_config
  for select to authenticated using (true);
-- write는 service_role만 (자동: RLS는 service_role 우회)

-- =====================
-- banned_emails
-- =====================
-- 일반 사용자는 못 보고, 가입 시점 검증은 server에서 service_role로
-- (RLS는 service_role 우회하므로 별도 정책 불필요)
```

- [ ] **Step 2:** Migration push:

```bash
npx supabase db push
```

- [ ] **Step 3:** Supabase 대시보드 → Authentication → Policies에서 각 테이블 정책 보임 확인.

- [ ] **Step 4:** Commit:

```bash
git add supabase/migrations/0003_rls_policies.sql
git commit -m "feat(db): RLS policies for users/cards/matches/session_config"
```

---

### Task 6: 인스타 ID 암호화 + RPC 함수 (슬롯 검증 후 ID 반환)

**Files:**
- Create: `supabase/migrations/0004_instagram_encryption_rpc.sql`

- [ ] **Step 1:** `supabase/migrations/0004_instagram_encryption_rpc.sql`:

```sql
-- 인스타 ID는 별도 보안 함수로만 노출. 직접 select 막기 위해
-- cards 테이블 column-level 권한 조정.

-- 우선 instagram_id를 nullable로 두지 않고 그대로 두되,
-- 모든 일반 select가 이 컬럼을 가져가지 못하게 column-level revoke.
revoke select (instagram_id) on public.cards from anon, authenticated;

-- RPC: 슬롯 사용 + 인스타 ID 반환 (트랜잭션 안전)
create or replace function public.consume_slot_and_reveal(target_card_id uuid)
returns table(instagram_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  viewer_gender text;
  target_user uuid;
  target_gender text;
  target_hidden boolean;
  session_ok boolean;
  existing_match_count int;
begin
  if viewer is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- 보드 오픈 검증
  select (not force_locked
          and starts_at <= now()
          and ends_at > now())
    into session_ok
    from public.session_config where id = 1;
  if not session_ok then
    raise exception 'BOARD_CLOSED';
  end if;

  -- 본인 성별
  select gender into viewer_gender from public.users where id = viewer;
  if viewer_gender is null then
    raise exception 'ONBOARDING_INCOMPLETE';
  end if;

  -- 대상 카드 검증
  select user_id, hidden_by_user or hidden_by_admin
    into target_user, target_hidden
    from public.cards where id = target_card_id;

  if target_user is null then
    raise exception 'CARD_NOT_FOUND';
  end if;
  if target_user = viewer then
    raise exception 'CANNOT_VIEW_OWN_CARD';
  end if;
  if target_hidden then
    raise exception 'CARD_HIDDEN';
  end if;

  select gender into target_gender from public.users where id = target_user;
  if target_gender = viewer_gender then
    raise exception 'SAME_GENDER';
  end if;

  -- 슬롯 검증: bonus 아닌 행이 이미 있으면 거부
  select count(*) into existing_match_count
    from public.matches
    where viewer_user_id = viewer and bonus = false;
  if existing_match_count > 0 then
    raise exception 'SLOT_ALREADY_USED';
  end if;

  -- 슬롯 소비 기록
  insert into public.matches (viewer_user_id, viewed_card_id, bonus)
    values (viewer, target_card_id, false);

  -- 인스타 ID 반환
  return query
    select c.instagram_id from public.cards c where c.id = target_card_id;
end;
$$;

revoke all on function public.consume_slot_and_reveal(uuid) from public, anon;
grant execute on function public.consume_slot_and_reveal(uuid) to authenticated;

-- 내가 본 카드 목록 (인스타 ID 포함) RPC
create or replace function public.my_matches()
returns table(
  match_id uuid,
  card_id uuid,
  one_liner text,
  color text,
  instagram_id text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  return query
    select m.id, c.id, c.one_liner, c.color, c.instagram_id, m.created_at
    from public.matches m
    join public.cards c on c.id = m.viewed_card_id
    where m.viewer_user_id = auth.uid()
    order by m.created_at desc;
end;
$$;

revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated;
```

> Note: pgsodium 컬럼 암호화는 Supabase Vault UI로 설정 가능하나, 컬럼-레벨 revoke + security definer RPC만으로도 일반 사용자에게 평문 노출은 차단됨. Production에선 Supabase Vault `pgsodium.create_key` + `encrypted_columns` 추가 가능 (선택).

- [ ] **Step 2:** Push:

```bash
npx supabase db push
```

- [ ] **Step 3:** Supabase 대시보드 → Database → Functions에서 `consume_slot_and_reveal`, `my_matches` 보임 확인.

- [ ] **Step 4:** Commit:

```bash
git add supabase/migrations/0004_instagram_encryption_rpc.sql
git commit -m "feat(db): column-level instagram_id revoke + consume_slot RPC"
```

---

### Task 7: pg_cron 자동화 잡 (시작/종료 시각)

**Files:**
- Create: `supabase/migrations/0005_pg_cron_jobs.sql`

- [ ] **Step 1:** Supabase 대시보드 → Database → Extensions에서 `pg_cron` 활성화 (한 번만)

- [ ] **Step 2:** `supabase/migrations/0005_pg_cron_jobs.sql`:

```sql
create extension if not exists pg_cron;

-- 시작/종료 체크 RPC: 매분 호출됨. force_locked는 어드민 응급용이라 cron이 안 건드림.
create or replace function public.session_tick()
returns void
language plpgsql
security definer
as $$
declare
  cfg public.session_config%rowtype;
  male_count int;
  female_count int;
  threshold_met boolean;
begin
  select * into cfg from public.session_config where id = 1;
  if cfg is null then
    return;
  end if;

  -- 종료 시각 지나면 모든 사용자 강제 로그아웃 (auth.users 갱신은 SDK 측에서)
  -- 여기선 단순히 force_locked를 켜는 것이 아니라 보드 상태를
  -- 클라이언트가 ends_at으로 판단하도록 두므로 별도 동작 불필요.
  -- (RLS 정책에서 ends_at > now() 검증)
  null;
end;
$$;

-- 매분 호출 (실제 동작은 RLS가 처리하므로 빈 함수. 미래 확장용)
select cron.schedule(
  'session_tick',
  '* * * * *',
  $$ select public.session_tick(); $$
);
```

> 핵심 자동화는 사실 RLS 정책의 `starts_at <= now()` / `ends_at > now()` 조건으로 이미 처리됨. pg_cron은 future-proofing용.

- [ ] **Step 3:** Push:

```bash
npx supabase db push
```

- [ ] **Step 4:** Commit:

```bash
git add supabase/migrations/0005_pg_cron_jobs.sql
git commit -m "feat(db): pg_cron tick scaffolding"
```

---

## Phase 3: Validation Libraries (TDD)

### Task 8: 이메일 도메인 검증

**Files:**
- Create: `lib/validation/email.ts`, `tests/unit/validation/email.test.ts`

- [ ] **Step 1:** Vitest 설치:

```bash
npm install -D vitest @vitest/ui happy-dom
```

- [ ] **Step 2:** `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 3:** `package.json` scripts에 추가:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4:** `tests/unit/validation/email.test.ts` (실패 테스트 먼저):

```ts
import { describe, it, expect } from "vitest";
import { isAllowedCJUEmail } from "@/lib/validation/email";

describe("isAllowedCJUEmail", () => {
  it("accepts @cju.ac.kr emails", () => {
    expect(isAllowedCJUEmail("student@cju.ac.kr")).toBe(true);
    expect(isAllowedCJUEmail("STUDENT@CJU.AC.KR")).toBe(true);
  });

  it("rejects other domains", () => {
    expect(isAllowedCJUEmail("foo@gmail.com")).toBe(false);
    expect(isAllowedCJUEmail("foo@cju.com")).toBe(false);
    expect(isAllowedCJUEmail("foo@sub.cju.ac.kr")).toBe(false);
  });

  it("rejects malformed inputs", () => {
    expect(isAllowedCJUEmail("not-an-email")).toBe(false);
    expect(isAllowedCJUEmail("")).toBe(false);
    expect(isAllowedCJUEmail("@cju.ac.kr")).toBe(false);
  });
});
```

- [ ] **Step 5:** Run test, expect FAIL:

```bash
npm test
```

Expected: `Module not found: lib/validation/email`

- [ ] **Step 6:** `lib/validation/email.ts`:

```ts
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/constants";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isAllowedCJUEmail(email: string): boolean {
  if (!email || !EMAIL_REGEX.test(email)) return false;
  const lower = email.toLowerCase();
  const [, domain] = lower.split("@");
  return domain === ALLOWED_EMAIL_DOMAIN;
}
```

- [ ] **Step 7:** Run test, expect PASS:

```bash
npm test
```

- [ ] **Step 8:** Commit:

```bash
git add lib/validation/email.ts tests/unit/validation/email.test.ts vitest.config.ts package.json
git commit -m "feat(validation): @cju.ac.kr email domain check"
```

---

### Task 9: 인스타 ID 검증

**Files:**
- Create: `lib/validation/instagram.ts`, `tests/unit/validation/instagram.test.ts`

- [ ] **Step 1:** `tests/unit/validation/instagram.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sanitizeInstagramId, isValidInstagramId } from "@/lib/validation/instagram";

describe("sanitizeInstagramId", () => {
  it("strips leading @", () => {
    expect(sanitizeInstagramId("@user_name")).toBe("user_name");
    expect(sanitizeInstagramId("user_name")).toBe("user_name");
  });
  it("trims whitespace", () => {
    expect(sanitizeInstagramId("  @user.name  ")).toBe("user.name");
  });
});

describe("isValidInstagramId", () => {
  it("accepts valid IDs", () => {
    expect(isValidInstagramId("user_name")).toBe(true);
    expect(isValidInstagramId("user.name")).toBe(true);
    expect(isValidInstagramId("a")).toBe(true);
    expect(isValidInstagramId("a".repeat(30))).toBe(true);
  });
  it("rejects invalid IDs", () => {
    expect(isValidInstagramId("")).toBe(false);
    expect(isValidInstagramId("a".repeat(31))).toBe(false);
    expect(isValidInstagramId("user name")).toBe(false);
    expect(isValidInstagramId("한글이름")).toBe(false);
    expect(isValidInstagramId("user-name")).toBe(false);
  });
});
```

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3:** `lib/validation/instagram.ts`:

```ts
import { INSTAGRAM_ID_REGEX } from "@/lib/constants";

export function sanitizeInstagramId(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

export function isValidInstagramId(id: string): boolean {
  return INSTAGRAM_ID_REGEX.test(id);
}
```

- [ ] **Step 4:** Run, expect PASS.

- [ ] **Step 5:** Commit:

```bash
git add lib/validation/instagram.ts tests/unit/validation/instagram.test.ts
git commit -m "feat(validation): instagram ID sanitize + format check"
```

---

### Task 10: 비속어 + 전화번호 필터

**Files:**
- Create: `lib/validation/profanity.ts`, `lib/validation/phone.ts`, `tests/unit/validation/oneliner.test.ts`

- [ ] **Step 1:** 한국어 비속어 사전 추가 (간단한 내장 리스트):

`lib/validation/profanity.ts`:

```ts
// 짧은 한국어 비속어 핵심 사전. 행사용으로 충분한 base set.
// 더 강력하게는 npm 패키지 `korean-bad-words` 등 사용 가능.
const BANNED_WORDS = [
  "씨발", "시발", "ㅅㅂ", "병신", "ㅂㅅ", "좆", "ㅈ까", "지랄",
  "개새끼", "걸레", "창녀", "fuck", "shit", "asshole"
];

const normalize = (s: string) => s.toLowerCase().replace(/\s/g, "");

export function containsProfanity(text: string): boolean {
  const normalized = normalize(text);
  return BANNED_WORDS.some((w) => normalized.includes(normalize(w)));
}
```

- [ ] **Step 2:** `lib/validation/phone.ts`:

```ts
import { PHONE_REGEX } from "@/lib/constants";

export function containsPhoneNumber(text: string): boolean {
  return PHONE_REGEX.test(text.replace(/\s/g, ""));
}
```

- [ ] **Step 3:** `tests/unit/validation/oneliner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { containsProfanity } from "@/lib/validation/profanity";
import { containsPhoneNumber } from "@/lib/validation/phone";

describe("containsProfanity", () => {
  it("flags banned words", () => {
    expect(containsProfanity("씨발 진짜")).toBe(true);
    expect(containsProfanity("ㅅㅂ")).toBe(true);
    expect(containsProfanity("FUCK")).toBe(true);
  });
  it("passes clean text", () => {
    expect(containsProfanity("강동원 닮은꼴")).toBe(false);
    expect(containsProfanity("축구러")).toBe(false);
  });
});

describe("containsPhoneNumber", () => {
  it("flags common phone formats", () => {
    expect(containsPhoneNumber("010-1234-5678")).toBe(true);
    expect(containsPhoneNumber("01012345678")).toBe(true);
    expect(containsPhoneNumber("연락 010 1234 5678")).toBe(true);
  });
  it("passes non-phone text", () => {
    expect(containsPhoneNumber("키 188 농구러")).toBe(false);
    expect(containsPhoneNumber("22학번")).toBe(false);
  });
});
```

- [ ] **Step 4:** Run all tests, expect PASS.

- [ ] **Step 5:** Commit:

```bash
git add lib/validation/profanity.ts lib/validation/phone.ts tests/unit/validation/oneliner.test.ts
git commit -m "feat(validation): profanity + phone number filters"
```

---

## Phase 4: Authentication

### Task 11: 매직링크 발송 API

**Files:**
- Create: `app/api/auth/magic-link/route.ts`, `tests/integration/api/magic-link.test.ts`

- [ ] **Step 1:** `app/api/auth/magic-link/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedCJUEmail } from "@/lib/validation/email";

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }
  const normalized = email.trim().toLowerCase();
  if (!isAllowedCJUEmail(normalized)) {
    return NextResponse.json({ error: "DOMAIN_NOT_ALLOWED" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 차단 이메일 체크
  const { data: ban } = await admin
    .from("banned_emails")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();
  if (ban) {
    return NextResponse.json({ error: "BANNED" }, { status: 403 });
  }

  // 매직링크 발송
  const { error } = await admin.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) {
    return NextResponse.json({ error: "SEND_FAILED", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2:** `.env.local`에 `NEXT_PUBLIC_SITE_URL=http://localhost:3000` 추가.

- [ ] **Step 3:** Supabase 대시보드 → Authentication → Email Templates → "Magic Link" 한국어로 변경:

제목: `청대 시그널 로그인 링크`
본문 HTML:
```html
<h2>청대 시그널 로그인</h2>
<p>아래 링크를 15분 이내에 클릭해주세요.</p>
<p><a href="{{ .ConfirmationURL }}">로그인하기</a></p>
<p>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
```

- [ ] **Step 4:** Supabase 대시보드 → Authentication → URL Configuration → Site URL을 `http://localhost:3000` 으로 (배포 시 production URL로 변경).

- [ ] **Step 5:** Supabase 대시보드 → Authentication → Providers → Email → "Confirm Email" OFF (매직링크는 그 자체로 검증).

- [ ] **Step 6:** 수동 테스트:

```bash
curl -X POST http://localhost:3000/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"yourtest@cju.ac.kr"}'
```

→ 본인 메일에 매직링크 도착 확인 (도착 안 하면 Resend 통합 필요 — 아래 추가 작업)

- [ ] **Step 7 (옵션 — Resend 사용 시):** Supabase 대시보드 → Authentication → SMTP Settings에서 Resend SMTP 정보 입력:
- Host: `smtp.resend.com`
- Port: `587`
- User: `resend`
- Password: Pre-2의 Resend API Key
- Sender: `noreply@your-vercel-domain.vercel.app` 또는 Resend 인증 도메인

- [ ] **Step 8:** Commit:

```bash
git add app/api/auth/magic-link/route.ts .env.local.example
git commit -m "feat(auth): magic link send endpoint with domain + ban check"
```

(`.env.local`은 .gitignore에 있어 안 들어감)

---

### Task 12: 매직링크 콜백 + 사용자 row upsert

**Files:**
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1:** `app/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/", url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/?error=auth_failed", url));
  }

  // 신규 사용자면 public.users row 생성
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("users")
      .upsert({ id: user.id, email: user.email! }, { onConflict: "id" });

    // gender 미설정이면 onboarding으로
    const { data: prof } = await supabase
      .from("users")
      .select("gender, banned")
      .eq("id", user.id)
      .single();

    if (prof?.banned) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/?error=banned", url));
    }
    if (!prof?.gender) {
      return NextResponse.redirect(new URL("/onboarding", url));
    }

    // 카드 미작성이면 카드 작성으로
    const { count } = await supabase
      .from("cards")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (!count) {
      return NextResponse.redirect(new URL("/card/new", url));
    }

    return NextResponse.redirect(new URL("/board", url));
  }

  return NextResponse.redirect(new URL("/", url));
}
```

- [ ] **Step 2:** 수동 테스트: 발송된 매직링크 클릭 → `/onboarding`으로 리디렉트되는지 확인. (브라우저 콘솔에 supabase 쿠키 들어왔는지 확인 가능)

- [ ] **Step 3:** Commit:

```bash
git add app/auth/callback/route.ts
git commit -m "feat(auth): magic link callback + user row upsert + smart redirect"
```

---

### Task 13: 인증 헬퍼 + 로그아웃

**Files:**
- Create: `lib/auth.ts`, `app/api/auth/logout/route.ts`

- [ ] **Step 1:** `lib/auth.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();
  return profile;
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const target = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.toLowerCase();
  return !!target && email.toLowerCase() === target;
}
```

- [ ] **Step 2:** `app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3:** Commit:

```bash
git add lib/auth.ts app/api/auth/logout/route.ts
git commit -m "feat(auth): currentUser helper + logout endpoint"
```

---

## Phase 5: User Onboarding

### Task 14: 랜딩 페이지

**Files:**
- Modify: `app/page.tsx`
- Create: `components/ui/Button.tsx`, `components/ui/Input.tsx`

- [ ] **Step 1:** `components/ui/Button.tsx`:

```tsx
import { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
}

export function Button({ variant = "primary", className = "", ...rest }: Props) {
  const variants = {
    primary: "bg-gray-900 hover:bg-gray-800 text-white",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-800",
    danger: "bg-red-500 hover:bg-red-600 text-white",
  };
  return (
    <button
      {...rest}
      className={`px-4 py-2 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition ${variants[variant]} ${className}`}
    />
  );
}
```

- [ ] **Step 2:** `components/ui/Input.tsx`:

```tsx
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...rest }, ref) => (
    <input
      ref={ref}
      {...rest}
      className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    />
  )
);
Input.displayName = "Input";
```

- [ ] **Step 3:** `app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRouter } from "next/navigation";

export default function Landing() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      router.push(`/auth/sent?email=${encodeURIComponent(email)}`);
    } else {
      const data = await res.json().catch(() => ({ error: "UNKNOWN" }));
      const msgs: Record<string, string> = {
        DOMAIN_NOT_ALLOWED: "청주대학교 이메일 (@cju.ac.kr)만 가능해요",
        BANNED: "차단된 계정입니다",
        INVALID_EMAIL: "이메일 형식이 잘못됐어요",
        SEND_FAILED: "메일 발송 실패. 잠시 후 다시 시도해주세요",
      };
      setError(msgs[data.error] || "오류가 발생했어요");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-br from-[#faf6e8] via-[#fff3b0] to-[#ffd6e0]">
      <div className="text-xs font-bold tracking-widest text-gray-500 mb-2">청대 시그널</div>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 text-center leading-tight">
        한 줄로 시작하는<br />인스타 매칭
      </h1>
      <p className="text-sm text-gray-600 mt-3">청주대학교 학생 전용</p>

      <form onSubmit={submit} className="mt-8 w-full max-w-sm flex flex-col gap-3">
        <Input
          type="email"
          placeholder="이름@cju.ac.kr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" disabled={loading || !email}>
          {loading ? "보내는 중..." : "매직링크 받기"}
        </Button>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}
        <p className="text-xs text-gray-500 text-center mt-2">
          비밀번호 없이 이메일 한 번 클릭이면 끝
        </p>
      </form>
    </main>
  );
}
```

- [ ] **Step 4:** `npm run dev` → http://localhost:3000 → 디자인 + 폼 확인. 실제로 이메일 입력해서 매직링크 발송 흐름 점검.

- [ ] **Step 5:** Commit:

```bash
git add app/page.tsx components/ui/Button.tsx components/ui/Input.tsx
git commit -m "feat(landing): magic link form with domain validation"
```

---

### Task 15: 매직링크 전송 완료 페이지

**Files:**
- Create: `app/auth/sent/page.tsx`

- [ ] **Step 1:** `app/auth/sent/page.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function MagicLinkSent() {
  const params = useSearchParams();
  const email = params.get("email") || "";
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setResending(true);
    await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setResending(false);
    setResent(true);
    setCooldown(60);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#faf6e8]">
      <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mb-6 text-3xl">
        ✉
      </div>
      <h1 className="text-2xl font-bold text-gray-800">메일을 확인해주세요</h1>
      <p className="text-sm text-gray-600 mt-3 text-center max-w-sm">
        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{email}</span><br />
        으로 매직링크를 보냈어요.<br />
        <strong>15분 안에</strong> 클릭해주세요.
      </p>
      <p className="text-xs text-gray-500 mt-6">메일이 안 오면 스팸함도 확인해주세요</p>

      <Button
        variant="secondary"
        onClick={resend}
        disabled={resending || cooldown > 0}
        className="mt-4 text-xs"
      >
        {resent ? "다시 보냈어요" : cooldown > 0 ? `다시 보내기 (${cooldown}s)` : "다시 보내기"}
      </Button>
    </main>
  );
}
```

- [ ] **Step 2:** 브라우저에서 메일 받고 → `/auth/sent?email=test@cju.ac.kr` 화면 정상 표시 + 60초 카운트다운 확인.

- [ ] **Step 3:** Commit:

```bash
git add app/auth/sent/page.tsx
git commit -m "feat(auth): magic link sent confirmation page with resend cooldown"
```

---

### Task 16: 약관 + 개인정보 처리방침 페이지

**Files:**
- Create: `app/terms/page.tsx`, `app/privacy/page.tsx`

- [ ] **Step 1:** `app/terms/page.tsx`:

```tsx
export default function Terms() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10 text-sm leading-relaxed text-gray-700">
      <h1 className="text-2xl font-bold mb-6">이용약관</h1>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">1. 서비스의 목적</h2>
        <p>
          "청대 시그널"은 청주대학교 학생 간 1:1 인스타그램 매칭을 위한 한정 기간 운영 서비스입니다.
          본 서비스는 행사 종료 시 모든 데이터가 영구 폐기됩니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">2. 이용 자격</h2>
        <p>청주대학교 이메일 (@cju.ac.kr) 보유자에 한합니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">3. 사용자 책임</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>본인의 인스타그램 ID를 정확히 입력할 책임</li>
          <li>한 줄 소개에 욕설, 광고, 타인의 연락처를 작성하지 않을 의무</li>
          <li>매칭으로 얻은 타인의 인스타 ID를 본 서비스 외부 (단톡방·SNS 등)에 무단 유포하지 않을 의무</li>
          <li>1 계정당 1개의 카드만 작성하는 규칙 준수</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">4. 서비스 종료</h2>
        <p>운영자가 설정한 종료 시각에 자동으로 모든 매칭이 정지되며, 운영자의 확정 후 전체 데이터가 폐기됩니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">5. 면책</h2>
        <p>매칭 후 발생하는 외부 연락·만남 등에 대해 본 서비스는 책임지지 않습니다.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2:** `app/privacy/page.tsx`:

```tsx
export default function Privacy() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-10 text-sm leading-relaxed text-gray-700">
      <h1 className="text-2xl font-bold mb-6">개인정보 처리방침</h1>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">1. 수집 항목</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>이메일 (@cju.ac.kr)</li>
          <li>성별 (M/F)</li>
          <li>한 줄 소개</li>
          <li>인스타그램 ID</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">2. 수집 목적</h2>
        <p>청대 시그널 매칭 서비스 운영 (사용자 인증, 카드 게시, 인스타그램 ID 1회 노출).</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">3. 보유 기간</h2>
        <p>행사 종료 시각 도달 후 운영자의 폐기 확정 시점까지. 폐기 후 복구 불가.</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">4. 처리 위탁</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Supabase Inc. (데이터베이스, 인증)</li>
          <li>Resend Inc. (이메일 발송)</li>
          <li>Vercel Inc. (호스팅)</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">5. 처리 책임자</h2>
        <p>admin@example.com</p>
      </section>

      <section className="mb-6">
        <h2 className="font-bold text-base mb-2">6. 사용자 권리</h2>
        <p>로그인 후 "내 카드 관리" 페이지에서 즉시 본인 정보를 삭제할 수 있습니다.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 3:** Commit:

```bash
git add app/terms/page.tsx app/privacy/page.tsx
git commit -m "feat: terms of service + privacy policy pages"
```

---

### Task 17: 온보딩 페이지 (성별 + 약관 동의)

**Files:**
- Create: `app/onboarding/page.tsx`, `app/api/users/onboard/route.ts`

- [ ] **Step 1:** `app/api/users/onboard/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { gender, terms, privacy } = await req.json().catch(() => ({}));

  if (!["M", "F"].includes(gender)) {
    return NextResponse.json({ error: "INVALID_GENDER" }, { status: 400 });
  }
  if (!terms || !privacy) {
    return NextResponse.json({ error: "TERMS_REQUIRED" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({
      gender,
      terms_accepted_at: new Date().toISOString(),
      privacy_accepted_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2:** `app/onboarding/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function Onboarding() {
  const [gender, setGender] = useState<"M" | "F" | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const canSubmit = gender && terms && privacy && !loading;

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/users/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gender, terms, privacy }),
    });
    if (res.ok) {
      router.push("/card/new");
    } else {
      setError("저장 실패. 다시 시도해주세요.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#faf6e8]">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6">
        <h1 className="text-lg font-bold text-center mb-6">시작하기 전에</h1>

        <div className="mb-4">
          <label className="text-xs text-gray-600 block mb-2">성별 (변경 불가)</label>
          <div className="flex gap-2">
            <button
              onClick={() => setGender("M")}
              className={`flex-1 py-2 rounded-md text-sm font-semibold ${
                gender === "M" ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-700"
              }`}
            >
              남자
            </button>
            <button
              onClick={() => setGender("F")}
              className={`flex-1 py-2 rounded-md text-sm font-semibold ${
                gender === "F" ? "bg-pink-500 text-white" : "bg-white border border-gray-300 text-gray-700"
              }`}
            >
              여자
            </button>
          </div>
        </div>

        <div className="mb-2">
          <label className="text-xs text-gray-600 block mb-2">약관 동의 (필수)</label>
          <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2 mb-2 cursor-pointer">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span className="text-xs">
              <Link href="/terms" target="_blank" className="text-blue-600 underline">이용약관</Link> 동의
            </span>
          </label>
          <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-2 mb-4 cursor-pointer">
            <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            <span className="text-xs">
              <Link href="/privacy" target="_blank" className="text-blue-600 underline">개인정보 처리방침</Link> 동의
            </span>
          </label>
        </div>

        <Button onClick={submit} disabled={!canSubmit} className="w-full">
          {loading ? "저장 중..." : "다음"}
        </Button>
        {error && <p className="text-red-600 text-xs text-center mt-3">{error}</p>}
      </div>
    </main>
  );
}
```

- [ ] **Step 3:** 수동 테스트: 매직링크 클릭 → /onboarding → 성별 선택 + 약관 체크 → 다음 → DB users 테이블에 gender·terms_accepted_at·privacy_accepted_at 채워짐 확인.

- [ ] **Step 4:** Commit:

```bash
git add app/api/users/onboard/route.ts app/onboarding/page.tsx
git commit -m "feat(onboarding): gender + terms acceptance"
```

---

## Phase 6: Card Creation

### Task 18: 포스트잇 카드 컴포넌트 + 색 선택

**Files:**
- Create: `components/Postit.tsx`, `components/ColorPicker.tsx`

- [ ] **Step 1:** `components/Postit.tsx`:

```tsx
import { POSTIT_COLOR_HEX, PostitColor } from "@/lib/constants";

interface Props {
  text: string;
  color: PostitColor;
  size?: "sm" | "md" | "lg";
  rotation?: number;
  className?: string;
  onClick?: () => void;
}

export function Postit({ text, color, size = "md", rotation, className = "", onClick }: Props) {
  const sizes = {
    sm: "w-16 h-16 text-[10px] p-2",
    md: "w-24 h-24 text-xs p-3",
    lg: "w-32 h-32 text-sm p-4",
  };
  const rot = rotation ?? (Math.random() * 4 - 2);
  return (
    <div
      onClick={onClick}
      style={{
        background: POSTIT_COLOR_HEX[color],
        transform: `rotate(${rot}deg)`,
        boxShadow: "1px 2px 4px rgba(0,0,0,0.15)",
      }}
      className={`${sizes[size]} font-semibold text-gray-800 flex items-center justify-center text-center break-keep ${onClick ? "cursor-pointer hover:scale-105 transition" : ""} ${className}`}
    >
      {text}
    </div>
  );
}
```

- [ ] **Step 2:** `components/ColorPicker.tsx`:

```tsx
"use client";

import { POSTIT_COLORS, POSTIT_COLOR_HEX, PostitColor } from "@/lib/constants";

interface Props {
  selected: PostitColor;
  onChange: (c: PostitColor) => void;
}

export function ColorPicker({ selected, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {POSTIT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{ background: POSTIT_COLOR_HEX[c] }}
          className={`w-7 h-7 rounded ${selected === c ? "ring-2 ring-gray-800" : ""}`}
          aria-label={c}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3:** Commit:

```bash
git add components/Postit.tsx components/ColorPicker.tsx
git commit -m "feat(ui): Postit card + color picker components"
```

---

### Task 19: 카드 작성 페이지 + 생성 API

**Files:**
- Create: `app/card/new/page.tsx`, `app/api/cards/route.ts`

- [ ] **Step 1:** `app/api/cards/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeInstagramId, isValidInstagramId } from "@/lib/validation/instagram";
import { containsProfanity } from "@/lib/validation/profanity";
import { containsPhoneNumber } from "@/lib/validation/phone";
import { ONELINER_MAX_LENGTH, POSTIT_COLORS, PostitColor } from "@/lib/constants";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { one_liner, instagram_id, color } = body;

  if (typeof one_liner !== "string" || one_liner.length === 0 || one_liner.length > ONELINER_MAX_LENGTH) {
    return NextResponse.json({ error: "INVALID_ONELINER" }, { status: 400 });
  }
  if (containsProfanity(one_liner)) {
    return NextResponse.json({ error: "PROFANITY_DETECTED" }, { status: 400 });
  }
  if (containsPhoneNumber(one_liner)) {
    return NextResponse.json({ error: "PHONE_DETECTED" }, { status: 400 });
  }

  const id = sanitizeInstagramId(instagram_id ?? "");
  if (!isValidInstagramId(id)) {
    return NextResponse.json({ error: "INVALID_INSTAGRAM_ID" }, { status: 400 });
  }

  if (!POSTIT_COLORS.includes(color as PostitColor)) {
    return NextResponse.json({ error: "INVALID_COLOR" }, { status: 400 });
  }

  const { error, data } = await supabase
    .from("cards")
    .insert({
      user_id: user.id,
      one_liner,
      instagram_id: id,
      color,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "ALREADY_HAS_CARD" }, { status: 409 });
    }
    return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
```

- [ ] **Step 2:** `app/card/new/page.tsx`:

```tsx
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Postit } from "@/components/Postit";
import { ColorPicker } from "@/components/ColorPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ONELINER_MAX_LENGTH, PostitColor, POSTIT_COLORS } from "@/lib/constants";

export default function NewCard() {
  const [oneLiner, setOneLiner] = useState("");
  const [instaId, setInstaId] = useState("");
  const [color, setColor] = useState<PostitColor>(POSTIT_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const remaining = ONELINER_MAX_LENGTH - oneLiner.length;
  const canSubmit = useMemo(
    () => oneLiner.trim().length > 0 && instaId.trim().length > 0 && !submitting,
    [oneLiner, instaId, submitting]
  );

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        one_liner: oneLiner.trim(),
        instagram_id: instaId.trim(),
        color,
      }),
    });
    if (res.ok) {
      router.push("/board");
    } else {
      const data = await res.json().catch(() => ({}));
      const msgs: Record<string, string> = {
        INVALID_ONELINER: "한 줄 소개는 1~20자",
        PROFANITY_DETECTED: "비속어가 포함되어 있어요",
        PHONE_DETECTED: "전화번호는 적을 수 없어요",
        INVALID_INSTAGRAM_ID: "인스타 ID 형식이 잘못됐어요 (영문/숫자/_/. 만 가능, 30자 이내)",
        INVALID_COLOR: "색상이 잘못됐어요",
        ALREADY_HAS_CARD: "이미 카드를 만들었어요",
      };
      setError(msgs[data.error] || "오류가 발생했어요");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-8 bg-[#faf6e8]">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6">
        <h1 className="text-lg font-bold text-center mb-6">내 카드 만들기</h1>

        <label className="text-xs text-gray-600 block mb-1">한 줄 소개</label>
        <Input
          maxLength={ONELINER_MAX_LENGTH}
          placeholder="예: 강동원 닮은꼴"
          value={oneLiner}
          onChange={(e) => setOneLiner(e.target.value)}
        />
        <div className="text-right text-xs text-gray-400 mt-0.5">{oneLiner.length}/{ONELINER_MAX_LENGTH}</div>

        <label className="text-xs text-gray-600 block mt-3 mb-1">인스타그램 ID</label>
        <Input
          placeholder="@my_insta_id"
          value={instaId}
          onChange={(e) => setInstaId(e.target.value)}
        />

        <label className="text-xs text-gray-600 block mt-4 mb-2">포스트잇 색</label>
        <ColorPicker selected={color} onChange={setColor} />

        <div className="mt-6 text-xs text-gray-500 mb-2 text-center">미리보기</div>
        <div className="flex justify-center mb-6">
          <Postit text={oneLiner || "한 줄 소개"} color={color} size="md" rotation={-1.5} />
        </div>

        <Button onClick={submit} disabled={!canSubmit} className="w-full">
          {submitting ? "올리는 중..." : "보드에 올리기"}
        </Button>
        {error && <p className="text-red-600 text-xs text-center mt-3">{error}</p>}
      </div>
    </main>
  );
}
```

- [ ] **Step 3:** 수동 테스트: 매직링크 → 온보딩 → 카드 작성 → 입력 + 색 선택 → 미리보기 갱신 → "보드에 올리기" → /board로 이동. DB cards 테이블에 row 들어옴.

- [ ] **Step 4:** Commit:

```bash
git add app/api/cards/route.ts app/card/new/page.tsx
git commit -m "feat(cards): card creation form + API with validation"
```

---

## Phase 7: Session State

### Task 20: 세션 상태 API + RatioCounter 컴포넌트

**Files:**
- Create: `app/api/session/route.ts`, `components/RatioCounter.tsx`

- [ ] **Step 1:** `app/api/session/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const [{ data: cfg }, { count: maleCount }, { count: femaleCount }] = await Promise.all([
    supabase.from("session_config").select("*").eq("id", 1).single(),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("gender", "M"),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("gender", "F"),
  ]);

  if (!cfg) return NextResponse.json({ error: "NO_CONFIG" }, { status: 500 });

  const now = Date.now();
  const startsAt = new Date(cfg.starts_at).getTime();
  const endsAt = new Date(cfg.ends_at).getTime();

  const thresholdMet = (maleCount ?? 0) >= cfg.threshold_male && (femaleCount ?? 0) >= cfg.threshold_female;
  const inPregating = now < startsAt || !thresholdMet;
  const inPostSession = now >= endsAt;
  const board_open = !cfg.force_locked && !inPregating && !inPostSession;

  return NextResponse.json({
    config: cfg,
    counts: { male: maleCount ?? 0, female: femaleCount ?? 0 },
    board_open,
    in_pregating: inPregating,
    in_postsession: inPostSession,
    time_to_end_seconds: Math.max(0, Math.floor((endsAt - now) / 1000)),
  });
}
```

- [ ] **Step 2:** `components/RatioCounter.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { RATIO_WARN_THRESHOLD, RATIO_CRITICAL_THRESHOLD } from "@/lib/constants";

interface Props {
  initialMale: number;
  initialFemale: number;
}

export function RatioCounter({ initialMale, initialFemale }: Props) {
  const [male, setMale] = useState(initialMale);
  const [female, setFemale] = useState(initialFemale);

  useEffect(() => {
    const sb = createClient();
    const ch = sb
      .channel("users-counter")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, async () => {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json();
          setMale(data.counts.male);
          setFemale(data.counts.female);
        }
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  const total = male + female;
  let level: "good" | "warn" | "critical" = "good";
  if (total > 0) {
    const dominantRatio = Math.max(male, female) / total;
    if (dominantRatio >= RATIO_CRITICAL_THRESHOLD) level = "critical";
    else if (dominantRatio >= RATIO_WARN_THRESHOLD) level = "warn";
  }

  const dot = { good: "text-green-500", warn: "text-yellow-500", critical: "text-red-500" }[level];
  const label = { good: "균형 양호", warn: "비율 불균형", critical: "심각 불균형" }[level];

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="bg-blue-50 text-blue-600 font-bold px-2 py-1 rounded-full">남 {male}</span>
      <span className="bg-pink-50 text-pink-600 font-bold px-2 py-1 rounded-full">여 {female}</span>
      <span className={`${dot}`}>● {label}</span>
    </div>
  );
}
```

- [ ] **Step 3:** Supabase 대시보드 → Database → Replication에서 `users` 테이블 Realtime 활성화.

- [ ] **Step 4:** Commit:

```bash
git add app/api/session/route.ts components/RatioCounter.tsx
git commit -m "feat(session): session state API + live ratio counter (Realtime)"
```

---

### Task 21: 임계점 게이팅 페이지

**Files:**
- Create: `app/board/_components/Gating.tsx`

- [ ] **Step 1:** `app/board/_components/Gating.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Postit } from "@/components/Postit";
import type { Card, SessionState } from "@/lib/types";

interface Props {
  myCard: Card | null;
}

export function Gating({ myCard }: Props) {
  const [state, setState] = useState<SessionState | null>(null);

  useEffect(() => {
    const fetchState = () => fetch("/api/session").then((r) => r.json()).then(setState);
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!state) return <main className="min-h-screen flex items-center justify-center">불러오는 중...</main>;

  const oppositeGender = myCard ? (state.counts.male > state.counts.female ? "female" : "male") : null;
  const oppositeCount = oppositeGender === "female" ? state.counts.female : state.counts.male;
  const needed = Math.max(
    0,
    (oppositeGender === "female" ? state.config.threshold_female : state.config.threshold_male) - oppositeCount
  );

  return (
    <main className="min-h-screen px-6 py-8 bg-[#fffbf2]">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow p-6">
        <div className="bg-orange-50 border-l-4 border-orange-400 rounded p-3 mb-4">
          <div className="text-xs font-bold text-orange-600 mb-1">⏳ 보드 준비 중</div>
          <p className="text-xs text-gray-700">
            {needed > 0
              ? `${oppositeGender === "female" ? "여학생" : "남학생"} ${needed}명 더 등록되면 오픈돼요`
              : "곧 시작됩니다"}
          </p>
        </div>

        <div className="text-xs text-gray-600 mb-2">실시간 등록 현황</div>
        <div className="flex gap-2 mb-4">
          <div className="flex-1 bg-blue-50 p-3 rounded text-center">
            <div className="text-[10px] text-gray-600">남자</div>
            <div className="text-xl font-bold text-blue-600">{state.counts.male}</div>
          </div>
          <div className="flex-1 bg-pink-50 p-3 rounded text-center">
            <div className="text-[10px] text-gray-600">여자</div>
            <div className="text-xl font-bold text-pink-500">{state.counts.female}</div>
          </div>
        </div>

        {myCard && (
          <>
            <div className="text-xs text-gray-600 mb-2">내 카드 (등록 완료)</div>
            <div className="flex justify-center mb-4">
              <Postit text={myCard.one_liner} color={myCard.color as any} rotation={-2} size="md" />
            </div>
          </>
        )}

        <p className="text-[10px] text-gray-500 text-center">자동으로 새로고침돼요</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2:** Commit:

```bash
git add app/board/_components/Gating.tsx
git commit -m "feat(board): threshold gating screen with live counts"
```

---

## Phase 8: Board

### Task 22: 보드 API + BoardGrid 컴포넌트

**Files:**
- Create: `app/api/board/route.ts`, `components/BoardGrid.tsx`

- [ ] **Step 1:** `app/api/board/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  // RLS가 자동으로: 본인 카드 X / 같은 성별 X / hidden X / 본 카드 X / 종료/잠금 시 X
  const { data, error } = await supabase
    .from("cards")
    .select("id, one_liner, color");

  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  // 무작위 셔플
  const shuffled = [...(data ?? [])].sort(() => Math.random() - 0.5);
  return NextResponse.json({ cards: shuffled });
}
```

- [ ] **Step 2:** `components/BoardGrid.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Postit } from "@/components/Postit";
import { PostitColor } from "@/lib/constants";

interface BoardCard {
  id: string;
  one_liner: string;
  color: PostitColor;
}

interface Props {
  onCardClick: (card: BoardCard) => void;
}

export function BoardGrid({ onCardClick }: Props) {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/board")
      .then((r) => r.json())
      .then((d) => {
        setCards(d.cards ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-center text-gray-500 py-10">불러오는 중...</p>;
  if (cards.length === 0) {
    return <p className="text-center text-gray-500 py-10">아직 카드가 없어요. 잠시만요.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 bg-[#faf6e8] p-4 rounded-xl">
      {cards.map((c) => (
        <Postit key={c.id} text={c.one_liner} color={c.color} size="md" onClick={() => onCardClick(c)} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3:** Commit:

```bash
git add app/api/board/route.ts components/BoardGrid.tsx
git commit -m "feat(board): board API + grid component"
```

---

### Task 23: 보드 페이지 (메인)

**Files:**
- Create: `app/board/page.tsx`, `components/ConfirmModal.tsx`, `components/RevealModal.tsx`

- [ ] **Step 1:** `components/ConfirmModal.tsx`:

```tsx
"use client";

import { Postit } from "@/components/Postit";
import { Button } from "@/components/ui/Button";
import { PostitColor } from "@/lib/constants";

interface Props {
  card: { id: string; one_liner: string; color: PostitColor } | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmModal({ card, onConfirm, onCancel, loading }: Props) {
  if (!card) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 max-w-xs w-full text-center shadow-xl">
        <div className="flex justify-center mb-4">
          <Postit text={card.one_liner} color={card.color} size="md" rotation={1} />
        </div>
        <p className="text-sm text-gray-700 mb-1">이 카드의 인스타를 확인할까요?</p>
        <p className="text-xs text-gray-500 mb-5">슬롯은 한 번만 사용 가능해요</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} className="flex-1">취소</Button>
          <Button onClick={onConfirm} disabled={loading} className="flex-[1.5]">
            {loading ? "확인 중..." : "확인하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** `components/RevealModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Postit } from "@/components/Postit";
import { PostitColor } from "@/lib/constants";

interface Props {
  card: { one_liner: string; color: PostitColor };
  instagramId: string;
  onClose: () => void;
}

export function RevealModal({ card, instagramId, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(instagramId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl p-6 max-w-xs w-full text-center shadow-xl">
        <div className="flex justify-center mb-3">
          <Postit text={card.one_liner} color={card.color} size="sm" rotation={1} />
        </div>
        <div className="text-xs text-gray-500 mb-1">인스타그램 ID</div>
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="font-mono text-lg font-bold text-gray-800">@{instagramId}</span>
          <button onClick={copy} className="bg-blue-600 text-white text-xs px-3 py-1 rounded font-semibold">
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mb-4">인스타 앱에서 직접 검색해서 팔로우 해주세요</p>
        <button onClick={onClose} className="text-xs text-gray-500 underline">닫기</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** `app/board/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BoardGrid } from "@/components/BoardGrid";
import { RatioCounter } from "@/components/RatioCounter";
import { ConfirmModal } from "@/components/ConfirmModal";
import { RevealModal } from "@/components/RevealModal";
import { Gating } from "./_components/Gating";
import { PostitColor } from "@/lib/constants";

interface BoardCard {
  id: string;
  one_liner: string;
  color: PostitColor;
}

export default function BoardPage() {
  const [sessionState, setSessionState] = useState<any>(null);
  const [myCard, setMyCard] = useState<any>(null);
  const [pending, setPending] = useState<BoardCard | null>(null);
  const [revealed, setRevealed] = useState<{ card: BoardCard; instagramId: string } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [hasUsedSlot, setHasUsedSlot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function loadAll() {
    const [s, mc, mm] = await Promise.all([
      fetch("/api/session").then((r) => r.json()),
      fetch("/api/cards/me").then((r) => (r.ok ? r.json() : { card: null })),
      fetch("/api/matches/me").then((r) => (r.ok ? r.json() : { matches: [] })),
    ]);
    setSessionState(s);
    setMyCard(mc.card);
    setHasUsedSlot((mm.matches ?? []).filter((m: any) => !m.bonus).length > 0);
  }

  useEffect(() => { loadAll(); }, []);

  async function confirmReveal() {
    if (!pending) return;
    setRevealing(true);
    setError(null);
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: pending.id }),
    });
    const data = await res.json();
    if (res.ok) {
      setRevealed({ card: pending, instagramId: data.instagram_id });
      setPending(null);
      setHasUsedSlot(true);
    } else {
      const msgs: Record<string, string> = {
        SLOT_ALREADY_USED: "이미 슬롯을 사용했어요",
        BOARD_CLOSED: "보드가 닫혀있어요",
        CARD_HIDDEN: "이 카드는 더 이상 볼 수 없어요",
      };
      setError(msgs[data.error] || "확인 실패");
    }
    setRevealing(false);
  }

  if (!sessionState) return <main className="min-h-screen flex items-center justify-center">불러오는 중...</main>;
  if (sessionState.in_postsession) {
    router.push("/end");
    return null;
  }
  if (sessionState.in_pregating || !sessionState.board_open) {
    return <Gating myCard={myCard} />;
  }

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b px-4 py-3 flex items-center justify-between sticky top-0 bg-white z-10">
        <RatioCounter initialMale={sessionState.counts.male} initialFemale={sessionState.counts.female} />
        <nav className="flex gap-3 text-xs">
          <Link href="/my/matches" className="text-blue-600 font-semibold">내 매칭</Link>
          <Link href="/my/card" className="text-gray-600">내 카드</Link>
        </nav>
      </header>

      <div className="p-3">
        <BoardGrid
          onCardClick={(c) => {
            if (hasUsedSlot) {
              setError("슬롯을 이미 사용했어요. '내 매칭'에서 확인하세요.");
              return;
            }
            setPending(c);
          }}
        />
      </div>

      <ConfirmModal card={pending} onConfirm={confirmReveal} onCancel={() => setPending(null)} loading={revealing} />
      {revealed && (
        <RevealModal
          card={revealed.card}
          instagramId={revealed.instagramId}
          onClose={() => { setRevealed(null); loadAll(); }}
        />
      )}

      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs px-4 py-2 rounded-full shadow"
             onClick={() => setError(null)}>{error}</div>
      )}
    </main>
  );
}
```

- [ ] **Step 4:** Commit:

```bash
git add app/board/page.tsx components/ConfirmModal.tsx components/RevealModal.tsx
git commit -m "feat(board): main board page with confirm + reveal modals"
```

---

## Phase 9: Matching

### Task 24: 매칭 API (RPC 호출)

**Files:**
- Create: `app/api/matches/route.ts`, `app/api/matches/me/route.ts`, `app/api/cards/me/route.ts`

- [ ] **Step 1:** `app/api/matches/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { card_id } = await req.json().catch(() => ({}));
  if (!card_id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const { data, error } = await supabase.rpc("consume_slot_and_reveal", {
    target_card_id: card_id,
  });

  if (error) {
    const knownErrors = [
      "SLOT_ALREADY_USED", "BOARD_CLOSED", "CARD_HIDDEN", "SAME_GENDER",
      "CARD_NOT_FOUND", "CANNOT_VIEW_OWN_CARD", "NOT_AUTHENTICATED", "ONBOARDING_INCOMPLETE",
    ];
    const code = knownErrors.find((k) => error.message.includes(k)) || "RPC_ERROR";
    return NextResponse.json({ error: code }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ instagram_id: row.instagram_id });
}
```

- [ ] **Step 2:** `app/api/matches/me/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { data, error } = await supabase.rpc("my_matches");
  if (error) return NextResponse.json({ error: "RPC_ERROR" }, { status: 500 });
  return NextResponse.json({ matches: data ?? [] });
}
```

- [ ] **Step 3:** `app/api/cards/me/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ card: data });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json();
  const updates: any = {};
  if (typeof body.one_liner === "string") updates.one_liner = body.one_liner;
  if (typeof body.instagram_id === "string") updates.instagram_id = body.instagram_id;
  if (typeof body.color === "string") updates.color = body.color;
  if (typeof body.hidden_by_user === "boolean") updates.hidden_by_user = body.hidden_by_user;

  const { error } = await supabase.from("cards").update(updates).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4:** 수동 테스트 (이메일 두 개로 양쪽 등록 후): A 카드가 B 보드에 보임 → B가 클릭 → 확인 모달 → 확인하기 → 인스타 ID 모달 → 복사 가능. B 보드에서 그 카드 사라짐.

- [ ] **Step 5:** Commit:

```bash
git add app/api/matches/route.ts app/api/matches/me/route.ts app/api/cards/me/route.ts
git commit -m "feat(matches): slot consumption + my matches + my card APIs"
```

---

## Phase 10: My Pages

### Task 25: 내 매칭 페이지

**Files:**
- Create: `app/my/matches/page.tsx`

- [ ] **Step 1:** `app/my/matches/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Postit } from "@/components/Postit";

interface MatchRow {
  match_id: string;
  card_id: string;
  one_liner: string;
  color: string;
  instagram_id: string;
  created_at: string;
}

export default function MyMatchesPage() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/matches/me")
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []));
  }, []);

  if (!matches) return <main className="min-h-screen flex items-center justify-center">불러오는 중...</main>;

  return (
    <main className="min-h-screen bg-[#eef3ff] px-4 py-6">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-bold text-gray-800">내가 본 카드 ({matches.length})</h1>
          <Link href="/board" className="text-xs text-gray-600">← 보드</Link>
        </div>

        {matches.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-10">아직 본 카드가 없어요</p>
        )}

        {matches.map((m) => (
          <div key={m.match_id} className="bg-white rounded-xl p-4 mb-3 shadow-sm flex items-center gap-3">
            <Postit text={m.one_liner} color={m.color as any} size="sm" rotation={1} />
            <div className="flex-1">
              <div className="text-[10px] text-gray-500 mb-1">인스타그램</div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold">@{m.instagram_id}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(m.instagram_id);
                    setCopiedId(m.match_id);
                    setTimeout(() => setCopiedId(null), 2000);
                  }}
                  className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded font-semibold"
                >
                  {copiedId === m.match_id ? "복사됨" : "복사"}
                </button>
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                {new Date(m.created_at).toLocaleString("ko-KR")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2:** Commit:

```bash
git add app/my/matches/page.tsx
git commit -m "feat(my): my matches page with copy buttons"
```

---

### Task 26: 내 카드 관리 + 킬 스위치 + 계정 삭제

**Files:**
- Create: `app/my/card/page.tsx`, `app/api/users/me/route.ts`, `app/api/cards/me/toggle-hide/route.ts`

- [ ] **Step 1:** `app/api/users/me/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const admin = createAdminClient();
  // cascade: cards/matches via FK on delete cascade
  await admin.from("users").delete().eq("id", user.id);
  await admin.auth.admin.deleteUser(user.id);
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2:** `app/api/cards/me/toggle-hide/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const { hidden } = await req.json();
  const { error } = await supabase
    .from("cards")
    .update({ hidden_by_user: !!hidden })
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3:** `app/my/card/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Postit } from "@/components/Postit";
import { ColorPicker } from "@/components/ColorPicker";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ONELINER_MAX_LENGTH, PostitColor } from "@/lib/constants";

export default function MyCardPage() {
  const [card, setCard] = useState<any>(null);
  const [oneLiner, setOneLiner] = useState("");
  const [instaId, setInstaId] = useState("");
  const [color, setColor] = useState<PostitColor>("yellow");
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/cards/me")
      .then((r) => r.json())
      .then((d) => {
        setCard(d.card);
        if (d.card) {
          setOneLiner(d.card.one_liner);
          setInstaId(d.card.instagram_id);
          setColor(d.card.color);
          setHidden(d.card.hidden_by_user);
        }
      });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/cards/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ one_liner: oneLiner, instagram_id: instaId, color }),
    });
    setSaving(false);
  }

  async function toggleHide() {
    const next = !hidden;
    setHidden(next);
    await fetch("/api/cards/me/toggle-hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: next }),
    });
  }

  async function deleteAccount() {
    if (!confirm("정말로 계정과 모든 데이터를 삭제할까요? 되돌릴 수 없어요.")) return;
    await fetch("/api/users/me", { method: "DELETE" });
    router.push("/");
  }

  if (!card) return <main className="min-h-screen flex items-center justify-center">불러오는 중...</main>;

  return (
    <main className="min-h-screen bg-[#eef3ff] px-4 py-6">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-bold text-gray-800">내 카드 관리</h1>
          <Link href="/board" className="text-xs text-gray-600">← 보드</Link>
        </div>

        <div className="flex justify-center mb-4">
          <Postit text={oneLiner || "한 줄 소개"} color={color} size="md" rotation={-1} />
        </div>

        <label className="text-xs text-gray-600 block mb-1">한 줄 소개</label>
        <Input value={oneLiner} maxLength={ONELINER_MAX_LENGTH} onChange={(e) => setOneLiner(e.target.value)} />
        <label className="text-xs text-gray-600 block mt-3 mb-1">인스타 ID</label>
        <Input value={instaId} onChange={(e) => setInstaId(e.target.value)} />
        <label className="text-xs text-gray-600 block mt-3 mb-2">색</label>
        <ColorPicker selected={color} onChange={setColor} />

        <Button onClick={save} disabled={saving} className="w-full mt-4">
          {saving ? "저장 중..." : "저장"}
        </Button>

        <div className="border-t my-6"></div>

        <button
          onClick={toggleHide}
          className={`w-full text-xs font-semibold px-3 py-2 rounded border ${hidden ? "border-green-500 text-green-600" : "border-red-500 text-red-600"}`}
        >
          {hidden ? "다시 보드에 올리기" : "카드 내리기 (킬 스위치)"}
        </button>
        <p className="text-[10px] text-gray-500 mt-1 text-center">
          이미 본 사람의 인스타 ID는 회수되지 않아요.
        </p>

        <div className="border-t my-6"></div>

        <button onClick={deleteAccount} className="w-full text-xs text-red-600 underline">
          계정과 모든 데이터 즉시 삭제
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 4:** Commit:

```bash
git add app/api/users/me/route.ts app/api/cards/me/toggle-hide/route.ts app/my/card/page.tsx
git commit -m "feat(my-card): edit + kill switch + account deletion"
```

---

## Phase 11: Countdown / End

### Task 27: 카운트다운 배너

**Files:**
- Create: `components/CountdownBanner.tsx`

- [ ] **Step 1:** `components/CountdownBanner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Props {
  endsAt: string;
}

export function CountdownBanner({ endsAt }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // 24h 이하일 때만 노출
  if (secondsLeft > 24 * 3600 || secondsLeft <= 0) return null;

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  const critical = secondsLeft <= 3600;

  return (
    <div className={`text-center text-xs px-3 py-2 ${critical ? "bg-red-600 text-white" : "bg-yellow-100 text-yellow-800"}`}>
      <strong>행사 종료 {hours}시간 {minutes}분 {seconds}초 남음.</strong>{" "}
      <Link href="/my/matches" className="underline">내 매칭</Link>에서 인스타 ID 백업해두세요.
    </div>
  );
}
```

- [ ] **Step 2:** `app/board/page.tsx`에 CountdownBanner 삽입 (header 위):

```tsx
// app/board/page.tsx의 header 위에 추가
{sessionState && <CountdownBanner endsAt={sessionState.config.ends_at} />}
```

- [ ] **Step 3:** Commit:

```bash
git add components/CountdownBanner.tsx app/board/page.tsx
git commit -m "feat(end): countdown banner with 24h/1h warning"
```

---

### Task 28: 종료 페이지

**Files:**
- Create: `app/end/page.tsx`

- [ ] **Step 1:** `app/end/page.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export default function EndPage() {
  useEffect(() => {
    fetch("/api/auth/logout", { method: "POST" });
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-900 text-white">
      <h1 className="text-2xl font-bold mb-3">청대 시그널이 종료됐어요</h1>
      <p className="text-sm text-gray-300 text-center max-w-sm">
        모든 매칭이 종료됐어요.<br />
        곧 모든 데이터가 폐기될 예정이에요.
      </p>
      <p className="text-xs text-gray-500 mt-8">고생 많으셨습니다.</p>
    </main>
  );
}
```

- [ ] **Step 2:** Commit:

```bash
git add app/end/page.tsx
git commit -m "feat(end): post-session page with force logout"
```

---

## Phase 12: Admin

### Task 29: 어드민 가드 + 레이아웃

**Files:**
- Create: `app/admin/layout.tsx`

- [ ] **Step 1:** `app/admin/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser, isAdminEmail } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect("/");
  }
  return <div className="min-h-screen bg-gray-900 text-gray-200">{children}</div>;
}
```

- [ ] **Step 2:** Commit:

```bash
git add app/admin/layout.tsx
git commit -m "feat(admin): server-side admin guard"
```

---

### Task 30: 어드민 대시보드 + Stats API

**Files:**
- Create: `app/api/admin/stats/route.ts`, `app/admin/page.tsx`, `app/api/admin/session-config/route.ts`

- [ ] **Step 1:** `app/api/admin/stats/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return null;
  }
  return user;
}

export async function GET() {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const admin = createAdminClient();

  const [
    { count: m },
    { count: f },
    { count: matches },
    { data: cfg },
  ] = await Promise.all([
    admin.from("users").select("id", { count: "exact", head: true }).eq("gender", "M"),
    admin.from("users").select("id", { count: "exact", head: true }).eq("gender", "F"),
    admin.from("matches").select("id", { count: "exact", head: true }).eq("bonus", false),
    admin.from("session_config").select("*").eq("id", 1).single(),
  ]);

  return NextResponse.json({
    male: m ?? 0,
    female: f ?? 0,
    matches: matches ?? 0,
    config: cfg,
  });
}
```

- [ ] **Step 2:** `app/api/admin/session-config/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const updates = await req.json();
  const admin = createAdminClient();
  const { error } = await admin.from("session_config").update(updates).eq("id", 1);
  if (error) return NextResponse.json({ error: "DB_ERROR", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3:** `app/admin/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

export default function AdminConsole() {
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [userInfo, setUserInfo] = useState<any>(null);

  async function loadStats() {
    const r = await fetch("/api/admin/stats");
    if (r.ok) setStats(await r.json());
  }
  useEffect(() => { loadStats(); const t = setInterval(loadStats, 5000); return () => clearInterval(t); }, []);

  async function doSearch() {
    const r = await fetch(`/api/admin/cards?q=${encodeURIComponent(search)}`);
    if (r.ok) setSearchResults((await r.json()).cards ?? []);
  }

  async function hide(id: string) {
    await fetch(`/api/admin/cards/${id}/hide`, { method: "POST" });
    doSearch();
  }
  async function del(id: string) {
    if (!confirm("이 카드를 삭제하고 사용자를 차단할까요?")) return;
    await fetch(`/api/admin/cards/${id}/delete`, { method: "POST" });
    doSearch();
  }

  async function loadUser() {
    const r = await fetch(`/api/admin/users/${encodeURIComponent(userEmail)}`);
    if (r.ok) setUserInfo(await r.json());
  }
  async function grantSlot(userId: string) {
    await fetch(`/api/admin/users/${userId}/grant-slot`, { method: "POST" });
    loadUser();
  }
  async function ban(userId: string) {
    if (!confirm("이 사용자를 차단할까요?")) return;
    await fetch(`/api/admin/users/${userId}/ban`, { method: "POST" });
    loadUser();
  }

  async function saveSession(field: string, value: any) {
    await fetch("/api/admin/session-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    loadStats();
  }

  async function toggleLock() {
    await saveSession("force_locked", !stats.config.force_locked);
  }

  async function wipeData() {
    const t = prompt("정말 모든 데이터를 폐기하려면 'WIPE'를 입력하세요");
    if (t !== "WIPE") return;
    const r = await fetch("/api/admin/wipe-data", { method: "POST" });
    if (r.ok) alert("폐기 완료");
    else alert("실패");
  }

  if (!stats) return <main className="p-8 text-sm">불러오는 중...</main>;

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <header className="flex justify-between items-center pb-3 border-b border-gray-700 mb-4">
        <h1 className="text-lg font-bold">청대 시그널 · 어드민 콘솔</h1>
        <span className="text-xs text-gray-500">⚡ 라이브</span>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="남자 등록" value={stats.male} color="text-blue-400" />
        <Stat label="여자 등록" value={stats.female} color="text-pink-400" />
        <Stat label="누적 매칭" value={stats.matches} color="text-white" />
        <Stat label="보드 잠금" value={stats.config.force_locked ? "잠김" : "오픈"} color={stats.config.force_locked ? "text-red-400" : "text-green-400"}>
          <button onClick={toggleLock} className="text-[10px] bg-gray-700 px-2 py-0.5 rounded mt-1">토글</button>
        </Stat>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 rounded p-3">
          <h2 className="text-xs font-bold mb-2">세션 설정</h2>
          <label className="text-[10px] text-gray-500 block">시작 시각</label>
          <input type="datetime-local" defaultValue={stats.config.starts_at.slice(0, 16)}
            onBlur={(e) => saveSession("starts_at", new Date(e.target.value).toISOString())}
            className="bg-gray-900 text-xs p-1 rounded w-full mb-2" />
          <label className="text-[10px] text-gray-500 block">종료 시각</label>
          <input type="datetime-local" defaultValue={stats.config.ends_at.slice(0, 16)}
            onBlur={(e) => saveSession("ends_at", new Date(e.target.value).toISOString())}
            className="bg-gray-900 text-xs p-1 rounded w-full" />
        </div>

        <div className="bg-red-900/30 border border-red-800 rounded p-3">
          <h2 className="text-xs font-bold text-red-300 mb-1">⚠ 위험 영역</h2>
          <p className="text-[10px] text-gray-400 mb-2">세션 종료 후에만 사용. 모든 데이터 영구 삭제, 되돌릴 수 없음.</p>
          <button onClick={wipeData} className="bg-red-700 text-white text-xs px-3 py-2 rounded font-bold w-full">
            세션 종료 + 데이터 폐기
          </button>
        </div>
      </section>

      <section className="bg-gray-800 rounded p-3 mb-4">
        <h2 className="text-xs font-bold mb-2">카드 검색 / 강제 숨김</h2>
        <div className="flex gap-2 mb-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="소개 텍스트로 검색"
            className="flex-1 bg-gray-900 text-xs p-2 rounded" />
          <button onClick={doSearch} className="bg-gray-700 text-xs px-3 rounded">검색</button>
        </div>
        <div className="max-h-60 overflow-auto space-y-1">
          {searchResults.map((c) => (
            <div key={c.id} className="bg-gray-900 p-2 rounded text-xs flex justify-between items-center">
              <div>
                <span className="bg-yellow-200 text-gray-800 px-2 py-0.5 rounded font-semibold">{c.one_liner}</span>
                <span className="ml-2 text-gray-500">{c.gender} · {c.email}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => hide(c.id)} className="bg-gray-700 px-2 py-1 rounded">숨김</button>
                <button onClick={() => del(c.id)} className="bg-red-900/50 text-red-400 px-2 py-1 rounded">삭제+차단</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-800 rounded p-3">
        <h2 className="text-xs font-bold mb-2">사용자 조회</h2>
        <div className="flex gap-2 mb-2">
          <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)}
            placeholder="이메일 (정확한 매치)"
            className="flex-1 bg-gray-900 text-xs p-2 rounded" />
          <button onClick={loadUser} className="bg-gray-700 text-xs px-3 rounded">조회</button>
        </div>
        {userInfo && (
          <div className="bg-gray-900 p-3 rounded text-xs">
            <div className="font-bold mb-1">{userInfo.email}</div>
            <div className="text-gray-500 mb-2">
              성별: {userInfo.gender ?? "-"} · 슬롯 사용: {userInfo.slot_used ? "✓" : "X"} ·
              본 카드: {userInfo.viewed_card_oneliner ?? "-"} · {userInfo.banned ? "차단됨" : "정상"}
            </div>
            <div className="flex gap-2">
              <button onClick={() => grantSlot(userInfo.id)} className="bg-blue-900 text-blue-300 px-2 py-1 rounded">슬롯 1회 부여</button>
              <button onClick={() => ban(userInfo.id)} className="bg-red-900 text-red-300 px-2 py-1 rounded">차단</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, color, children }: any) {
  return (
    <div className="bg-gray-800 rounded p-3">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {children}
    </div>
  );
}
```

- [ ] **Step 4:** Commit:

```bash
git add app/api/admin app/admin
git commit -m "feat(admin): dashboard with stats + session config + search/ban"
```

---

### Task 31: 어드민 카드 검색/숨김/삭제 API

**Files:**
- Create: `app/api/admin/cards/route.ts`, `app/api/admin/cards/[id]/hide/route.ts`, `app/api/admin/cards/[id]/delete/route.ts`

- [ ] **Step 1:** `app/api/admin/cards/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cards")
    .select("id, one_liner, color, hidden_by_user, hidden_by_admin, users!inner(email, gender)")
    .ilike("one_liner", `%${q}%`)
    .limit(50);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  const flat = (data ?? []).map((c: any) => ({
    id: c.id,
    one_liner: c.one_liner,
    color: c.color,
    hidden_by_admin: c.hidden_by_admin,
    email: c.users.email,
    gender: c.users.gender,
  }));
  return NextResponse.json({ cards: flat });
}
```

- [ ] **Step 2:** `app/api/admin/cards/[id]/hide/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { error } = await admin.from("cards").update({ hidden_by_admin: true }).eq("id", id);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3:** `app/api/admin/cards/[id]/delete/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const { id } = await ctx.params;
  const admin = createAdminClient();

  // user_id 찾기
  const { data: card } = await admin.from("cards").select("user_id, users!inner(email)").eq("id", id).single();
  if (!card) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // 카드 삭제 + 이메일 차단
  await admin.from("cards").delete().eq("id", id);
  await admin.from("banned_emails").upsert({
    email: (card.users as any).email,
    reason: "admin_card_delete",
  });
  await admin.from("users").update({ banned: true, banned_reason: "admin_card_delete" }).eq("id", card.user_id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4:** Commit:

```bash
git add app/api/admin/cards
git commit -m "feat(admin): card search + hide + delete-ban endpoints"
```

---

### Task 32: 어드민 사용자 관리 + 보드 잠금/해제 + 데이터 폐기 API

**Files:**
- Create: `app/api/admin/users/[email]/route.ts`, `app/api/admin/users/[id]/grant-slot/route.ts`, `app/api/admin/users/[id]/ban/route.ts`, `app/api/admin/wipe-data/route.ts`

- [ ] **Step 1:** `app/api/admin/users/[email]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function GET(_: Request, ctx: { params: Promise<{ email: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { email } = await ctx.params;
  const admin = createAdminClient();
  const decoded = decodeURIComponent(email);

  const { data: u } = await admin.from("users").select("*").eq("email", decoded).single();
  if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { data: m } = await admin
    .from("matches")
    .select("id, bonus, viewed_card_id, cards!inner(one_liner)")
    .eq("viewer_user_id", u.id);

  const slotUsed = (m ?? []).some((x: any) => !x.bonus);
  const lastViewed = (m ?? []).find((x: any) => !x.bonus);

  return NextResponse.json({
    id: u.id,
    email: u.email,
    gender: u.gender,
    banned: u.banned,
    slot_used: slotUsed,
    viewed_card_oneliner: lastViewed ? (lastViewed.cards as any).one_liner : null,
  });
}
```

- [ ] **Step 2:** `app/api/admin/users/[id]/grant-slot/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await ctx.params;
  const admin = createAdminClient();
  // 사용자가 다음 매칭 시 bonus=false 한도가 안 차게: 기존 bonus=false를 bonus=true로 변환
  await admin.from("matches").update({ bonus: true }).eq("viewer_user_id", id).eq("bonus", false);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3:** `app/api/admin/users/[id]/ban/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { data: u } = await admin.from("users").select("email").eq("id", id).single();
  if (!u) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await admin.from("users").update({ banned: true, banned_reason: "admin_ban" }).eq("id", id);
  await admin.from("banned_emails").upsert({ email: u.email, reason: "admin_ban" });
  await admin.from("cards").delete().eq("user_id", id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4:** `app/api/admin/wipe-data/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const admin = createAdminClient();

  // cascade delete: users 지우면 cards/matches 자동 삭제 (FK on delete cascade)
  await admin.from("matches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("cards").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // auth.users + public.users 전체 삭제 (어드민 본인 제외)
  const { data: allUsers } = await admin.from("users").select("id, email");
  for (const u of allUsers ?? []) {
    if (isAdminEmail(u.email)) continue;
    await admin.from("users").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }

  // banned_emails 비우기
  await admin.from("banned_emails").delete().neq("email", "");

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5:** Commit:

```bash
git add app/api/admin/users app/api/admin/wipe-data
git commit -m "feat(admin): user search, grant-slot, ban, wipe-data endpoints"
```

---

## Phase 13: Security Middleware

### Task 33: Security 헤더 미들웨어

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1:** `middleware.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; ")
  );
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2:** 수동 테스트: 브라우저 개발자도구 → Network → 페이지 응답 헤더 확인 (위 헤더 들어있는지).

- [ ] **Step 3:** Commit:

```bash
git add middleware.ts
git commit -m "feat(security): HTTP security headers via middleware"
```

---

## Phase 14: Deployment

### Task 34: Vercel 배포

**Files:**
- Modify: `next.config.ts`
- Create: `README.md`

- [ ] **Step 1:** GitHub에 저장소 만들고 push:

```bash
gh repo create cheongdae-signal --private --source=. --remote=origin --push
```

(gh CLI 미설치면 GitHub.com 웹에서 새 repo 만들고 git remote add origin <url> && git push -u origin main)

- [ ] **Step 2:** Vercel.com → New Project → GitHub 저장소 import.

- [ ] **Step 3:** Environment Variables 입력 (Pre-1, Pre-2 값들):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_ADMIN_EMAIL=admin@example.com`
- `NEXT_PUBLIC_SITE_URL=https://cheongdae-signal.vercel.app` (배포 URL)

- [ ] **Step 4:** Deploy → 빌드 완료 → 배포 URL 확인.

- [ ] **Step 5:** Supabase 대시보드 → Authentication → URL Configuration → Site URL 및 Redirect URLs를 production URL로 변경 (예: `https://cheongdae-signal.vercel.app`, `https://cheongdae-signal.vercel.app/auth/callback`).

- [ ] **Step 6:** Production 환경에서 매직링크 발송 → 수신 → 로그인 → 카드 작성 → 보드 진입까지 전체 흐름 점검.

- [ ] **Step 7:** Commit:

```bash
echo "# 청대 시그널\n\n청주대학교 학생 한정 인스타 매칭 웹앱.\n\n## 배포\nhttps://cheongdae-signal.vercel.app\n\n## 개발 실행\n\nnpm install\ncp .env.example .env.local  # 값 채우기\nnpm run dev\n" > README.md
git add README.md
git commit -m "docs: add README with deploy URL"
git push
```

---

### Task 35: 시범 운영 시나리오 테스트

이건 코드가 아니라 수동 QA 체크리스트.

- [ ] **Step 1:** 사용자 A (남자 이메일)로 가입 → 카드 작성 → 보드 잠금 화면 확인
- [ ] **Step 2:** 사용자 B (여자 이메일)로 가입 → 카드 작성 → 양쪽 임계점 미달 → 여전히 잠금
- [ ] **Step 3:** 어드민 콘솔에서 임계점을 1로 낮춤 → A와 B 보드 자동 오픈
- [ ] **Step 4:** A로 로그인 → B 카드 보임 → 클릭 → 확인 모달 → 확인하기 → B 인스타 ID 표시 + 복사 동작
- [ ] **Step 5:** A 보드로 복귀 → B 카드 사라짐 확인
- [ ] **Step 6:** A "내 매칭" → B 카드 보관 + 복사 가능
- [ ] **Step 7:** A "내 카드" → 한 줄 소개 수정 → 킬 스위치 → B 보드에서 A 카드 사라짐 확인
- [ ] **Step 8:** A "계정 삭제" → users/cards/matches에서 A 정보 사라짐 확인
- [ ] **Step 9:** 어드민에서 종료 시각을 1분 후로 설정 → 1분 후 B 보드 자동 잠금 + /end 페이지로 이동
- [ ] **Step 10:** 어드민에서 "세션 종료 + 데이터 폐기" → 모든 테이블 비워짐 확인

---

## Self-Review (작성 후 점검)

### Spec coverage
- [x] 청대 이메일 + 매직링크: Tasks 11-13
- [x] 1:1 모델 (1 카드 = 1 슬롯): RLS + RPC (Tasks 5-6) + 매칭 API (Task 24)
- [x] 임계점 게이팅: Tasks 20-21
- [x] 라이브 카운터 + 색상 단계: Task 20
- [x] 하이브리드 포스트잇 그리드: Tasks 18, 22-23
- [x] 확인 모달 + 인스타 공개 (복사 only): Task 23
- [x] 본 카드 사라짐: RLS (Task 5)
- [x] 내 매칭 페이지: Task 25
- [x] 킬 스위치 + 계정 삭제: Task 26
- [x] 카운트다운 배너 + 종료 페이지: Tasks 27-28
- [x] 어드민 (통계/검색/사용자/세션/폐기): Tasks 29-32
- [x] 자동 시작/종료 (RLS 시각 검증): Tasks 5, 7
- [x] 수동 폐기: Task 32
- [x] 보안 헤더: Task 33
- [x] 사용자 문의 X (푸터에 메일 없음): 디자인상 미구현
- [x] 비속어/전화번호 필터: Task 10
- [x] 약관/개인정보 처리방침: Task 16
- [x] 배포 + 시나리오 테스트: Tasks 34-35

### Placeholder scan
- 비속어 사전이 짧은 인라인 리스트. Production에서는 더 큰 사전 필요할 수 있으나 초기 운영에 충분.
- pg_cron `session_tick`은 현재 빈 함수. 실제 동작은 RLS가 처리. 미래 확장용.

### Type 일관성
- `BoardCard`는 `app/board/page.tsx` 안에서 `{id, one_liner, color}`. `lib/types.ts`의 `BoardCard`는 gender 포함. UI에선 gender 안 씀 → page-local 타입으로 OK.
- `PostitColor`는 모든 곳에서 import해서 사용.

### Scope
- 단일 plan으로 적절. 모듈 분리 명확.

---

## Execution Notes

- 모든 Task는 독립적으로 실행 가능 (의존성 있는 부분은 명시적으로 commit 순서).
- 실제 매직링크 발송 테스트는 Resend SMTP 또는 Supabase 기본 메일이 동작해야 함 (Task 11 Step 7).
- 외부 계정 세팅 (Pre-1~Pre-4)이 완료되어야 Task 4부터 진행 가능.
