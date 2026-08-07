import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';

const BASE = 'http://localhost:5173';
const OUT = 'scripts/screenshots';
await mkdir(OUT, { recursive: true });

const VIEWPORTS = [
  { width: 375, height: 812, label: '375' },
  { width: 390, height: 844, label: '390' },
];

const browser = await chromium.launch();

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  -> ${OUT}/${name}.png`);
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();

  console.log(`\n=== ${vp.width}px ===`);

  // 1. Landing
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot(page, `${vp.label}_01_landing`);

  // 2. Login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await shot(page, `${vp.label}_02_login`);

  // 3. Signup
  await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
  await shot(page, `${vp.label}_03_signup`);

  // 4. Pricing
  await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' });
  await shot(page, `${vp.label}_04_pricing`);

  // 5. Dashboard (need to be logged in — try anyway for unauthed redirect/state)
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await shot(page, `${vp.label}_05_dashboard_unauth`);

  // 6. Privacy / Terms
  await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle' });
  await shot(page, `${vp.label}_06_privacy`);

  await page.goto(`${BASE}/terms`, { waitUntil: 'networkidle' });
  await shot(page, `${vp.label}_07_terms`);

  await ctx.close();
}

// --- Logged-in session ---
console.log('\n=== Logged-in screenshots (375px) ===');
const authCtx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  isMobile: true,
});
const authPage = await authCtx.newPage();

// Register a test user or reuse stored credentials via localStorage token
// Try to log in programmatically
const loginResp = await authPage.request.post(`http://localhost:8787/api/auth/login`, {
  data: { email: 'ionjk2879@gmail.com', password: 'test1234' },
});
const loginBody = await loginResp.json().catch(() => ({}));
const token = loginBody.token;

if (token) {
  console.log('  Login success, setting token...');
  await authPage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await authPage.evaluate((t) => localStorage.setItem('token', t), token);

  await authPage.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await authPage.waitForTimeout(1500);
  await shot(authPage, '375_08_dashboard_auth');

  // Scroll down to see more
  await authPage.evaluate(() => window.scrollTo(0, 300));
  await authPage.waitForTimeout(300);
  await shot(authPage, '375_09_dashboard_scrolled');

  // Settings
  await authPage.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await shot(authPage, '375_10_settings');
} else {
  console.log('  Login failed (wrong credentials for dev db), skipping auth pages');
}

await authCtx.close();
await browser.close();
console.log('\nDone.');
