// 빌드 후 각 공개 페이지를 dist/{path}/index.html 로 프리렌더링한다.
// Cloudflare Workers Assets는 요청 경로와 일치하는 정적 파일이 있으면 SPA fallback보다
// 먼저 그 파일을 서빙하므로, /pricing → dist/pricing/index.html 이 존재하면 JS 실행 없이
// 즉시 HTML을 반환한다. 검색엔진 크롤러와 최초 방문자 모두 혜택을 받는다.
//
// /dashboard 등 로그인 필요 페이지는 그대로 클라이언트 라우팅에 맡긴다
// (같은 dist/index.html SPA fallback을 통해 서빙, 로그인 상태에 따라 즉시 리다이렉트).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// AuthContext가 렌더링 중 동기적으로 localStorage를 읽는다 — Node에는 없으므로,
// "로그인 안 한 방문자"와 동일한 결과(모두 null)를 내는 스텁을 준다.
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** url → 출력 파일 경로 (dist/ 기준 상대경로) */
const ROUTES = [
  { url: '/',        outFile: 'dist/index.html' },
  { url: '/pricing', outFile: 'dist/pricing/index.html' },
  { url: '/privacy', outFile: 'dist/privacy/index.html' },
  { url: '/terms',   outFile: 'dist/terms/index.html' },
];

const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
});

let render;
try {
  ({ render } = await vite.ssrLoadModule('/src/entry-server.tsx'));
} catch (err) {
  await vite.close();
  throw err;
}

const distIndexPath = resolve(root, 'dist/index.html');
const template = readFileSync(distIndexPath, 'utf-8');

if (!template.includes('<div id="root"></div>')) {
  await vite.close();
  throw new Error('dist/index.html에서 <div id="root"></div>를 찾지 못했습니다 — index.html 구조가 바뀌었는지 확인하세요.');
}

for (const { url, outFile } of ROUTES) {
  const appHtml = render(url);
  const result = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
  const outPath = resolve(root, outFile);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, result);
  console.log(`[prerender] ${url} → ${outFile}`);
}

await vite.close();
console.log('[prerender] 완료');
