-- Phase 5 migration: Shift-aware SLA support
USE it_ticketing;

ALTER TABLE users
ADD COLUMN shift_type ENUM('AM', 'PM', 'GY') NULL AFTER role;

-- Optional defaults for existing agents/admins
UPDATE users
SET shift_type = 'AM'
WHERE role IN ('admin', 'agent')
  AND shift_type IS NULL;
