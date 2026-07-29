// 네이티브 앱 OTA(Over-The-Air) 라이브 업데이트 — Capawesome Cloud 없이 R2에 직접 호스팅한다.
// 프론트엔드(JS/CSS/HTML)만 바뀐 수정은 스토어 재배포나 APK 재설치 없이 이 경로로 바로
// 반영할 수 있다(네이티브 코드/플러그인이 바뀐 경우는 대상이 아니다 — 그런 변경은 여전히
// APK를 다시 빌드/배포해야 한다). /api/* 밑에 둬서 기존 CORS 미들웨어를 그대로 물려받는다
// (반면 /downloads/:filename은 브라우저 직접 다운로드 링크 용도라 CORS가 필요 없어 따로 둔다).

import { Hono } from 'hono';
import type { Env } from '../types';

const appUpdate = new Hono<{ Bindings: Env }>();

interface OtaManifest {
  bundleId: string;
  checksum: string;
  createdAt: string;
}

/** 발행된 라이브 업데이트가 없으면 bundleId: null — 앱은 이 경우 그냥 아무것도 하지 않는다. */
appUpdate.get('/manifest', async (c) => {
  const object = await c.env.DOWNLOADS_BUCKET.get('ota-manifest.json');
  if (!object) return c.json({ bundleId: null });
  const manifest = await object.json<OtaManifest>();
  return c.json(manifest);
});

appUpdate.get('/bundle/:bundleId', async (c) => {
  const bundleId = c.req.param('bundleId');
  const object = await c.env.DOWNLOADS_BUCKET.get(`ota-bundle-${bundleId}.zip`);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(object.size),
      // bundleId 자체가 콘텐츠 기반 해시라 같은 bundleId면 내용이 절대 안 바뀐다 — 영구 캐시 가능.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

export default appUpdate;
