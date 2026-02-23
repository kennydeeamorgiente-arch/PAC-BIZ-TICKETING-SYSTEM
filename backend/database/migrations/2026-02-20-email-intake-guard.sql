-- Email Intake Guard (Phishing + Non-ticket filter log)
-- Safe to run on MySQL 8.x

USE it_ticketing_v2;

CREATE TABLE IF NOT EXISTS incoming_email_quarantine (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gmail_message_id VARCHAR(128) NULL,
  gmail_thread_id VARCHAR(128) NULL,
  from_email VARCHAR(190) NOT NULL,
  to_email VARCHAR(500) NULL,
  subject VARCHAR(255) NOT NULL,
  body_snippet VARCHAR(2000) NULL,
  risk_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
  risk_level ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'low',
  decision ENUM('quarantine', 'review', 'ignore') NOT NULL DEFAULT 'quarantine',
  reasons_json JSON NULL,
  rule_hits_json JSON NULL,
  urls_json JSON NULL,
  attachments_json JSON NULL,
  status ENUM('new', 'released', 'dismissed') NOT NULL DEFAULT 'new',
  released_ticket_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  CONSTRAINT fk_quarantine_released_ticket FOREIGN KEY (released_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
  UNIQUE KEY uk_quarantine_gmail_message_id (gmail_message_id),
  INDEX idx_quarantine_decision_time (decision, created_at),
  INDEX idx_quarantine_risk_time (risk_level, risk_score, created_at)
) ENGINE=InnoDB;

