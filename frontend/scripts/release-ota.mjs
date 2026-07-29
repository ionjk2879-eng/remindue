// 네이티브 앱용 라이브 업데이트(OTA) 번들을 만들어 R2에 올린다.
// 실행 순서: npm run build:cap(이 스크립트 앞에서 실행됨) → dist/를 zip → sha256 체크섬 계산 →
// ota-bundle-{bundleId}.zip과 ota-manifest.json을 remindue-downloads R2 버킷에 업로드.
// bundleId는 zip 내용의 sha256 앞 12자리다 — 내용이 똑같으면 항상 같은 bundleId가 나오므로,
// 앱의 checkForLiveUpdate()가 "이미 적용된 번들인지"를 내용 기준으로 정확히 판단할 수 있다.
//
// 네이티브 코드/플러그인이 바뀐 변경(예: 이번 세션의 스플래시 아이콘 수정처럼 android/ 리소스가
// 바뀐 경우)은 이 경로로 못 내보낸다 — APK를 다시 빌드해서 배포해야 한다(release-apk.mjs 참고).

import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(__dirname, '..');
const workersDir = resolve(frontendDir, '..', 'workers');
const distDir = resolve(frontendDir, 'dist');

const workDir = mkdtempSync(resolve(tmpdir(), 'remindue-ota-'));
const zipPath = resolve(workDir, 'bundle.zip');

console.log('[release-ota] dist/ 압축 중...');
// PowerShell Compress-Archive로 dist/ *내용물*을 zip 루트에 바로 담는다(dist 폴더 자체가
// 서브폴더로 들어가면 플러그인이 압축을 풀어도 index.html을 루트에서 못 찾는다).
execFileSync('powershell', [
  '-NoProfile', '-Command',
  `Compress-Archive -Path "${distDir}\\*" -DestinationPath "${zipPath}" -Force`,
], { stdio: 'inherit' });

const zipBuffer = readFileSync(zipPath);
const checksum = createHash('sha256').update(zipBuffer).digest('hex');
const bundleId = checksum.slice(0, 12);
console.log(`[release-ota] bundleId=${bundleId} checksum=${checksum} size=${(zipBuffer.length / 1024).toFixed(0)}KB`);

const manifestPath = resolve(workDir, 'ota-manifest.json');
writeFileSync(manifestPath, JSON.stringify({ bundleId, checksum, createdAt: new Date().toISOString() }, null, 2));

console.log('[release-ota] R2 업로드 중...');
execSync(`npx wrangler r2 object put remindue-downloads/ota-bundle-${bundleId}.zip --file "${zipPath}" --remote`, {
  cwd: workersDir, stdio: 'inherit',
});
execSync(`npx wrangler r2 object put remindue-downloads/ota-manifest.json --file "${manifestPath}" --remote`, {
  cwd: workersDir, stdio: 'inherit',
});

rmSync(workDir, { recursive: true, force: true });
console.log(`[release-ota] 완료 — bundleId ${bundleId} 가 다음 앱 실행 때부터 적용 대상으로 잡힙니다.`);
