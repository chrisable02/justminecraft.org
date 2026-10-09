-- Run once in Cloudflare D1 > jmc-news > Console.
-- Existing announcements and publication states are preserved.
ALTER TABLE announcements ADD COLUMN body_format TEXT NOT NULL DEFAULT 'plain';
ALTER TABLE announcements ADD COLUMN image_key TEXT;
CREATE INDEX IF NOT EXISTS idx_announcements_management ON announcements (created_at DESC, id DESC);
