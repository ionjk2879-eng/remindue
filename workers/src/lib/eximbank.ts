// 한국수출입은행 Open API(https://www.koreaexim.go.kr) — 실제 시중은행 기준 매매기준율/
// 전신환매도율(tts)을 무료로 제공한다. 이전엔 Frankfurter(ECB 공시환율)에 고정 스프레드(1.4%)를
// 얹어 전신환매도율을 근사했는데, 실측 검증 결과 이 API의 실제 tts를 쓰면 그 근사 자체가
// 필요 없어진다 — 스프레드 계산 없이 실제 은행 환율을 그대로 반영할 수 있다.
//
// 주의: 이 API는 영업일(평일, 공휴일 제외)에만 데이터를 준다 — 주말/공휴일에 조회하면 빈
// 배열이 온다(주말이라 없는 게 아니라 그 날짜엔 아예 고시가 안 된다). fetchEximRates가 최대
// EXIM_LOOKBACK_DAYS일 전까지 거슬러 올라가며 가장 최근 영업일 데이터로 폴백한다.
//
// cur_unit이 "JPY(100)"처럼 100엔 단위로 오는 통화가 있다(엔화·인도네시아 루피아 등 저액면
// 통화) — parseCurUnit이 그 배수를 걷어내고 1단위 환율로 정규화한다.

const EXIM_LOOKBACK_DAYS = 10;

export interface EximRate {
  /** 매매기준율 — 트래블카드류(수수료 0%) 계산과, 전신환매도율을 못 구했을 때의 폴백 기준값. */
  dealBasR: number;
  /** 전신환매도율 — 카드사·브랜드 수수료 계산의 실제 기준환율(fx-card.ts). */
  tts: number;
}

function formatYyyymmdd(dateStr: string): string {
  return dateStr.replaceAll('-', '');
}

function shiftDateOnly(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** "JPY(100)"처럼 배수가 붙은 통화 단위를 통화 코드와 배수로 분리한다. 배수 없으면 1. */
export function parseCurUnit(curUnit: string): { code: string; perUnits: number } {
  const match = /^([A-Z]+)\((\d+)\)$/.exec(curUnit);
  if (match) return { code: match[1], perUnits: Number(match[2]) };
  return { code: curUnit, perUnits: 1 };
}

interface EximApiRow {
  result: number;
  cur_unit: string;
  ttb: string;
  tts: string;
  deal_bas_r: string;
}

/** 콤마 포함 숫자 문자열("1,441.1")을 안전하게 파싱한다. */
export function parseCommaNumber(value: string): number | null {
  const parsed = Number(value.replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 그 날짜의 전체 환율 목록을 Cloudflare 엣지 캐시(caches.default)에 24시간 보관한다 — 같은 날짜를
 * 여러 통화·여러 사용자가 조회해도 실제 API 호출은 하루 한 번이면 된다(무료 API라도 호출량을
 * 아끼는 게 예의이자, 응답 속도에도 유리하다). 캐시 키에는 authkey를 넣지 않는다(키가 캐시
 * URL에 노출/로그되는 걸 피하기 위해) — 날짜별로만 구분한다.
 */
async function fetchRatesForDate(dateStr: string, apiKey: string): Promise<Map<string, EximRate> | null> {
  const cacheKey = new Request(`https://cache.internal/eximbank-rates/${dateStr}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  const rows = cached
    ? await cached.json<EximApiRow[]>()
    : await (async () => {
        const url = `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${apiKey}&searchdate=${formatYyyymmdd(dateStr)}&data=AP01`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const body = await res.json<EximApiRow[]>();
        // 빈 배열(주말/공휴일이라 데이터 없음)도 그대로 캐싱한다 — 다음 요청이 같은 날짜를
        // 또 헛되이 조회하지 않게. 진짜 오류(비정상 응답)만 캐시하지 않는다.
        if (Array.isArray(body)) {
          await cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'Cache-Control': 'max-age=86400' } }));
        }
        return body;
      })();

  if (!Array.isArray(rows) || rows.length === 0) return null;

  const map = new Map<string, EximRate>();
  for (const row of rows) {
    if (row.result !== 1) continue;
    const { code, perUnits } = parseCurUnit(row.cur_unit);
    const dealBasR = parseCommaNumber(row.deal_bas_r);
    const tts = parseCommaNumber(row.tts);
    if (dealBasR === null || tts === null) continue;
    map.set(code, { dealBasR: dealBasR / perUnits, tts: tts / perUnits });
  }
  return map.size > 0 ? map : null;
}

/**
 * currency(ISO 4217, 예: "USD")의 dateStr 기준 환율을 구한다 — 주말/공휴일이면 최대
 * EXIM_LOOKBACK_DAYS일 전까지 하루씩 거슬러 올라가며 가장 최근 영업일 값으로 폴백한다.
 * dateStr이 없거나(orderDate 미확인) 형식이 안 맞으면 오늘부터 거슬러 올라간다.
 * API 실패·통화 미지원 등 어떤 이유로든 못 구하면 null — 호출부(convertToKrw)가 Frankfurter로
 * 폴백한다.
 */
export async function fetchEximRate(currency: string, dateStr: string | null, apiKey: string): Promise<EximRate | null> {
  const startDate = dateStr !== null && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : new Date().toISOString().slice(0, 10);
  let cursor = startDate;
  for (let i = 0; i <= EXIM_LOOKBACK_DAYS; i++) {
    try {
      const rates = await fetchRatesForDate(cursor, apiKey);
      if (rates) {
        const rate = rates.get(currency);
        if (rate) return rate;
        // 그 날짜엔 데이터가 있는데 통화 자체를 이 API가 취급 안 하면(마이너 통화) 더 거슬러
        // 올라가봤자 소용없으므로 바로 포기하고 Frankfurter 폴백에 맡긴다.
        return null;
      }
    } catch {
      return null;
    }
    cursor = shiftDateOnly(cursor, -1);
  }
  return null;
}
