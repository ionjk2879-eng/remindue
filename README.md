# Remindue — 내 구매 라이프사이클 관리 (Phase 0)

가전제품 보증기간, 온라인 주문 반품기한, 정기배송 다음 배송일을
한곳에 등록하고 기한이 임박한 순서로 챙겨주는 서비스.

## 왜 세 가지를 하나로 묶었나

"등록 → 기한 계산 → 알림"이라는 공통 뼈대를 공유하기 때문에, 하나의
`Purchase` 엔티티에 종류(`type`)만 다르게 두고 종류별로 기한 계산 방식만
다르게 처리하는 구조로 만들었다.

| 종류 | 등록하는 것 | 계산되는 기한 |
| --- | --- | --- |
| ELECTRONICS | 가전제품 구매일 + 보증개월수 | 보증만료일 |
| ONLINE_ORDER | 온라인 주문 수령일 + 반품기한일수(기본 7일) | 반품기한 |
| RECURRING_DELIVERY | 정기배송 시작일 + 배송주기일수 | 다음 배송일 |

## Phase 0에서 완성된 것

- Spring Boot REST API 뼈대 (JWT 인증, CORS 설정) — Pinpoint 프로젝트의 인증 보일러플레이트 재사용
- 회원가입 / 로그인 API
- 세 종류를 한 번에 다루는 Purchase CRUD API
- D-day 자동 계산, 임박 순 정렬
- 정기배송 전용 "배송 받음" 처리 (다음 배송일 갱신)
- React + TypeScript 프론트엔드 — 종류별 입력 폼 분기, D-day 색상 표시, 7일 이내 임박 항목 상단 경고
- 실제 알림 — Cron Trigger(매일 KST 09시)로 D-day 7/3/1/0인 항목을 모아 사용자당
  이메일(Resend) 다이제스트와 브라우저 Web Push(PWA, VAPID)를 독립적으로 발송
  ※ iOS Safari 웹 푸시는 미검증 상태입니다 (테스트 기기 없음). 표준 Web Push API +
  유효한 manifest 기준으로 iOS 16.4+에서 동작해야 하지만, 실기기 확인이 필요합니다.
- 이메일 포워딩으로 온라인 주문확인 메일 자동 등록 — 사용자마다 고유 수신 주소
  (`add-{token}@remindue.kr`)를 발급하고, 그 주소로 전달된 메일을 Cloudflare Email
  Routing → Worker `email()` 핸들러가 받아 Claude(Haiku)로 "주문확인 메일이 맞는지 +
  상품명/주문일/반품기한/예상배송일"을 추출한다. 바로 등록하지 않고 "확인 대기" 상태로
  쌓아두며, 사용자가 대시보드에서 확인 후 등록/무시를 선택한다.

## 아직 없는 것 (다음 단계 후보)

- 영수증 사진 OCR로 자동 등록 (지금은 이메일 포워딩만 지원 — 다만 `pending_purchases`
  테이블에 `source` 컬럼을 email/image 공용으로 만들어둬서, OCR을 붙일 때 같은
  "확인 대기" 큐/UI를 그대로 재사용할 수 있게 해뒀다)
- 온라인 주문의 반품기한 기본값(7일)이 상품 종류(단순변심 불가 품목 등)에 따라
  달라지는 예외 처리 — 지금은 일괄 7일로 단순화

## 로컬 실행 방법

```bash
# 백엔드 (Cloudflare Workers + D1 — 실사용 백엔드)
cd workers
npm install
npm run db:migrate:local
npm run dev             # http://localhost:8787

# 백엔드 (Spring Boot — backend/는 로직 참고용으로만 유지, 배포 안 함)
cd backend
./gradlew bootRun       # http://localhost:8080

# 프론트엔드
cd frontend
npm install
npm run dev              # http://localhost:5173
```

## 배포

GitHub `main` 브랜치에 push하면 Cloudflare Workers Builds가 각각 자동 배포한다.

| 프로젝트 | Root directory | 배포 URL |
| --- | --- | --- |
| 백엔드 (`workers/`) | `workers` | https://remindue.ionjk2879.workers.dev |
| 프론트엔드 (`frontend/`) | `frontend` | https://remindue-frontend.ionjk2879.workers.dev |

