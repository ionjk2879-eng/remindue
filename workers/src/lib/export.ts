// CSV/PDF 내보내기(프리미엄) — 사용자의 전체 항목(활성 + 보관)을 표로 정리한다.
// PDF는 한글 렌더링을 위해 Noto Sans KR을 요청 시점에 fetch해서 pdf-lib(+fontkit)로 임베드한다.
// 이 폰트를 Worker 번들에 직접 넣으면 수 MB가 그대로 배포 스크립트 용량에 더해지므로(특히
// Cloudflare 무료 플랜 스크립트 용량 제한에 위험), 대신 매 요청마다 fetch하되 Cache API로
// 캐싱해서 실제로는 첫 요청 이후로는 거의 다시 받지 않게 한다.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { computeDDay, computeDeadline, computeStatusLabel } from './purchase-logic';
import type { PurchaseRow, PurchaseType } from '../types';

const TYPE_LABEL: Record<PurchaseType, string> = {
  ELECTRONICS: '전자제품',
  ONLINE_ORDER: '온라인주문',
  RECURRING_DELIVERY: '정기배송',
  SUBSCRIPTION: '정기구독',
};

// Google Fonts가 서빙하는 안정적인 정적 URL(Noto Sans KR Regular, 전체 한글 음절 포함).
// 버전이 바뀌어 404가 나면 https://fonts.googleapis.com/css2?family=Noto+Sans+KR 응답의
// src url(...)을 다시 확인해서 갱신한다.
const KOREAN_FONT_URL = 'https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf';

interface ExportRow {
  type: PurchaseType;
  itemName: string;
  deadline: string;
  status: string;
}

function toExportRows(purchases: PurchaseRow[]): ExportRow[] {
  return purchases.map((row) => {
    const { deadline } = computeDeadline(row);
    const dDay = computeDDay(deadline);
    return {
      type: row.type,
      itemName: row.item_name,
      deadline,
      status: computeStatusLabel(dDay),
    };
  });
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** UTF-8 BOM을 붙여서 엑셀에서 열었을 때 한글이 깨지지 않게 한다. 줄바꿈은 CRLF(엑셀 관례). */
export function buildCsv(purchases: PurchaseRow[]): string {
  const rows = toExportRows(purchases);
  const header = ['종류', '항목명', '기한', '상태'];
  const lines = [header, ...rows.map((r) => [TYPE_LABEL[r.type], r.itemName, r.deadline, r.status])].map((cols) =>
    cols.map(escapeCsvField).join(',')
  );
  return '﻿' + lines.join('\r\n') + '\r\n';
}

async function fetchKoreanFontBytes(): Promise<ArrayBuffer> {
  const cacheKey = new Request(KOREAN_FONT_URL);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached.arrayBuffer();
  }

  const res = await fetch(KOREAN_FONT_URL);
  if (!res.ok) {
    throw new Error(`한글 폰트 다운로드 실패 (${res.status})`);
  }
  // 캐시에 넣을 응답과 실제로 읽을 응답이 스트림을 공유하지 않도록 clone한다.
  await cache.put(cacheKey, res.clone());
  return res.arrayBuffer();
}

const PAGE_WIDTH = 595.28; // A4 (pt)
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const ROW_HEIGHT = 22;
const COLUMN_WIDTHS = [90, 260, 90, 60]; // 종류, 항목명, 기한, 상태

/**
 * pdf-lib+fontkit로 이 Noto Sans KR TTF를 그릴 때, 한글 단어와 한글 단어 사이의 일반 스페이스(U+0020)
 * 글리프가 통째로 사라지는 렌더링 버그가 있다(Latin↔한글 경계의 스페이스는 멀쩡함 — 한글-한글
 * 사이일 때만 발생). "삼성 냉장고"처럼 스페이스가 낀 실제 항목명이 흔하므로 무시할 수 없는
 * 문제라, 스페이스 글리프 자체를 아예 그리지 않고 단어 단위로 나눠 그린 뒤 간격만 수동으로
 * 벌려서 우회한다.
 */
function drawTextSafe(page: PDFPage, text: string, opts: { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> }): void {
  const { x, y, size, font, color } = opts;
  const spaceGap = font.widthOfTextAtSize(' ', size) || size * 0.28;
  let cursorX = x;
  const words = text.split(' ');
  words.forEach((word, i) => {
    if (word.length > 0) {
      page.drawText(word, { x: cursorX, y, size, font, color });
      cursorX += font.widthOfTextAtSize(word, size);
    }
    if (i < words.length - 1) {
      cursorX += spaceGap;
    }
  });
}

export async function buildPdf(purchases: PurchaseRow[], generatedAtLabel: string): Promise<Uint8Array> {
  const rows = toExportRows(purchases);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const koreanFontBytes = await fetchKoreanFontBytes();
  // subset:true는 이 폰트/런타임 조합에서 신뢰할 수 없다(글자가 통째로 빠지는 걸 실제로 확인함) —
  // 파일 용량(전체 폰트 임베드라 수 MB)을 희생하더라도 정확한 렌더링을 택한다.
  const koreanFont = await pdfDoc.embedFont(koreanFontBytes, { subset: false });
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const drawHeader = () => {
    drawTextSafe(page, 'Remindue — 챙길 목록', { x: MARGIN, y, size: 16, font: koreanFont, color: rgb(0.12, 0.16, 0.22) });
    y -= 20;
    drawTextSafe(page, `내보낸 시각: ${generatedAtLabel}`, { x: MARGIN, y, size: 9, font: koreanFont, color: rgb(0.42, 0.45, 0.5) });
    y -= 24;

    const headers = ['종류', '항목명', '기한', '상태'];
    let x = MARGIN;
    headers.forEach((h, i) => {
      drawTextSafe(page, h, { x, y, size: 10, font: koreanFont, color: rgb(0.42, 0.45, 0.5) });
      x += COLUMN_WIDTHS[i];
    });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + COLUMN_WIDTHS.reduce((a, b) => a + b, 0), y },
      thickness: 1,
      color: rgb(0.82, 0.8, 0.71),
    });
    y -= ROW_HEIGHT - 6;
  };

  drawHeader();

  for (const row of rows) {
    if (y < MARGIN + ROW_HEIGHT) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawHeader();
    }

    let x = MARGIN;
    const cols = [TYPE_LABEL[row.type], row.itemName, row.deadline, row.status];
    cols.forEach((text, i) => {
      const font = i === 2 ? monoFont : koreanFont; // 기한(날짜)만 모노스페이스로.
      const truncated = text.length > 22 ? `${text.slice(0, 21)}…` : text;
      drawTextSafe(page, truncated, { x, y, size: 10, font, color: rgb(0.12, 0.16, 0.22) });
      x += COLUMN_WIDTHS[i];
    });
    y -= ROW_HEIGHT;
  }

  if (rows.length === 0) {
    drawTextSafe(page, '등록된 항목이 없습니다.', { x: MARGIN, y, size: 10, font: koreanFont, color: rgb(0.42, 0.45, 0.5) });
  }

  return pdfDoc.save();
}
