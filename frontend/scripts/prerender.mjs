// 빌드 후 dist/index.html의 #root를 랜딩 페이지(SPA fallback이기도 함)의 정적 HTML로
// 채운다. 검색엔진이 JS 실행 없이도 헤드라인/설명 텍스트를 바로 읽을 수 있게 하기 위함 —
// /dashboard 등 로그인 필요 페이지는 그대로 클라이언트 라우팅에 맡긴다(같은 index.html을
// 통해 서빙되지만, 로그인 상태에 따라 즉시 클라이언트에서 다시 렌더링/리다이렉트된다).
import { readFileSync, writeFileSync } from 'node:fs';
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

const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
});

let appHtml;
try {
  const { render } = await vite.ssrLoadModule('/src/entry-server.tsx');
  appHtml = render('/');
} finally {
  await vite.close();
}

const distIndexPath = resolve(root, 'dist/index.html');
const template = readFileSync(distIndexPath, 'utf-8');

if (!template.includes('<div id="root"></div>')) {
  throw new Error('dist/index.html에서 <div id="root"></div>를 찾지 못했습니다 — index.html 구조가 바뀌었는지 확인하세요.');
}

const result = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
writeFileSync(distIndexPath, result);

console.log('[prerender] 랜딩 페이지를 dist/index.html에 프리렌더링했습니다.');
