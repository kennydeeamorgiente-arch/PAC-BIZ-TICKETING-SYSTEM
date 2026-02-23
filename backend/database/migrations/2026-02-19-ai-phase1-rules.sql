-- AI Phase 1 (rules-only) schema additions
-- Safe to run on MySQL 8.x

USE it_ticketing_v2;

CREATE TABLE IF NOT EXISTS ai_inferences (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  intake_source ENUM('email', 'portal', 'api', 'manual') NOT NULL DEFAULT 'portal',
  provider VARCHAR(60) NOT NULL DEFAULT 'rules_engine',
  model_name VARCHAR(120) NULL,
  mode VARCHAR(40) NOT NULL DEFAULT 'rules_only',
  prompt_version VARCHAR(40) NULL,
  predicted_priority_code VARCHAR(20) NOT NULL,
  applied_priority_code VARCHAR(20) NOT NULL,
  confidence DECIMAL(5,4) NOT NULL DEFAULT 0,
  decision_reason VARCHAR(500) NULL,
  rule_hits JSON NULL,
  raw_output JSON NULL,
  is_auto_applied TINYINT(1) NOT NULL DEFAULT 0,
  needs_review TINYINT(1) NOT NULL DEFAULT 0,
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_inferences_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ai_inferences_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ai_inferences_ticket_time (ticket_id, created_at),
  INDEX idx_ai_inferences_review (needs_review, is_auto_applied, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_priority_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  old_priority_id TINYINT UNSIGNED NULL,
  new_priority_id TINYINT UNSIGNED NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,
  change_source ENUM('create', 'rule_engine', 'manual', 'ai', 'system') NOT NULL DEFAULT 'system',
  reason VARCHAR(500) NULL,
  inference_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_priority_hist_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_priority_hist_old FOREIGN KEY (old_priority_id) REFERENCES ticket_priorities(id),
  CONSTRAINT fk_priority_hist_new FOREIGN KEY (new_priority_id) REFERENCES ticket_priorities(id),
  CONSTRAINT fk_priority_hist_actor FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_priority_hist_inference FOREIGN KEY (inference_id) REFERENCES ai_inferences(id) ON DELETE SET NULL,
  INDEX idx_priority_history_ticket_time (ticket_id, created_at)
) ENGINE=InnoDB;

