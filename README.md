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

## 아직 없는 것 (다음 단계 후보)

- 실제 알림(이메일/푸시) — 지금은 대시보드에 접속해야만 확인 가능
- 영수증 사진 OCR로 자동 등록 (지금은 수동 입력)
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
