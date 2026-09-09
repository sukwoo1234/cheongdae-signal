**보안 수정 후 회귀 검증 — 2026-09-09, Asia/Seoul**

감사에서 확인한 Critical/High 경계를 수정한 뒤 다음 검증을 추가로 수행했다.

| 명령 | 수정 후 결과 |
|---|---|
| `npm test -- --run` | 9 files / 49 tests passed |
| `npx tsc --noEmit --incremental false` | exit 0 |
| `npm run build` | exit 0 |
| `npm run test:security-db` | 16 security regression checks passed |
| `npm audit --ignore-scripts --json` | 0 vulnerabilities |

DB 회귀 테스트는 전체 마이그레이션을 빈 PostgreSQL 호환 엔진에 적용한 뒤 합성
사용자로 다음을 직접 검증한다: 카드 열람 상한, 상대 계정 삭제 뒤 슬롯 복구 방지,
같은 이메일 재가입 뒤 슬롯 복구 방지, 보너스 슬롯 중복 지급 방지, 차단 사용자의
민감 RPC 접근 차단, 카드 직접 수정 권한 회수, 학교 밖 이메일 변경 차단, 행사 폐기와
행사 ID 교체. 외부 이메일·운영 계정·운영 DB에는 접근하지 않는다.

아래 내용은 **수정 전 취약 동작을 기록한 역사적 감사 증거**다. `audit-*` 재현 파일은
수정 전 동작을 기대하므로 현재 코드에서 실패하는 것이 정상이며, 배포 판정에는 위의
`test:security-db`와 일반 테스트를 사용한다.

---

**최초 보안 감사 실행 기록 — 2026-09-09, Asia/Seoul**

작업 시작 HEAD: `a7c7956` (`feat: refresh product and admin interface`). Node `v22.18.0`. 아래는 이번 실행에서 관찰한 결과를 정리한 기록이다. 운영 서비스 침투 결과나 수정 후 회귀 검증으로 해석하지 않는다.

| 명령 | 실행 결과 |
|---|---|
| `npm.cmd test` | 8 files passed / 37 tests passed. 최초 실행 시점 기준 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit 0. 감사 테스트 추가 후에도 실행 |
| `npm.cmd audit --json --ignore-scripts --cache .next/audit-npm-cache` | exit 0; vulnerabilities `{}`; total 0 |
| `node docs/security/audit-db-repro.mjs` | exit 0; 아래 13개 관찰 성립 |
| `node node_modules/vitest/vitest.mjs run --config docs/security/vitest.audit.config.mts` | exit 0; 1 file / 5 tests passed |
| `node docs/security/audit-secret-scan.mjs` | exit 0; 115 tracked / 266 history blobs / 102 browser build files / hits 0 |
| `docker ps` | 엔진 연결 불가. Docker 기반 Supabase 테스트 미실행 |

첫 npm audit 시도는 sandbox 네트워크로 실패했다. 이후 네트워크 실행 권한을 사용해 npm registry에 잠금 파일의 의존성 목록을 대조했고 위 0건 결과를 얻었다. API key나 환경파일 내용은 registry에 전달하지 않았다.

**DB 관찰 결과**

```text
Loaded migrations 0001-0012; JWT identity injected; cron not exercised.
OBSERVED 1: first reveal returns synthetic target B
OBSERVED 2: default null card cap reveals B to a SECOND viewer
OBSERVED 3: banned viewer still receives target instagram_id from direct my_matches RPC
OBSERVED 4: banned viewer can bypass app validation and store phone-shaped content
OBSERVED 5: changed external Auth email still passes DB session boundary
OBSERVED 6: external password user can query another user gender via helper RPC
OBSERVED 7: external password user can query card fullness via helper RPC
OBSERVED 8: target account deletion erases existing viewer match / spent slot
OBSERVED 9: same unchanged viewer obtains a SECOND target after target deletion
OBSERVED 10: same email re-registration obtains another fresh slot
OBSERVED 11: negative control: password session cannot use protected my_matches
OBSERVED 12: negative control: direct instagram_id SELECT rejected
OBSERVED 13: negative control: user privilege escalation rejected
```

