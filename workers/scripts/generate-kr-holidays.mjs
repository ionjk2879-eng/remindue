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

const dates = Object.values(allYears)
  .flatMap((yearData) => Object.keys(yearData))
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
