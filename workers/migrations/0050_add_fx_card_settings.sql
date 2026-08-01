-- 해외결제 카드 설정(선택) — 설정해두면 카드사·브랜드별 수수료 공식으로 원화 환산액을 계산하고,
-- 미설정이면 기존처럼 평균 수수료 근사치를 쓴다(lib/fx-card.ts의 applyCardFee).
ALTER TABLE users ADD COLUMN fx_card_issuer TEXT;
ALTER TABLE users ADD COLUMN fx_card_brand TEXT;