1은 정상 동작, 11–13은 현재 방어의 대조군이다. 2–10은 보고서에서 평가한 제한 우회/정보 공개 동작이다. 13개 전부를 취약점 13건 또는 보안 통과 13건으로 계산하지 않는다.

마이그레이션은 파일 순서대로 적용했다. 테스트용 role과 최소 auth.users를 만들고 `auth.uid()`/`auth.jwt()`가 주입된 claims를 읽도록 구성했다. JWT 서명 검증을 재현한 것은 아니다. 사용자 행 삭제는 실제 Auth REST API 대신 SQL DELETE로 FK cascade를 재현했고 새 계정도 합성 fixture로 삽입했다. `pg_cron`은 미실행, `pgcrypto` 설치는 생략했다. 운영 DB에서 현재 migration이 적용되어 있는지는 별도 확인 대상이다. 한 연결에서 순차 실행했으므로 경합 안전성은 이 결과가 보장하지 않는다.

**런타임 관찰 결과**

```text
PASS: arbitrary CAPTCHA text is forwarded with service-role Authorization
PASS: email quota is consumed before failed CAPTCHA/send verification
PASS: ban sends user UUID as bearer token and still returns success on Auth 401
PASS: equal UTF-16 length / unequal UTF-8 bytes cause timingSafeEqual exception
PASS: production HTTP site URL disables Secure cookie option
```

첫 번째와 세 번째 테스트는 설치된 실제 Supabase SDK를 사용한다. 네트워크 fetch는 테스트 함수로 대체해 request header/body 및 API 반환을 관찰했다. Auth 서버의 CAPTCHA skip 동작은 보고서의 공식 공급자 소스로 별도 확인했으며, 테스트가 실제 Hosted CAPTCHA나 이메일 발송을 호출한 것은 아니다.

**비밀정보 검사 범위**

```json
{
  "trackedFiles": 115,
  "historyBlobsUnder2MB": 266,
  "browserBuildFiles": 102,
  "knownSecretValuesCompared": 1,
  "hits": []
}
```

현재 .env.local의 서버 비밀값과 exact 비교, private-key/GitHub/AWS 패턴, service_role JWT payload 패턴을 사용했다. 값은 출력하지 않았다. Git 전체 refs에서 2MB 이하 blob을 읽었으며 큰 blob, 과거 삭제된/교체된 모든 종류의 비밀값, 클라우드 빌드 로그, 배포 secret 접근권, 키 유효성은 검사하지 않았다. 기존 .next/static은 이전 빌드 산출물일 수 있어 현재 소스의 신규 빌드 검증을 대체하지 않는다.

**안전하게 재실행하는 방법**

프로젝트 루트에서 실행한다. DB/SDK 재현은 .env.local을 로드하지 않고 외부 이메일·운영 계정·DB에 접근하지 않는다. 비밀정보 스캐너만 로컬 .env.local을 읽으며 값은 외부로 보내지 않는다.

```powershell
# 일회성 임시 도구 설치. 앱의 package.json/lock은 변경하지 않는다.
npm.cmd install --prefix .next/security-audit-tools --no-save --package-lock=false --ignore-scripts --no-audit --no-fund --cache .next/audit-npm-cache @electric-sql/pglite@0.3.14

node docs/security/audit-db-repro.mjs
node node_modules/vitest/vitest.mjs run --config docs/security/vitest.audit.config.mts
node docs/security/audit-secret-scan.mjs
```

이 테스트들은 의도적으로 취약한 현재 동작을 기대한다. 수정 후 실패할 수 있으며 그때는 보안 요구 조건(반환 거부, 소비 원장 보존, 검증 전 quota 미소비)을 검증하도록 바꾼다. 기존 scripts/verify-security.mjs, verify-view-cap.mjs, verify-wipe.mjs는 운영 연결로 실행하지 않았다.
