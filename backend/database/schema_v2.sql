-- IT Ticketing System - Relational Schema V2
-- MySQL 8.0+
-- Design goals:
-- 1) Strong foreign keys and normalized lookup tables
-- 2) Full CRUD support with soft-delete and auditability
-- 3) Email-first intake + internal IT portal operations

CREATE DATABASE IF NOT EXISTS it_ticketing_v2
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE it_ticketing_v2;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- =========================
-- Lookup / Reference Tables
-- =========================

CREATE TABLE roles (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  display_name VARCHAR(60) NOT NULL,
  description VARCHAR(255) NULL,
  is_portal_role TINYINT(1) NOT NULL DEFAULT 1,
  has_full_portal_access TINYINT(1) NOT NULL DEFAULT 0,
  is_email_only TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE shifts (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shift_code VARCHAR(10) NOT NULL UNIQUE, -- AM / PM / GY
  display_name VARCHAR(40) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE ticket_priorities (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  priority_code VARCHAR(20) NOT NULL UNIQUE, -- low / medium / high / critical
  sort_order TINYINT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE ticket_statuses (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  status_code VARCHAR(30) NOT NULL UNIQUE, -- new / open / in_progress / user_pending / external_support / reopened / resolved / closed / deleted
  is_terminal TINYINT(1) NOT NULL DEFAULT 0,
  sort_order TINYINT UNSIGNED NOT NULL
) ENGINE=InnoDB;

CREATE TABLE ticket_categories (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_code VARCHAR(40) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE intake_channels (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  channel_code VARCHAR(20) NOT NULL UNIQUE, -- email / portal / api / phone
  display_name VARCHAR(40) NOT NULL
) ENGINE=InnoDB;

-- ============
-- Core Tables
-- ============

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL, -- null allowed for email-only requester accounts
  auth_provider ENUM('local', 'google_workspace', 'email_only') NOT NULL DEFAULT 'local',
  full_name VARCHAR(120) NOT NULL,
  avatar_data MEDIUMTEXT NULL, -- cropped profile image as data URL
  role_id TINYINT UNSIGNED NOT NULL,
  shift_id TINYINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_users_shift FOREIGN KEY (shift_id) REFERENCES shifts(id),
  CONSTRAINT chk_users_email CHECK (email LIKE '%@%')
) ENGINE=InnoDB;

CREATE TABLE user_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  session_token_hash VARCHAR(255) NOT NULL UNIQUE,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_number VARCHAR(30) NOT NULL UNIQUE,
  subject VARCHAR(255) NOT NULL,
  description LONGTEXT NULL,
  requester_user_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  assigned_to_user_id BIGINT UNSIGNED NULL,
  locked_by_user_id BIGINT UNSIGNED NULL,
  locked_at DATETIME NULL,
  lock_expires_at DATETIME NULL,
  category_id SMALLINT UNSIGNED NULL,
  priority_id TINYINT UNSIGNED NOT NULL,
  status_id TINYINT UNSIGNED NOT NULL,
  intake_channel_id TINYINT UNSIGNED NOT NULL,
  email_thread_id VARCHAR(255) NULL,
  first_response_at DATETIME NULL,
  resolved_at DATETIME NULL,
  closed_at DATETIME NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tickets_requester FOREIGN KEY (requester_user_id) REFERENCES users(id),
  CONSTRAINT fk_tickets_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_tickets_assigned_to FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
  CONSTRAINT fk_tickets_locked_by FOREIGN KEY (locked_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_category FOREIGN KEY (category_id) REFERENCES ticket_categories(id),
  CONSTRAINT fk_tickets_priority FOREIGN KEY (priority_id) REFERENCES ticket_priorities(id),
  CONSTRAINT fk_tickets_status FOREIGN KEY (status_id) REFERENCES ticket_statuses(id),
  CONSTRAINT fk_tickets_channel FOREIGN KEY (intake_channel_id) REFERENCES intake_channels(id),
  UNIQUE KEY uk_tickets_email_thread (email_thread_id)
) ENGINE=InnoDB;

-- ======================
-- Ticket Conversation DB
-- ======================

CREATE TABLE ticket_comments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  author_user_id BIGINT UNSIGNED NULL,
  comment_text LONGTEXT NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE ticket_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  comment_id BIGINT UNSIGNED NULL,
  uploaded_by_user_id BIGINT UNSIGNED NULL,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  storage_provider VARCHAR(40) NOT NULL DEFAULT 'local', -- local / gdrive / s3
  storage_key VARCHAR(500) NOT NULL, -- filesystem path or cloud object key
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_comment FOREIGN KEY (comment_id) REFERENCES ticket_comments(id) ON DELETE SET NULL,
  CONSTRAINT fk_attachments_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE email_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  gmail_message_id VARCHAR(128) NOT NULL UNIQUE,
  gmail_thread_id VARCHAR(128) NULL,
  direction ENUM('inbound', 'outbound') NOT NULL,
  from_email VARCHAR(190) NOT NULL,
  to_email VARCHAR(190) NOT NULL,
  cc_email VARCHAR(500) NULL,
  bcc_email VARCHAR(500) NULL,
  subject VARCHAR(255) NULL,
  body_text LONGTEXT NULL,
  body_html LONGTEXT NULL,
  sent_or_received_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_email_messages_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE incoming_email_quarantine (
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
  UNIQUE KEY uk_quarantine_gmail_message_id (gmail_message_id)
) ENGINE=InnoDB;

-- =======================
-- Notifications Subsystem
-- =======================

CREATE TABLE notification_types (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type_code VARCHAR(60) NOT NULL UNIQUE, -- ticket_created / ticket_assigned / ...
  display_name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE user_notification_preferences (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  in_app_enabled TINYINT(1) NOT NULL DEFAULT 1,
  email_enabled TINYINT(1) NOT NULL DEFAULT 1,
  notify_ticket_created TINYINT(1) NOT NULL DEFAULT 1,
  notify_ticket_assigned TINYINT(1) NOT NULL DEFAULT 1,
  notify_ticket_comment TINYINT(1) NOT NULL DEFAULT 1,
  notify_ticket_status TINYINT(1) NOT NULL DEFAULT 1,
  notify_sla_breached TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_unp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NULL,
  notification_type_id SMALLINT UNSIGNED NOT NULL,
  recipient_user_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('in_app', 'email') NOT NULL DEFAULT 'in_app',
  title VARCHAR(255) NOT NULL,
  message LONGTEXT NOT NULL,
  payload JSON NULL, -- optional context (ticket number, links, etc.)
  priority ENUM('low', 'normal', 'high', 'critical') NOT NULL DEFAULT 'normal',
  status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  sent_at DATETIME NULL,
  failed_reason VARCHAR(500) NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  CONSTRAINT fk_notifications_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_type FOREIGN KEY (notification_type_id) REFERENCES notification_types(id),
  CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =======================
-- SLA / Workflow Tracking
-- =======================

CREATE TABLE sla_policies (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  policy_name VARCHAR(100) NOT NULL UNIQUE,
  priority_id TINYINT UNSIGNED NOT NULL,
  first_response_target_minutes INT UNSIGNED NOT NULL,
  resolution_target_minutes INT UNSIGNED NOT NULL,
  business_hours_only TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sla_policies_priority FOREIGN KEY (priority_id) REFERENCES ticket_priorities(id)
) ENGINE=InnoDB;

CREATE TABLE ticket_sla_metrics (
  ticket_id BIGINT UNSIGNED PRIMARY KEY,
  policy_id SMALLINT UNSIGNED NOT NULL,
  elapsed_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  is_timer_running TINYINT(1) NOT NULL DEFAULT 0,
  first_response_breached TINYINT(1) NOT NULL DEFAULT 0,
  resolution_breached TINYINT(1) NOT NULL DEFAULT 0,
  last_started_at DATETIME NULL,
  last_paused_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_sla_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_sla_policy FOREIGN KEY (policy_id) REFERENCES sla_policies(id)
) ENGINE=InnoDB;

CREATE TABLE sla_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('assigned', 'paused', 'resumed', 'responded', 'resolved', 'reopened') NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  shift_id TINYINT UNSIGNED NULL,
  event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes VARCHAR(500) NULL,
  CONSTRAINT fk_sla_events_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_sla_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sla_events_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE ticket_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  from_status_id TINYINT UNSIGNED NULL,
  to_status_id TINYINT UNSIGNED NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(500) NULL,
  CONSTRAINT fk_status_hist_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_status_hist_from FOREIGN KEY (from_status_id) REFERENCES ticket_statuses(id),
  CONSTRAINT fk_status_hist_to FOREIGN KEY (to_status_id) REFERENCES ticket_statuses(id),
  CONSTRAINT fk_status_hist_actor FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE ticket_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  assigned_to_user_id BIGINT UNSIGNED NOT NULL,
  assigned_by_user_id BIGINT UNSIGNED NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unassigned_at DATETIME NULL,
  reason VARCHAR(500) NULL,
  CONSTRAINT fk_assign_hist_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_assign_hist_to FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
  CONSTRAINT fk_assign_hist_by FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ======================
-- AI / Rules Integration
-- ======================

CREATE TABLE ai_inferences (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  intake_source ENUM('email', 'portal', 'api', 'manual') NOT NULL DEFAULT 'portal',
  provider VARCHAR(60) NOT NULL DEFAULT 'rules_engine', -- rules_engine / openai / ollama / manual_input
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
  CONSTRAINT fk_ai_inferences_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE ticket_priority_history (
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
  CONSTRAINT fk_priority_hist_inference FOREIGN KEY (inference_id) REFERENCES ai_inferences(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ==========
-- Audit Trail
-- ==========

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  entity_type VARCHAR(60) NOT NULL, -- tickets / users / shifts / comments / ...
  entity_id BIGINT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL, -- create / update / delete / assign / login / ...
  old_values JSON NULL,
  new_values JSON NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE app_config (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(120) NOT NULL UNIQUE,
  config_value VARCHAR(500) NOT NULL,
  value_type ENUM('string', 'number', 'boolean', 'json') NOT NULL DEFAULT 'string',
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_config_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =======
-- Indexes
-- =======

CREATE INDEX idx_users_role_active ON users(role_id, is_active);
CREATE INDEX idx_users_shift_active ON users(shift_id, is_active);
CREATE INDEX idx_user_sessions_user_expiry ON user_sessions(user_id, expires_at);
CREATE INDEX idx_tickets_status_assigned ON tickets(status_id, assigned_to_user_id);
CREATE INDEX idx_tickets_priority_status ON tickets(priority_id, status_id);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_tickets_requester ON tickets(requester_user_id);
CREATE INDEX idx_tickets_lock_expires_at ON tickets(lock_expires_at);
CREATE INDEX idx_comments_ticket_created ON ticket_comments(ticket_id, created_at);
CREATE INDEX idx_attachments_ticket ON ticket_attachments(ticket_id);
CREATE INDEX idx_email_ticket_direction ON email_messages(ticket_id, direction);
CREATE INDEX idx_quarantine_decision_time ON incoming_email_quarantine(decision, created_at);
CREATE INDEX idx_quarantine_risk_time ON incoming_email_quarantine(risk_level, risk_score, created_at);
CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_user_id, read_at, created_at);
CREATE INDEX idx_sla_events_ticket_time ON sla_events(ticket_id, event_at);
CREATE INDEX idx_status_history_ticket_time ON ticket_status_history(ticket_id, changed_at);
CREATE INDEX idx_assignments_ticket_time ON ticket_assignments(ticket_id, assigned_at);
CREATE INDEX idx_ai_inferences_ticket_time ON ai_inferences(ticket_id, created_at);
CREATE INDEX idx_ai_inferences_review ON ai_inferences(needs_review, is_auto_applied, created_at);
CREATE INDEX idx_priority_history_ticket_time ON ticket_priority_history(ticket_id, created_at);
CREATE INDEX idx_audit_entity_time ON audit_logs(entity_type, entity_id, created_at);

-- ==============
-- Seed Reference
-- ==============

INSERT INTO roles (code, display_name, description, is_portal_role, has_full_portal_access, is_email_only) VALUES
('technician', 'IT Support', 'Primary operator with full ticketing and management access', 1, 1, 0),
('admin', 'Administrator', 'System governance / backup privileged role', 1, 1, 0),
('manager', 'Manager', 'Reporting and oversight (optional read-heavy role)', 1, 0, 0),
('requester', 'Requester', 'Employee requester (email-only, no portal login)', 0, 0, 1);

INSERT INTO shifts (shift_code, display_name, start_time, end_time) VALUES
('AM', 'AM Shift', '06:00:00', '14:00:00'),
('PM', 'PM Shift', '14:00:00', '22:00:00'),
('GY', 'GY Shift', '22:00:00', '06:00:00');

INSERT INTO ticket_priorities (priority_code, sort_order) VALUES
('low', 1), ('medium', 2), ('high', 3), ('critical', 4);

INSERT INTO ticket_statuses (status_code, is_terminal, sort_order) VALUES
('new', 0, 1),
('open', 0, 2),
('in_progress', 0, 3),
('user_pending', 0, 4),
('external_support', 0, 5),
('reopened', 0, 6),
('resolved', 1, 7),
('closed', 1, 8),
('deleted', 1, 9);

INSERT INTO ticket_categories (category_code, display_name) VALUES
('general', 'General'),
('email', 'Email'),
('network', 'Network'),
('hardware', 'Hardware'),
('software', 'Software'),
('security', 'Security');

INSERT INTO intake_channels (channel_code, display_name) VALUES
('email', 'Email'),
('it_portal', 'IT Portal'),
('api', 'API'),
('phone', 'Phone');

INSERT INTO notification_types (type_code, display_name, description) VALUES
('ticket_created', 'Ticket Created', 'Sent when a new ticket is created'),
('ticket_assigned', 'Ticket Assigned', 'Sent when a ticket is assigned or reassigned'),
('ticket_comment_added', 'Ticket Comment Added', 'Sent when a new comment is posted'),
('ticket_status_changed', 'Ticket Status Changed', 'Sent when ticket status changes'),
('sla_breached', 'SLA Breached', 'Sent when SLA thresholds are breached'),
('shift_started', 'Shift Started', 'Sent when user shift starts');

-- Example SLA policy per priority
INSERT INTO sla_policies (policy_name, priority_id, first_response_target_minutes, resolution_target_minutes, business_hours_only)
SELECT CONCAT('Default ', UPPER(tp.priority_code), ' Policy'),
       tp.id,
       CASE tp.priority_code
         WHEN 'critical' THEN 15
         WHEN 'high' THEN 30
         WHEN 'medium' THEN 60
         ELSE 120
       END,
       CASE tp.priority_code
         WHEN 'critical' THEN 240
         WHEN 'high' THEN 480
         WHEN 'medium' THEN 1440
         ELSE 2880
       END,
       1
FROM ticket_priorities tp;

INSERT INTO app_config (config_key, config_value, value_type, description, is_active) VALUES
('report_overdue_days', '3', 'number', 'Ticket overdue threshold in days for dashboard and reports.', 1),
('report_sla_healthy_threshold', '90', 'number', 'SLA percentage threshold for Healthy band.', 1),
('report_sla_monitor_threshold', '70', 'number', 'SLA percentage threshold for Monitor band.', 1)
ON DUPLICATE KEY UPDATE
  config_value = VALUES(config_value),
  value_type = VALUES(value_type),
  description = VALUES(description),
  is_active = VALUES(is_active);
