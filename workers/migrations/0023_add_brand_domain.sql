-- 브랜드 로고용 공식 도메인. AI가 판매처/브랜드의 도메인을 확신할 때만 채운다(감지 불가·불확실하면 null).
-- BRAND_DOMAIN 프론트 큐레이션 맵과 별개로, AI가 직접 도메인을 추론해 로고 커버리지를 넓히기 위함.
ALTER TABLE purchases ADD COLUMN brand_domain TEXT;
ALTER TABLE pending_purchases ADD COLUMN brand_domain TEXT;
