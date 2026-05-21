# 청대 시그널 — 디자인 스펙

**작성일**: 2026-05-21
**상태**: 디자인 확정, 구현 대기
**책임자**: admin@example.com

## 개요

청주대학교 학생을 대상으로 한 2일 한정 온라인 인스타 매칭 웹앱. 오프라인 "시그널" 행사(포스트잇 보드 + 인스타 교환)를 디지털화하면서 다음 4가지 문제를 해결한다:

1. 줄·정리 안 됨 → 자동화된 등록/매칭
2. 손글씨 인스타 ID 식별 불가 → 텍스트 입력 + 복사 가능
3. 성비 불균형 좌절 → 임계점 게이팅 + 라이브 카운터
4. 한 사람이 여러 인스타 수집 → 1:1 모델 (1 카드 = 1 인스타 확인)

## 목표 (Goals)

- 청대 학생 한정으로 안전하게 매칭
- 무차별 인스타 수집 차단 (1:1 강제)
- 텅 빈 보드 좌절 차단 (임계점 게이팅)
- 행사 종료 시 데이터 완전 폐기 (PIPA 준수)
- 어드민 1인이 손쉽게 운영 (자동 시작/종료)

## 비목표 (Non-goals)

- 결제 / 수익화
- 신고 시스템 (어드민 사후 처리만)
- 푸시 알림 / SMS
- 상시 운영
- 다른 학교 확장 (2회차 이후)
- 다국어 / 다크모드
- 매칭 후 채팅 (인스타로 이동)

## 핵심 모델

**1 계정 = 1 카드 = 인스타 1회 확인 (회복 불가)**

- 1 청대 이메일 = 1 사용자 계정 = 1 카드
- 1 카드 등록 시 슬롯 1개 부여 (인스타 1번 볼 권리)
- 슬롯 소비 = 이성의 인스타 ID 1번 공개
- 이미 본 카드는 본인 보드에서 사라지고 "내 매칭"에 보관
- 슬롯 다 쓴 후엔 보드 둘러보기만 가능 (다른 카드 클릭은 안 열림)

## 사용자 흐름

### Step 1: 랜딩
- 헤드라인: "한 줄로 시작하는 인스타 매칭 — 청주대학교 학생 전용"
- 이메일 입력 (`@cju.ac.kr` 도메인 검증, 서버 측 재검증)
- "매직링크 받기" 버튼

### Step 2: 매직링크 대기
- "메일을 확인해주세요" 안내
- "다시 보내기" 옵션 (1분 쿨다운)
- 매직링크 유효 시간: **15분**

### Step 3: 성별 + 약관 (매직링크 클릭 후 복귀)
- 성별 선택 (남자 / 여자) — 변경 불가
- 이용약관 동의 (필수)
- 개인정보 처리방침 동의 (필수)
- 두 동의의 본문은 별도 모달/페이지로 확인 가능

### Step 4: 카드 작성
- 한 줄 소개 입력 (최대 **20자**, 실시간 글자수 표시)
- 인스타그램 ID 입력 (`@` 자동 제거, 정규식 검증: `^[a-zA-Z0-9._]{1,30}$`)
- 포스트잇 색 선택 (6종: 노랑·분홍·초록·파랑·보라·주황)
- 실시간 미리보기 (입력하면서 카드 형태 표시)
- 비속어 사전 + 전화번호 패턴(`010-?\d{4}-?\d{4}`) 사전 차단
- "보드에 올리기" 클릭 → 등록 완료

### Step 5: 보드 진입 (또는 임계점 대기)
- 양쪽 성별 각 5명 미만이면 게이팅 화면 (보드 잠금, 라이브 카운터, 자동 새로고침)
- 양쪽 5명 이상 + 시작 시각 도달 = 보드 오픈

### Step 6: 보드 둘러보기
- 하이브리드 포스트잇 그리드 (각 카드 = 한 줄 소개만 노출)
- 상단 라이브 성비 카운터 (남 N · 여 N)
  - 비율 색상: 6:4 이내 = 초록(양호) / 7:3 = 노랑(불균형) / ≥8:2 = 빨강(심각, "친구 부르기" 공유 버튼 노출)
