-- IT Ticketing System - Runtime Lean Schema (compatible with current backend code)
-- Use this schema if you want the app to run NOW with minimal, necessary tables/columns.

CREATE DATABASE IF NOT EXISTS it_ticketing
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE it_ticketing;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- =================
-- Core User Tables
-- =================

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  full_name VARCHAR(120) NOT NULL,
  -- Keep legacy + new role values for compatibility with current backend/frontend
  role ENUM('admin', 'technician', 'manager', 'agent', 'user', 'requester') NOT NULL DEFAULT 'technician',
  shift_type ENUM('AM', 'PM', 'GY') NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_users_email CHECK (email LIKE '%@%')
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shifts (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shift_name ENUM('AM', 'PM', 'GY') NOT NULL UNIQUE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ==================
-- Ticketing (CRUD)
-- ==================

CREATE TABLE IF NOT EXISTS tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_number VARCHAR(30) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  description LONGTEXT NULL,
  status ENUM('open', 'in_progress', 'resolved', 'closed', 'deleted') NOT NULL DEFAULT 'open',
  priority ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  category VARCHAR(80) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  assigned_to BIGINT UNSIGNED NULL,
  requester_email VARCHAR(190) NULL,
  email_thread_id VARCHAR(255) NULL,
  first_response_at DATETIME NULL,
  resolved_at DATETIME NULL,
  closed_at DATETIME NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tickets_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tickets_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uk_tickets_email_thread (email_thread_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_comments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  comment_text LONGTEXT NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_comments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_comments_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  comment_id BIGINT UNSIGNED NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  storage_provider ENUM('local', 'gdrive', 's3') NOT NULL DEFAULT 'local',
  storage_key VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_attachments_comment FOREIGN KEY (comment_id) REFERENCES ticket_comments(id) ON DELETE SET NULL,
  CONSTRAINT fk_ticket_attachments_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ======================
-- SLA / Shift Tracking
-- ======================

CREATE TABLE IF NOT EXISTS sla_tracking (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('assigned', 'paused', 'resumed', 'responded', 'resolved') NOT NULL,
  event_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  shift_type ENUM('AM', 'PM', 'GY') NULL,
  accumulated_minutes DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  CONSTRAINT fk_sla_tracking_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ======================
-- Email Message Logging
-- ======================

CREATE TABLE IF NOT EXISTS email_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  gmail_message_id VARCHAR(128) NOT NULL UNIQUE,
  gmail_thread_id VARCHAR(128) NULL,
  direction ENUM('inbound', 'outbound') NOT NULL,
  from_email VARCHAR(190) NOT NULL,
  to_email VARCHAR(190) NOT NULL,
  subject VARCHAR(255) NULL,
  body_text LONGTEXT NULL,
  sent_or_received_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_email_messages_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ======================
-- Notifications (Lean)
-- ======================

CREATE TABLE IF NOT EXISTS notification_types (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type_code VARCHAR(60) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  in_app_enabled TINYINT(1) NOT NULL DEFAULT 1,
  email_enabled TINYINT(1) NOT NULL DEFAULT 1,
  notify_ticket_created TINYINT(1) NOT NULL DEFAULT 1,
  notify_ticket_assigned TINYINT(1) NOT NULL DEFAULT 1,
  notify_ticket_comment TINYINT(1) NOT NULL DEFAULT 1,
  notify_ticket_status TINYINT(1) NOT NULL DEFAULT 1,
  notify_sla_breached TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_notification_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NULL,
  notification_type_id SMALLINT UNSIGNED NOT NULL,
  recipient_user_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('in_app', 'email') NOT NULL DEFAULT 'in_app',
  title VARCHAR(255) NOT NULL,
  message LONGTEXT NOT NULL,
  payload JSON NULL,
  status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  sent_at DATETIME NULL,
  failed_reason VARCHAR(500) NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_type FOREIGN KEY (notification_type_id) REFERENCES notification_types(id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================
-- Minimal Operational Audit
-- ==========================

CREATE TABLE IF NOT EXISTS ticket_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  old_status VARCHAR(30) NULL,
  new_status VARCHAR(30) NOT NULL,
  changed_by BIGINT UNSIGNED NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(500) NULL,
  CONSTRAINT fk_ticket_status_history_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_status_history_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id BIGINT UNSIGNED NOT NULL,
  assigned_to BIGINT UNSIGNED NOT NULL,
  assigned_by BIGINT UNSIGNED NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unassigned_at DATETIME NULL,
  reason VARCHAR(500) NULL,
  CONSTRAINT fk_ticket_assignments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_assignments_to FOREIGN KEY (assigned_to) REFERENCES users(id),
  CONSTRAINT fk_ticket_assignments_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =======
-- Indexes
-- =======

CREATE INDEX idx_users_role_active ON users(role, is_active);
CREATE INDEX idx_users_shift_active ON users(shift_type, is_active);
CREATE INDEX idx_tickets_status_assigned ON tickets(status, assigned_to);
CREATE INDEX idx_tickets_priority_status ON tickets(priority, status);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_is_deleted ON tickets(is_deleted);
CREATE INDEX idx_ticket_comments_ticket_created ON ticket_comments(ticket_id, created_at);
CREATE INDEX idx_sla_tracking_ticket_time ON sla_tracking(ticket_id, event_timestamp);
CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_user_id, read_at, created_at);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_ticket_status_history_ticket_time ON ticket_status_history(ticket_id, changed_at);
CREATE INDEX idx_ticket_assignments_ticket_time ON ticket_assignments(ticket_id, assigned_at);
CREATE INDEX idx_audit_logs_entity_time ON audit_logs(entity_type, entity_id, created_at);

-- ============
-- Seed Values
-- ============

INSERT INTO shifts (shift_name, start_time, end_time) VALUES
('AM', '06:00:00', '14:00:00'),
('PM', '14:00:00', '22:00:00'),
('GY', '22:00:00', '06:00:00')
ON DUPLICATE KEY UPDATE
  start_time = VALUES(start_time),
  end_time = VALUES(end_time);

INSERT INTO notification_types (type_code, display_name, is_active) VALUES
('ticket_created', 'Ticket Created', 1),
('ticket_assigned', 'Ticket Assigned', 1),
('ticket_comment_added', 'Ticket Comment Added', 1),
('ticket_status_changed', 'Ticket Status Changed', 1),
('sla_breached', 'SLA Breached', 1)
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  is_active = VALUES(is_active);
