const KAKAO_OPEN_CHAT_URL = 'https://open.kakao.com/o/gxIfJIHi';

export default function KakaoChatButton() {
  return (
    <a
      className="kakao-chat-fab"
      href={KAKAO_OPEN_CHAT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="리마인듀 카카오톡 오픈채팅 문의하기"
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4C6.9 4 2.75 7.3 2.75 11.4c0 2.62 1.72 4.92 4.32 6.24-.19.7-.7 2.56-.8 2.96-.13.5.18.49.38.36.16-.1 2.55-1.72 3.58-2.42.57.08 1.16.13 1.77.13 5.1 0 9.25-3.3 9.25-7.27C21.25 7.3 17.1 4 12 4z"
          fill="#391B1B"
        />
      </svg>
    </a>
  );
}
