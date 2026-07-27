CREATE TABLE IF NOT EXISTS ai_summary_requests (
  user_id INTEGER PRIMARY KEY,
  last_requested_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
