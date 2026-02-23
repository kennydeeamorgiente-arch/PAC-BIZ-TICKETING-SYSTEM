-- Add avatar storage for user profiles.
-- Stores a cropped image data URL (jpeg/webp) produced by frontend profile modal.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_data MEDIUMTEXT NULL AFTER full_name;

