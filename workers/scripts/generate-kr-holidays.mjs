// 1회성 로컬 스크립트 — @hyunbinseo/holidays-kr(관보 기반, MIT)이 번들에 포함한 연도별 데이터를
// 모아서 workers/src/lib/kr-holidays-data.ts를 생성한다. 이 패키지 자체는 배포되는 Worker
// 번들에 들어가지 않는다(computeArrivalEstimate 등은 동기 함수라야 해서, 런타임에 이 패키지를
// import하지 않고 빌드 시 생성한 정적 데이터만 쓴다).
//
// 실행: node scripts/generate-kr-holidays.mjs
// 다음 해가 관보에 확정되어 패키지가 업데이트되면(npm update @hyunbinseo/holidays-kr 후)
// 다시 실행해서 kr-holidays-data.ts를 갱신해야 한다.

import * as allYears from '@hyunbinseo/holidays-kr/all';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 근로자의 날(노동절)은 관공서 공휴일(대체공휴일 대상)이 아니라 근로기준법상 유급휴일이라
// 택배·배송업이 실제로 쉬지 않는다 — 실제 정기배송 결제/도착일 데이터로 검증됨(2027-05-03
// "대체공휴일(노동절)"에 도착 예정인 사례가 실제로 그 날짜 그대로 도착 처리됨). 배송일 계산에서는
// 이 이름이 붙은 날짜를 공휴일 집합에서 제외한다.
const dates = Object.entries(allYears)
  .flatMap(([, yearData]) => Object.entries(yearData))
  .filter(([, names]) => !names.some((name) => name.includes('노동절')))
  .map(([date]) => date)
  .sort();

const years = Object.keys(allYears)
  .map((key) => key.replace('y', ''))
  .sort();

const out = `// 자동 생성 파일 — workers/scripts/generate-kr-holidays.mjs로 생성됨. 직접 수정하지 말 것.
// 출처: @hyunbinseo/holidays-kr(관보/한국천문연구원 월력요항 기반, MIT). 커버 연도: ${years.join(', ')}.
// 다음 해가 관보에 확정되면 npm update @hyunbinseo/holidays-kr 후 이 스크립트를 다시 실행할 것.

export const KR_HOLIDAY_DATES: ReadonlySet<string> = new Set([
${dates.map((d) => `  '${d}',`).join('\n')}
]);
`;

const outPath = resolve(__dirname, '../src/lib/kr-holidays-data.ts');
writeFileSync(outPath, out, 'utf8');
console.log(`[generate-kr-holidays] ${dates.length}개 공휴일(${years[0]}~${years[years.length - 1]}) -> ${outPath}`);
