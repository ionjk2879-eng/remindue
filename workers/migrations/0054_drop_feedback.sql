-- Migration number: 0054 	 2026-08-07T07:20:00.000Z

-- 문의/제안 게시판 기능 제거 — 카카오톡 오픈채팅으로 대체됐다(routes/feedback.ts,
-- FeedbackPage.tsx, FeedbackDetailPage.tsx 등 관련 코드 전체 삭제와 짝을 이루는 마이그레이션).
DROP TABLE feedback_replies;
DROP TABLE feedback;
