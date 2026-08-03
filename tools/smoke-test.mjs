const baseUrl = process.argv[2];
if (!baseUrl) throw new Error('Usage: node tools/smoke-test.mjs <api-base-url>');

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
  return response;
}

const config = await (await request('/config/domain')).json();
if (config.plans?.free?.maxPurchases !== 5 || config.plans?.free?.notificationDays?.join(',') !== '7,3,0') {
  throw new Error('domain policy contract mismatch');
}

const email = process.env.REMINDUE_SMOKE_EMAIL;
const password = process.env.REMINDUE_SMOKE_PASSWORD;
if (!email || !password) throw new Error('REMINDUE_SMOKE_EMAIL and REMINDUE_SMOKE_PASSWORD are required');
const login = await (await request('/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
})).json();
if (!login.accessToken) throw new Error('login response has no access token');
const headers = { Authorization: `Bearer ${login.accessToken}` };
const purchases = await (await request('/purchases', { headers })).json();
if (!Array.isArray(purchases)) throw new Error('purchases response is not an array');
const settings = await (await request('/settings/notification-days', { headers })).json();
if (!Array.isArray(settings.notificationDays)) throw new Error('notification settings contract mismatch');
await request('/fx-recalculation/latest', { headers });
console.log(JSON.stringify({ ok: true, baseUrl, purchaseCount: purchases.length }));
