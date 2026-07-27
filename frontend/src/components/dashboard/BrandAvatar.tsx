import { useState } from 'react';

const BRAND_DOMAIN: Record<string, string> = {
  '네이버': 'naver.com', '네이버쇼핑': 'naver.com', '네이버플러스': 'naver.com',
  '쿠팡': 'coupang.com', '쿠팡이츠': 'coupangeats.com', '마켓컬리': 'kurly.com', '컬리': 'kurly.com',
  'SSG': 'ssg.com', 'SSG닷컴': 'ssg.com', '지마켓': 'gmarket.co.kr', '옥션': 'auction.co.kr',
  '11번가': '11st.co.kr', '위메프': 'wemakeprice.com', '티몬': 'tmon.co.kr', '인터파크': 'interpark.com', '무신사': 'musinsa.com',
  '올리브영': 'global.oliveyoung.com', '오늘의집': 'ohou.se', '당근': 'daangn.com', '당근마켓': 'daangn.com', '번개장터': 'bunjang.co.kr',
  '롯데온': 'lotteon.com', '롯데마트': 'lottemart.com', '배달의민족': 'baemin.com', '배민': 'baemin.com', '요기요': 'yogiyo.co.kr',
  '왓챠': 'watcha.com', '웨이브': 'wavve.com', '티빙': 'tving.com', '밀리의서재': 'millie.co.kr', '리디': 'ridibooks.com', '리디북스': 'ridibooks.com',
  '클래스101': 'class101.net', '인프런': 'inflearn.com', '패스트캠퍼스': 'fastcampus.co.kr', '카카오': 'kakao.com', '카카오페이': 'kakaopay.com',
  '넷플릭스': 'netflix.com', '유튜브': 'youtube.com', '유튜브프리미엄': 'youtube.com', '스포티파이': 'spotify.com',
  '디즈니플러스': 'disneyplus.com', '디즈니+': 'disneyplus.com', '애플': 'apple.com', '애플뮤직': 'apple.com', '아마존': 'amazon.com',
  '구글': 'google.com', '마이크로소프트': 'microsoft.com', '어도비': 'adobe.com', 'GitHub': 'github.com', 'Notion': 'notion.so',
  'Slack': 'slack.com', 'Zoom': 'zoom.us', 'ChatGPT': 'openai.com', 'OpenAI': 'openai.com', 'Anthropic': 'anthropic.com', 'Claude': 'anthropic.com',
  'Dropbox': 'dropbox.com', '드롭박스': 'dropbox.com', 'Figma': 'figma.com', 'Patreon': 'patreon.com', '패트리온': 'patreon.com', 'pixivFANBOX': 'pixiv.net',
};

const BRAND_ALIASES: Record<string, string> = {
  oliveyoung: '올리브영', 'olive young': '올리브영', 'cj olive young': '올리브영', '올영': '올리브영',
  naver: '네이버', coupang: '쿠팡', musinsa: '무신사', youtube: '유튜브', netflix: '넷플릭스',
};

const LOCAL_BRAND_LOGOS: Record<string, string> = { '올리브영': '/brand-oliveyoung.svg' };
const LOGO_DEV_TOKEN = import.meta.env.VITE_LOGO_DEV_TOKEN as string | undefined;

export function normalizeBrandName(brand: string): string {
  const normalized = brand.trim().replace(/\s+/g, ' ').toLowerCase();
  return BRAND_ALIASES[normalized] ?? brand.trim();
}

function fallbackLabel(brand: string): string {
  return Array.from(brand.replace(/\s+/g, '')).slice(0, 2).join('').toUpperCase();
}

function resolveBrandDomain(brand: string): string | null {
  if (BRAND_DOMAIN[brand]) return BRAND_DOMAIN[brand];
  const entry = Object.entries(BRAND_DOMAIN).find(([name]) => name.toLowerCase() === brand.toLowerCase());
  return entry?.[1] ?? null;
}

export default function BrandAvatar({ brand }: { brand: string }) {
  const canonicalBrand = normalizeBrandName(brand);
  const [failed, setFailed] = useState(false);
  const localLogo = LOCAL_BRAND_LOGOS[canonicalBrand];
  const domain = resolveBrandDomain(canonicalBrand);

  if (localLogo) return <img className="brand-avatar" src={localLogo} alt={`${canonicalBrand} 로고`} />;
  if (!failed && domain && LOGO_DEV_TOKEN) {
    return (
      <img
        className="brand-avatar"
        src={`https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=96`}
        alt={`${canonicalBrand} 로고`}
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="brand-avatar brand-avatar--fallback" aria-label={`${canonicalBrand} 브랜드`}>{fallbackLabel(canonicalBrand)}</span>;
}
