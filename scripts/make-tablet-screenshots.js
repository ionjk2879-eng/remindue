const sharp = require('../frontend/node_modules/sharp');

const W = 1080, H = 1920;
const FONT = 'Malgun Gothic, sans-serif';
const RED = '#e05252';
const BG = '#111111';

const tile = (x, y, w, h, bg, label, value) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${bg}"/>
  <text x="${x + 36}" y="${y + 58}" font-family="${FONT}" font-size="34" fill="#aaa">${label}</text>
  <text x="${x + 36}" y="${y + h - 36}" font-family="${FONT}" font-size="54" font-weight="700" fill="white">${value}</text>
`;

const noti = (x, y, w, dday, color, title, sub) => `
  <rect x="${x}" y="${y}" width="${w}" height="168" rx="22" fill="#1e1e1e"/>
  <circle cx="${x + 84}" cy="${y + 84}" r="54" fill="${color}"/>
  <text x="${x + 84}" y="${y + 76}" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="700" fill="white">${dday}</text>
  <text x="${x + 84}" y="${y + 106}" text-anchor="middle" font-family="${FONT}" font-size="22" fill="white">일전</text>
  <text x="${x + 168}" y="${y + 64}" font-family="${FONT}" font-size="38" font-weight="700" fill="white">${title}</text>
  <text x="${x + 168}" y="${y + 112}" font-family="${FONT}" font-size="30" fill="#888">${sub}</text>
`;

async function tab1() {
  const cardBuf = await sharp('frontend/public/landing-preview-cards.png')
    .resize({ width: 980 }).toBuffer();
  const { height: ch } = await sharp(cardBuf).metadata();
  const cardTop = Math.round((H - ch) / 2) + 60;

  const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <text x="${W / 2}" y="130" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="700" fill="white">모든 기한을 한눈에</text>
    <text x="${W / 2}" y="208" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="700" fill="${RED}">D-day 트래커</text>
    <text x="${W / 2}" y="${H - 88}" text-anchor="middle" font-family="${FONT}" font-size="36" fill="#666">반품기한 · 보증기간 · 정기배송 · 구독</text>
    <text x="${W / 2}" y="${H - 44}" text-anchor="middle" font-family="${FONT}" font-size="36" fill="#666">7인치 태블릿에서도 한눈에</text>
  </svg>`);

  await sharp(bg)
    .composite([{ input: cardBuf, top: cardTop, left: Math.round((W - 980) / 2) }])
    .png().toFile('frontend/public/play-store-tablet-1.png');
  console.log('tab1 done');
}

