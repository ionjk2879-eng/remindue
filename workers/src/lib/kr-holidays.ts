// 대한민국 공휴일 조회 — 동기(sync) 함수만 제공한다. computeDeadlines/toPurchaseResponse처럼
// 이미 광범위하게 동기로 쓰이는 호출부를 비동기로 바꾸지 않기 위해, 런타임에 API/패키지를
// 부르지 않고 빌드 시 생성해둔 정적 데이터(kr-holidays-data.ts)만 참조한다.
//
// kr-holidays-data.ts는 workers/scripts/generate-kr-holidays.mjs로 생성되며 2018~2027년
// 데이터만 커버한다 — 다음 해가 관보에 확정되면 그 스크립트를 다시 실행해서 갱신할 것
// (실제로 발견된 사례: 카카오페이 테스트 CID처럼 주기적으로 사람이 챙겨야 하는 유지보수 항목).

import { KR_HOLIDAY_DATES } from './kr-holidays-data';

/**
 * 택배가 배송되지 않는 날인지 — 일요일이거나 대한민국 공휴일이면 true. 토요일은 포함하지
 * 않는다: 실제 사례(2026-07-30 목요일 주문 → 실제 2026-08-01 토요일 도착)로 확인된 대로
 * 택배는 토요일에도 정상적으로 움직인다. 도착예정일 계산(addBusinessDays)에서만 쓴다 —
 * 결제일 역산(subtractBusinessDays)은 카드/스토어 처리 기준이라 토요일도 쉬므로
 * isNonBusinessDay를 따로 쓴다.
 */
export function isNonDeliveryDay(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=일, 6=토
  if (dayOfWeek === 0) return true;
  return KR_HOLIDAY_DATES.has(dateStr);
}

/**
 * 결제(카드/스토어 처리)가 이뤄지지 않는 날인지 — 토요일·일요일이거나 대한민국 공휴일이면
 * true. 실제 정기배송 실측 데이터(19회차) 전부에서 결제일이 토·일에 걸린 사례가 하나도
 * 없었다 — 도착예정일에서 이 기준으로 영업일만큼 거꾸로 세면(subtractBusinessDays) 결제일과
 * 정확히 일치했다. 도착일 계산(addBusinessDays)에는 쓰지 않는다 — 그쪽은 isNonDeliveryDay 참고.
 */
export function isNonBusinessDay(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=일, 6=토
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;
  return KR_HOLIDAY_DATES.has(dateStr);
}