- 상단 메뉴: "내 매칭", "내 카드"

### Step 7: 카드 클릭 → 확인 모달
- 한 줄 소개 다시 표시
- "이 카드의 인스타를 확인할까요? 슬롯은 한 번만 사용 가능해요"
- 버튼: "취소" / **"확인하기"** (primary)

### Step 8: 인스타 ID 공개 (같은 모달 전환)
- 카드 미리보기 + 인스타 ID (큰 글씨, monospace)
- "복사" 버튼 (clipboard API)
- 안내: "인스타 앱에서 직접 검색해서 팔로우 해주세요"
- **외부 인스타 deep link 없음**

### Step 9: 보드 복귀
- 본 카드는 본인 보드에서 사라짐
- 다른 카드는 보이지만 클릭 시 "슬롯 소진" 안내
- "내 매칭" 메뉴로 이동 가능

### Step 10: 내 매칭 페이지
- 본 카드 + 인스타 ID + 복사 버튼 (언제든 다시 확인 가능)
- 확인 시각 표시

### Step 11: 내 카드 관리 페이지
- 한 줄 소개·인스타 ID·색 수정
- **킬 스위치** — 카드 보드에서 내림 (이미 본 사람의 인스타 회수는 불가, 안내문구 표시)
- 즉시 계정 삭제 (PIPA 권리 행사)

### Step 12: 행사 종료 24h / 1h 전
- 사용자 화면 상단에 카운트다운 배너
- "행사 종료 X시간 X분 남음. '내 매칭'에서 인스타 ID 백업해두세요"

### Step 13: 행사 종료 정각
- 보드 자동 잠금 (등록·매칭·열람 불가)
- 사용자 강제 로그아웃 + "종료" 안내 페이지

### Step 14: 어드민 수동 폐기
- 어드민이 "세션 종료 + 데이터 폐기" 빨간 버튼 클릭
- 전체 cascade delete (users, cards, matches 등 전부)

## 보드 디자인

- 레이아웃: **하이브리드 포스트잇 그리드** (정돈된 그리드 + 포스트잇 색감 + 카드별 약간의 회전 ±2°)
- 카드 사이즈: 모바일 2열, 태블릿 3열, PC 4~5열 (반응형)
- 카드 내용: 한 줄 소개만 (≤20자)
- "본 카드" 처리: 본인 보드에서 즉시 제거
- **정렬 순서**: 매 페이지 로드 시 무작위 셔플 (편향 방지, 신규 카드 발견 용이)

## 카드 작성 입력 검증

| 필드 | 규칙 |
|---|---|
| 한 줄 소개 | 최대 20자, 비속어 사전 차단, 전화번호 패턴 차단 |
| 인스타 ID | `^[a-zA-Z0-9._]{1,30}$`, `@` 자동 제거 |
| 색 | 6종 enum 중 하나 |
| 성별 | 등록 시 1회만, 변경 불가 |

## 어드민 콘솔

**접근**: 이메일 화이트리스트 (`admin@example.com`만 통과)

**기능**

1. **라이브 통계** — 남/여 등록 수, 누적 매칭 수, 보드 상태
2. **카드 검색 + 강제 숨김 / 삭제+차단** — 소개 텍스트 grep, 부적절 콘텐츠 처리
3. **사용자 조회** — 이메일로 검색, 슬롯 1회 부여 (가짜 인스타 회복용), 차단
4. **세션 설정** — 시작 시각, 종료 시각, 임계점 N (기본 5)
5. **보드 잠금/해제 수동 토글** — 응급용 (스팸 폭주 등)
6. **세션 종료 + 데이터 폐기** — 빨간 버튼, cascade delete

## 자동화 / 스케줄러

**Supabase pg_cron** 매분 실행:

