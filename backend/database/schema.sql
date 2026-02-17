-- Create IT Ticketing System Database
CREATE DATABASE IF NOT EXISTS it_ticketing;
USE it_ticketing;

-- Users Table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role ENUM('admin', 'agent', 'user') NOT NULL DEFAULT 'user',
    shift_type ENUM('AM', 'PM', 'GY') NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Shifts Table
CREATE TABLE shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shift_name ENUM('AM', 'PM', 'GY') UNIQUE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL
);

-- Insert Shift Data
INSERT INTO shifts (shift_name, start_time, end_time) VALUES
('AM', '06:00:00', '14:00:00'),
('PM', '14:00:00', '22:00:00'),
('GY', '22:00:00', '06:00:00');

-- Tickets Table
CREATE TABLE tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
    priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    category VARCHAR(50),
    created_by INT NOT NULL,
    assigned_to INT,
    first_response_at TIMESTAMP NULL,
    resolved_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

-- SLA Tracking Table
CREATE TABLE sla_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    event_type ENUM('assigned', 'paused', 'resumed', 'responded', 'resolved') NOT NULL,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shift_type ENUM('AM', 'PM', 'GY'),
    accumulated_minutes DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

-- Create Indexes for Performance
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_sla_tracking_ticket_id ON sla_tracking(ticket_id);
CREATE INDEX idx_sla_tracking_event_type ON sla_tracking(event_type);
CREATE INDEX idx_sla_tracking_event_timestamp ON sla_tracking(event_timestamp);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
