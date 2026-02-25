ALTER TABLE tickets
  ADD COLUMN locked_by_user_id BIGINT UNSIGNED NULL AFTER assigned_to_user_id,
  ADD COLUMN locked_at DATETIME NULL AFTER locked_by_user_id,
  ADD COLUMN lock_expires_at DATETIME NULL AFTER locked_at;

ALTER TABLE tickets
  ADD CONSTRAINT fk_tickets_locked_by FOREIGN KEY (locked_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_tickets_lock_expires_at ON tickets(lock_expires_at);