1. 시작 시각 도달 + 양쪽 임계점 충족 → 보드 오픈 플래그 ON
2. 종료 시각 도달 → 보드 잠금 (등록·매칭·열람 정지) + 사용자 강제 로그아웃
3. **데이터 폐기는 자동 X** — 어드민이 수동 트리거

## 데이터 모델

### `users` (Supabase auth.users 확장)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid | PK, auth.users 연결 |
| email | text | unique, `@cju.ac.kr` |
| gender | text | 'M' \| 'F', 1회 설정 |
| terms_accepted_at | timestamptz | NOT NULL |
| privacy_accepted_at | timestamptz | NOT NULL |
| banned | boolean | default false |
| banned_reason | text | nullable |
| created_at | timestamptz | default now() |

### `cards`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK users, unique (1 카드/사용자) |
| one_liner | text | ≤20자 |
| instagram_id | text | **pgsodium 암호화 컬럼** |
| color | text | enum 6종 |
| hidden_by_user | boolean | default false (킬 스위치) |
| hidden_by_admin | boolean | default false |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | |

### `matches` (슬롯 소비 기록)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid | PK |
| viewer_user_id | uuid | FK users |
| viewed_card_id | uuid | FK cards |
| created_at | timestamptz | default now() |
| bonus | boolean | default false, 어드민이 부여한 추가 슬롯 |

**제약**: viewer당 1행 (bonus=false). bonus=true는 추가 가능.

### `session_config` (singleton, id=1)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | int | always 1 |
| starts_at | timestamptz | KST |
| ends_at | timestamptz | KST |
| threshold_male | int | default 5 |
| threshold_female | int | default 5 |
| force_locked | boolean | default false (어드민 응급 잠금) |
| updated_at | timestamptz | |

### `banned_emails`

| 컬럼 | 타입 |
|---|---|
| email | text PK |
| banned_at | timestamptz |
| reason | text |

## API 설계

```
POST   /api/auth/magic-link          — 이메일 입력, Supabase 매직링크
GET    /api/auth/callback             — 매직링크 콜백 핸들러
POST   /api/auth/logout

POST   /api/users/onboard             — 성별 + 약관 동의 저장 (최초 1회)
DELETE /api/users/me                  — PIPA 즉시 삭제

POST   /api/cards                     — 내 카드 생성 (사용자당 1회)
PATCH  /api/cards/me                  — 내 카드 수정
POST   /api/cards/me/toggle-hide      — 킬 스위치 on/off

GET    /api/board                     — 이성의 비숨김 카드 + 본인 본 카드 제외
GET    /api/session                   — 시작/종료 시각, 카운터, 게이팅 상태

POST   /api/matches                   — 카드 클릭, 슬롯 소비 + 인스타 ID 반환
GET    /api/matches/me                — 내가 본 카드 + 인스타 ID

# 어드민
GET    /api/admin/stats
GET    /api/admin/cards?q=<text>
POST   /api/admin/cards/:id/hide
POST   /api/admin/cards/:id/delete    — 카드 삭제 + 이메일 차단
GET    /api/admin/users/:email
POST   /api/admin/users/:id/grant-slot
POST   /api/admin/users/:id/ban
PATCH  /api/admin/session-config      — 시각/임계점 변경
POST   /api/admin/board/force-lock
POST   /api/admin/board/force-unlock
POST   /api/admin/wipe-data           — 빨간 버튼, 전체 cascade delete
```

## 보안 / 개인정보

### 인증
- Supabase Auth 매직링크 (1회용, 15분 만료)
- HttpOnly + Secure + SameSite=Strict 쿠키
- 서버 측 도메인 재검증 (`@cju.ac.kr`)
- 어드민: 이메일 화이트리스트 비교 (`admin@example.com`)

