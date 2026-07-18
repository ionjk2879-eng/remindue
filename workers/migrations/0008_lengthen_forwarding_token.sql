-- Migration number: 0008 	 2026-07-18T00:00:00.000Z

-- 개인정보 보호 강화: forwarding_token을 16자(8바이트=64비트)에서 32자(16바이트=128비트)로
-- 늘린다. 새 가입자는 auth.ts가 이미 32자 토큰을 발급하므로, 여기서는 0005에서 발급된
-- 기존 유저들의 짧은 토큰을 같은 강도로 재발급한다 — 기존 포워딩 주소는 이 시점에 바뀐다.
UPDATE users
   SET forwarding_token = lower(hex(randomblob(16)))
 WHERE length(forwarding_token) < 20;