async function tab2() {
  const step1Buf = await sharp('frontend/public/landing-step1-forwarding.png')
    .resize({ width: 1000 }).toBuffer();
  const { height: s1h } = await sharp(step1Buf).metadata();
  const step2Buf = await sharp('frontend/public/landing-step2-pending.png')
    .resize({ width: 1000 }).toBuffer();
  const { height: s2h } = await sharp(step2Buf).metadata();

  const gap = 50;
  const totalH = s1h + s2h + gap;
  const blockTop = Math.round((H - totalH) / 2) + 20;

  const bg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <text x="${W / 2}" y="140" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="700" fill="white">주문 메일만 전달하면</text>
    <text x="${W / 2}" y="218" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="700" fill="${RED}">AI가 자동 등록</text>
    <text x="${W / 2}" y="${H - 110}" text-anchor="middle" font-family="${FONT}" font-size="38" fill="#888">쇼핑몰 주문확인 메일을 전달하면</text>
    <text x="${W / 2}" y="${H - 60}" text-anchor="middle" font-family="${FONT}" font-size="38" fill="#888">상품·날짜·금액을 자동으로 인식해요</text>
  </svg>`);

  await sharp(bg)
    .composite([
      { input: step1Buf, top: blockTop, left: Math.round((W - 1000) / 2) },
      { input: step2Buf, top: blockTop + s1h + gap, left: Math.round((W - 1000) / 2) }
    ])
    .png().toFile('frontend/public/play-store-tablet-2.png');
  console.log('tab2 done');
}

async function tab3() {
  const pad = 44, gap = 22;
  const col2w = (W - pad * 2 - gap) / 2;
  const r1y = 440, rh = 220;

  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <text x="${W / 2}" y="140" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="700" fill="white">이번 달 예상 지출</text>
    <text x="${W / 2}" y="218" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="700" fill="${RED}">자동으로 계산</text>
    <text x="${W / 2}" y="320" text-anchor="middle" font-family="${FONT}" font-size="38" fill="#666">등록한 항목 기반으로 이번 달과 올해</text>
    <text x="${W / 2}" y="368" text-anchor="middle" font-family="${FONT}" font-size="38" fill="#666">예상 지출을 한눈에 볼 수 있어요</text>
    ${tile(pad, r1y, col2w, rh, '#1e3a5f', '8월 예상지출', '128,400원')}
    ${tile(pad + col2w + gap, r1y, col2w, rh, '#1a3a2a', '올해 예상지출', '1,540,800원')}
    ${tile(pad, r1y + (rh + gap) * 1, col2w, rh, '#2a2a2a', '이번 주 결제', '2건')}
    ${tile(pad + col2w + gap, r1y + (rh + gap) * 1, col2w, rh, '#2a2a2a', '정기배송', '1건')}
    ${tile(pad, r1y + (rh + gap) * 2, col2w, rh, '#2a2a2a', '정기구독', '3건')}
    ${tile(pad + col2w + gap, r1y + (rh + gap) * 2, col2w, rh, '#3a1e1e', '가격 변동 감지', '1건')}
    ${tile(pad, r1y + (rh + gap) * 3, W - pad * 2, rh, '#1a2e1a', 'AI 절약 제안', '12,000원 절약 가능')}
    <text x="${W / 2}" y="${H - 50}" text-anchor="middle" font-family="${FONT}" font-size="36" fill="#555">고정 지출을 놓치지 마세요</text>
  </svg>`);

  await sharp(svg).png().toFile('frontend/public/play-store-tablet-3.png');
  console.log('tab3 done');
}

async function tab4() {
  const pad = 40, nw = W - pad * 2, gap = 22, sy = 440;

  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <text x="${W / 2}" y="140" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="700" fill="white">기한 전에 미리</text>
    <text x="${W / 2}" y="218" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="700" fill="${RED}">알림으로 알려드려요</text>
    <text x="${W / 2}" y="315" text-anchor="middle" font-family="${FONT}" font-size="38" fill="#666">기한 3일 전, 당일 자동 알림</text>
    <text x="${W / 2}" y="363" text-anchor="middle" font-family="${FONT}" font-size="38" fill="#666">놓쳐서 손해 보는 일이 없어요</text>
    ${noti(pad, sy, nw, '3', '#e05252', '삼성 냉장고 반품기한', '2026-07-27 마감')}
    ${noti(pad, sy + (168 + gap) * 1, nw, '7', '#d08030', 'Netflix 프리미엄 결제', '다음 결제일 2026-07-31')}
    ${noti(pad, sy + (168 + gap) * 2, nw, '10', '#3080d0', '제주삼다수 정기배송', '3회차 배송 예정')}
    ${noti(pad, sy + (168 + gap) * 3, nw, '당', '#4a9e4a', 'A/S 보증기간 만료', '오늘 만료됩니다')}
    ${noti(pad, sy + (168 + gap) * 4, nw, '15', '#7060c0', 'Claude Pro 구독', '다음 결제일 2026-08-09')}
    <rect x="${pad}" y="${sy + (168 + gap) * 5 + 10}" width="${nw}" height="2" fill="#333"/>
    <text x="${W / 2}" y="${sy + (168 + gap) * 5 + 78}" text-anchor="middle" font-family="${FONT}" font-size="36" fill="#666">앱 알림 + 이메일 동시 수신</text>
    <text x="${W / 2}" y="${sy + (168 + gap) * 5 + 126}" text-anchor="middle" font-family="${FONT}" font-size="36" fill="#666">프리미엄: 알림 시점 자유 설정</text>
  </svg>`);

  await sharp(svg).png().toFile('frontend/public/play-store-tablet-4.png');
  console.log('tab4 done');
}

tab1().then(tab2).then(tab3).then(tab4).catch(console.error);
