-- Adds configurable reporting thresholds to remove hardcoded analytics values.

CREATE TABLE IF NOT EXISTS app_config (
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

INSERT INTO app_config (config_key, config_value, value_type, description, is_active) VALUES
('report_overdue_days', '3', 'number', 'Ticket overdue threshold in days for dashboard and reports.', 1),
('report_sla_healthy_threshold', '90', 'number', 'SLA percentage threshold for Healthy band.', 1),
('report_sla_monitor_threshold', '70', 'number', 'SLA percentage threshold for Monitor band.', 1)
ON DUPLICATE KEY UPDATE
  config_value = VALUES(config_value),
  value_type = VALUES(value_type),
  description = VALUES(description),
  is_active = VALUES(is_active);