수동 배포:
```bash
cd workers && npm run deploy
cd frontend && npm run deploy
```

## 이메일 포워딩 자동 등록 — Cloudflare 대시보드 설정

코드(Worker의 `email()` 핸들러, `wrangler.jsonc`)는 이미 준비돼 있다. 아래는 Cloudflare
대시보드에서 한 번만 해주면 되는 절차.

1. **Worker에 최신 코드 배포** — `email()` 핸들러가 반영된 버전이 떠 있어야 라우팅에서
   선택할 수 있다: `cd workers && npm run deploy`
2. **시크릿/변수 확인**
   - `wrangler secret put ANTHROPIC_API_KEY` — platform.claude.com에서 발급한 키
   - `wrangler.jsonc`의 `vars.FORWARDING_EMAIL_DOMAIN`이 실제 도메인(`remindue.kr`)과
     일치하는지 확인 (이미 설정해둠)
3. **Cloudflare 대시보드 → 해당 도메인(remindue.kr) → 좌측 메뉴 `Email` → `Email Routing`**
   으로 이동해서 "Get started"로 Email Routing을 켠다 — 필요한 MX/TXT 레코드를
   Cloudflare가 도메인 DNS에 자동으로 추가해준다(활성화까지 보통 몇 분).
4. **Routing rules → Catch-all address** 설정
   - 사용자마다 수신 주소(`add-{token}@remindue.kr`)가 전부 달라서 주소 하나하나를
     개별 규칙으로 등록할 수 없다 — Cloudflare Email Routing의 개별 규칙은 로컬파트
     와일드카드를 지원하지 않으므로, **Catch-all**로 도메인에 오는 모든 메일을 Worker로
     보내는 게 유일한 방법이다.
   - Action: **Send to a Worker** 선택 → Destination: 배포된 Worker(`remindue`) 선택 →
     저장.
   - `add-`로 시작하지 않는 주소나 존재하지 않는 토큰으로 온 메일은 Worker의
     `email-intake.ts`가 조용히 무시하도록 이미 처리돼 있어서, catch-all이어도 안전하다.
5. **테스트** — 로그인 후 대시보드에서 본인 전용 주소(`add-xxxx@remindue.kr`)를 확인하고,
   실제 쇼핑몰 주문확인 메일을 그 주소로 전달(포워딩)해본다. 몇 초~1분 내로 대시보드의
   "확인 대기 중인 항목"에 올라오면 정상.

## API 요약

| Method | URL | 설명 | 인증 |
| --- | --- | --- | --- |
| POST | /api/auth/signup | 회원가입 | X |
| POST | /api/auth/login | 로그인 | X |
| GET | /api/purchases | 내 항목 목록 (D-day 임박순 정렬) | O |
| POST | /api/purchases | 항목 등록 | O |
| PUT | /api/purchases/{id} | 항목 수정 | O |
| DELETE | /api/purchases/{id} | 항목 삭제 | O |
| POST | /api/purchases/{id}/mark-delivered | 정기배송 "배송 받음" 처리 | O |
| GET | /api/pending-purchases | 내 전용 수신 주소 + 확인 대기 목록 | O |
| POST | /api/pending-purchases/{id}/confirm | 확인 대기 항목을 등록완료로 표시 | O |
| POST | /api/pending-purchases/{id}/ignore | 확인 대기 항목 무시 | O |

## 프로젝트 구조

```
backend/src/main/java/com/remindue/
  domain/user/        # User 엔티티 (Pinpoint와 동일 재사용)
  domain/purchase/     # Purchase 엔티티, PurchaseType enum
  security/            # JWT 발급/검증, Spring Security 설정
  auth/                # 회원가입/로그인 API
  purchase/             # Purchase CRUD API
  common/               # 예외 처리

frontend/src/
  api/         # axios 클라이언트, API 호출 함수
  context/     # 인증 상태 관리
  pages/       # 로그인/회원가입/대시보드
  types/       # TypeScript 타입 정의
```
