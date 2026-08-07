const MESSAGE = '🙏 리마인듀 테스터로 함께해 주시겠어요?';
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
