// 대한민국 공휴일 조회 — 동기(sync) 함수만 제공한다. computeDeadlines/toPurchaseResponse처럼
// 이미 광범위하게 동기로 쓰이는 호출부를 비동기로 바꾸지 않기 위해, 런타임에 API/패키지를
// 부르지 않고 빌드 시 생성해둔 정적 데이터(kr-holidays-data.ts)만 참조한다.
//
// kr-holidays-data.ts는 workers/scripts/generate-kr-holidays.mjs로 생성되며 2018~2027년
// 데이터만 커버한다 — 다음 해가 관보에 확정되면 그 스크립트를 다시 실행해서 갱신할 것
// (실제로 발견된 사례: 카카오페이 테스트 CID처럼 주기적으로 사람이 챙겨야 하는 유지보수 항목).

import { KR_HOLIDAY_DATES } from './kr-holidays-data';

/**
 * 배송이 이뤄지지 않는 날인지 — 토요일·일요일이거나 대한민국 공휴일이면 true.
 * 실제 정기배송 사례(회차별 상세정보 캡처)를 역산한 결과, "결제일 + N영업일 = 도착예정일"
 * 규칙에서 토요일도 영업일에서 제외해야 정확히 들어맞았다(택배가 토요일에도 배송되는 경우가
 * 있지만, 이 계산은 그런 예외를 다 맞추려는 게 아니라 합리적인 근사치를 내는 게 목적).
 */
export function isNonDeliveryDay(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=일, 6=토
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;
  return KR_HOLIDAY_DATES.has(dateStr);
}