### 응답 헤더 (Next.js middleware)
```
Strict-Transport-Security: max-age=63072000
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'; default-src 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

### Supabase RLS 규칙
- **users**: 본인만 자기 row select/update
- **cards**: 본인 카드는 본인만. 다른 카드는 (gender != 본인 gender) AND (hidden 아님) AND (본인이 이미 본 게 아님) AND (보드 오픈 상태)일 때만 select. `instagram_id`는 별도 view에서 매칭 검증 후만 반환.
- **matches**: viewer_user_id = auth.uid()만 select/insert. insert 시 viewer의 기존 행 수 체크 (bonus=false면 0개만 허용).
- **session_config**: 누구나 read, 어드민만 write
- **banned_emails**: 어드민만

### 인스타 ID 암호화
- pgsodium으로 `cards.instagram_id` 컬럼 암호화
- 복호화는 API에서 슬롯 검증 통과 후에만
- 서버 로그에 평문 기록 절대 금지

### 비속어 / 연락처 필터
- 한국어 비속어 사전 (오픈소스 활용, 예: `korean-bad-words`)
- 전화번호 정규식: `0\d{1,2}-?\d{3,4}-?\d{4}`
- 등록 시 차단 → 어드민이 사후 grep으로 미감지분 점검

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프런트엔드 | Next.js (App Router, React 19) |
| 호스팅 | Vercel (무료 티어, HTTPS 자동) |
| DB / 인증 | Supabase (Postgres + Auth + Realtime + Vault + pg_cron) |
| 이메일 발송 | Resend (무료 티어) |
| 도메인 | `cheongdae-signal.vercel.app` (Vercel 무료) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS (포스트잇 색 팔레트 커스텀) |
| 다국어 | 한국어 only |

## 기본 설정값

| 항목 | 기본값 |
|---|---|
| 한 줄 소개 최대 글자수 | 20자 |
| 인스타 ID 길이 | 1~30자 |
| 포스트잇 색 | 6종 (노랑·분홍·초록·파랑·보라·주황) |
| 임계점 (양쪽 각 N명) | 5 |
| 매직링크 만료 | 15분 |
| 매직링크 재전송 쿨다운 | 1분 |
| 카운터 비율 단계 | 6:4 / 7:3 / 8:2 |
| 종료 사전 알림 | 24시간 전, 1시간 전 |

## 운영자 책임

**원칙**: 푸터/UI에 일반 문의 이메일 노출 X (시범 단계). 사용자 문의 시스템 미구현. 필요 시 향후 추가.

**행사 전 (1회)**
- 어드민 콘솔에서 시작/종료 시각 설정
- URL을 청대 커뮤니티에 공유 (에브리타임, 단톡방, 인스타 스토리)
- 행사 부스에 QR 코드 부착 (오프라인 진입로)

**행사 중 (수시)**
- 어드민 대시보드 하루 2~3회 확인
- 부적절 콘텐츠 grep으로 사이드 점검
- 사용자 문의 발생 시 슬롯 부여/차단

**행사 종료 후 (1회)**
- 어드민에서 "세션 종료 + 데이터 폐기" 빨간 버튼 클릭
- 폐기 완료 확인

## 일정 / 범위

- **운영 기간**: 2일 (날짜 추후 확정)
- **목표 규모**: 200명 (최대)
- **개발 기간**: 별도 구현 계획에서 산정

## 약관 / 개인정보 처리방침 (요구사항)

각각 1페이지 분량의 짧은 문서로 작성:

**이용약관**
- 서비스 목적 (청대 시그널 행사 매칭)
- 1 계정 1 카드 규칙
- 사용자 책임 (인스타 ID 진실성, 매칭된 인스타 무단 유포 금지)
- 서비스 종료 시점 (행사 종료 + 폐기)

**개인정보 처리방침**
- 수집 항목: 이메일, 성별, 한 줄 소개, 인스타 ID
- 수집 목적: 본 서비스 매칭 운영
- 보유 기간: 행사 종료 + 어드민 수동 폐기 시점까지
- 처리 위탁: Supabase (DB), Resend (이메일)
- 처리 책임자: admin@example.com (PIPA 의무 명시, 약관 본문 내에만 표시. 일반 UI/푸터엔 노출 X)
- 사용자 권리: 즉시 삭제 요청 가능 (앱 내 버튼)
