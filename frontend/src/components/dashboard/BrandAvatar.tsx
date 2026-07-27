const BRAND_DOMAIN: Record<string, string> = {
  '네이버': 'naver.com', '네이버쇼핑': 'naver.com', '네이버플러스': 'naver.com',
  '쿠팡': 'coupang.com', '쿠팡이츠': 'coupangeats.com',
  '마켓컬리': 'kurly.com', '컬리': 'kurly.com',
  'SSG': 'ssg.com', 'SSG.COM': 'ssg.com', 'SSG닷컴': 'ssg.com',
  '지마켓': 'gmarket.co.kr', '옥션': 'auction.co.kr',
  '11번가': '11st.co.kr', '위메프': 'wemakeprice.com', '티몬': 'tmon.co.kr',
  '인터파크': 'interpark.com', '무신사': 'musinsa.com',
  // oliveyoung.co.kr은 로고 DB에서 '올영 TV'로 잘못 식별되어 공식 글로벌 쇼핑 도메인을 쓴다.
  '올리브영': 'global.oliveyoung.com', 'OLIVE YOUNG': 'global.oliveyoung.com', 'Olive Young': 'global.oliveyoung.com',
  '오늘의집': 'ohou.se',
  '당근': 'daangn.com', '당근마켓': 'daangn.com', '번개장터': 'bunjang.co.kr',
  '롯데온': 'lotteon.com', '롯데마트': 'lottemart.com',
  '배달의민족': 'baemin.com', '배민': 'baemin.com', '요기요': 'yogiyo.co.kr',
  '왓챠': 'watcha.com', '웨이브': 'wavve.com', '티빙': 'tving.com',
  '밀리의서재': 'millie.co.kr', '리디': 'ridibooks.com', '리디북스': 'ridibooks.com',
  '클래스101': 'class101.net', '인프런': 'inflearn.com', '패스트캠퍼스': 'fastcampus.co.kr',
  '카카오': 'kakao.com', '카카오페이': 'kakaopay.com',
  '넷플릭스': 'netflix.com', 'Netflix': 'netflix.com',
  '유튜브': 'youtube.com', 'YouTube': 'youtube.com',
  '유튜브프리미엄': 'youtube.com', 'YouTube Premium': 'youtube.com',
  '스포티파이': 'spotify.com', 'Spotify': 'spotify.com',
  '디즈니플러스': 'disneyplus.com', 'Disney+': 'disneyplus.com', '디즈니+': 'disneyplus.com',
  '애플': 'apple.com', 'Apple': 'apple.com', '애플뮤직': 'apple.com', 'Apple Music': 'apple.com',
  '아마존': 'amazon.com', 'Amazon': 'amazon.com', '구글': 'google.com', 'Google': 'google.com',
  '마이크로소프트': 'microsoft.com', 'Microsoft': 'microsoft.com',
  'Adobe': 'adobe.com', '어도비': 'adobe.com', 'GitHub': 'github.com', 'Notion': 'notion.so',
  'Slack': 'slack.com', 'Zoom': 'zoom.us', 'ChatGPT': 'openai.com', 'OpenAI': 'openai.com',
  'Anthropic': 'anthropic.com', 'Claude': 'anthropic.com', 'Dropbox': 'dropbox.com', '드롭박스': 'dropbox.com',
  'Figma': 'figma.com', 'Patreon': 'patreon.com', '패트리온': 'patreon.com',
  'pixivFANBOX': 'pixiv.net',
};

const LOGO_DEV_TOKEN = import.meta.env.VITE_LOGO_DEV_TOKEN as string | undefined;

export default function BrandAvatar({ brand }: { brand: string }) {
  const domain = BRAND_DOMAIN[brand] ?? null;
  if (!domain || !LOGO_DEV_TOKEN) return null;
  return (
    <img
      className="brand-avatar"
      src={`https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=96`}
      alt=""
      onError={(event) => { event.currentTarget.style.display = 'none'; }}
    />
  );
}
