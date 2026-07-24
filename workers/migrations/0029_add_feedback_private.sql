-- 문의/제안 글쓴이가 "비밀글"로 작성할 수 있게 한다 — 목록에는 계속 보이되(작성자/카테고리/
-- 날짜는 유지) 제목이 마스킹되고, 상세는 작성자 본인과 운영자만 볼 수 있다(routes/feedback.ts).
-- feedback_replies는 스키마 변경 없음 — 수정/삭제 권한은 기존처럼 is_admin 플래그로만 판단한다
-- (이 스레드엔 글쓴이 본인과 운영자만 답글을 달 수 있어 is_admin=0은 항상 글쓴이 답글이므로).
ALTER TABLE feedback ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
