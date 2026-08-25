-- Keep stop/resume intervals so paused cycles do not reappear in spending history.
-- The round offset makes the first cycle after a resume follow the last visible cycle.
ALTER TABLE purchases ADD COLUMN schedule_pause_periods TEXT NOT NULL DEFAULT '[]';
ALTER TABLE purchases ADD COLUMN delivery_round_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE purchases ADD COLUMN discontinued_round INTEGER;
