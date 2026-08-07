const MESSAGE = '리마인듀 테스터를 모집합니다! 오픈 채팅방으로 문의 주시면 바로 사용해보실 수 있습니다!';
const REPEAT = 6;

export default function TesterRecruitBanner() {
  const items = Array.from({ length: REPEAT * 2 });
  return (
    <div className="tester-banner" role="note" aria-label={MESSAGE}>
      <div className="tester-banner__viewport">
        <div className="tester-banner__track" aria-hidden="true">
          {items.map((_, i) => (
            <span className="tester-banner__item" key={i}>
              {MESSAGE}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
