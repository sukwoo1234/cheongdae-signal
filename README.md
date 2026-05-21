# 청대 시그널

청주대학교 학생 한정 인스타 매칭 웹앱.

## 외부 계정 세팅 (구현 전 필수)

1. Supabase 무료 가입 → "cheongdae-signal" 프로젝트 생성 → 다음 값 메모:
   - Project URL
   - anon public key
   - service_role secret key
2. Resend 무료 가입 → API Key 발급
3. `.env.local` 작성 (`.env.example` 복사 후 값 채움)

## 로컬 실행

```bash
npm install
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase db push
npm run dev
```

http://localhost:3000

## 배포

GitHub push 후 Vercel에 import. 환경변수는 `.env.example` 항목 그대로 입력.

## 어드민 접근

`NEXT_PUBLIC_ADMIN_EMAIL`에 지정된 이메일로 로그인 후 `/admin` 접근.

## 디자인 스펙 / 구현 계획

- `docs/superpowers/specs/2026-05-21-cheongdae-signal-design.md`
- `docs/superpowers/plans/2026-05-21-cheongdae-signal-implementation.md`
