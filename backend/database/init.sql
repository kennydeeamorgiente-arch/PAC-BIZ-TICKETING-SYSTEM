-- Initialize IT Ticketing System with Sample Data
USE it_ticketing;

-- Insert Default Admin User (password: admin123)
INSERT INTO users (username, email, password_hash, full_name, role, shift_type) VALUES
('admin', 'admin@company.com', '$2b$10$ujuA5XMXHLXV7Y6Lp1Sf2.pZBh.45XMkiLCc216q4pmHOBGGa/.ki', 'System Administrator', 'admin', 'AM');

-- Insert Sample Agents
INSERT INTO users (username, email, password_hash, full_name, role, shift_type) VALUES
('agent1', 'agent1@company.com', '$2b$10$ujuA5XMXHLXV7Y6Lp1Sf2.pZBh.45XMkiLCc216q4pmHOBGGa/.ki', 'John Smith', 'agent', 'AM'),
('agent2', 'agent2@company.com', '$2b$10$ujuA5XMXHLXV7Y6Lp1Sf2.pZBh.45XMkiLCc216q4pmHOBGGa/.ki', 'Jane Doe', 'agent', 'PM');

-- Insert Sample Users
INSERT INTO users (username, email, password_hash, full_name, role, shift_type) VALUES
('user1', 'user1@company.com', '$2b$10$ujuA5XMXHLXV7Y6Lp1Sf2.pZBh.45XMkiLCc216q4pmHOBGGa/.ki', 'Alice Johnson', 'user', NULL),
('user2', 'user2@company.com', '$2b$10$ujuA5XMXHLXV7Y6Lp1Sf2.pZBh.45XMkiLCc216q4pmHOBGGa/.ki', 'Bob Wilson', 'user', NULL);

-- Insert Sample Tickets
INSERT INTO tickets (ticket_number, title, description, status, priority, category, created_by, assigned_to) VALUES
('TKT-0001', 'Cannot access email', 'User is unable to access their company email account. Getting authentication error.', 'open', 'high', 'Email', 4, 2),
('TKT-0002', 'Printer not working', 'Office printer on floor 3 is not printing documents.', 'in_progress', 'medium', 'Hardware', 5, 3),
('TKT-0003', 'Software installation request', 'Need Adobe Creative Cloud installed on workstation.', 'open', 'low', 'Software', 4, NULL),
('TKT-0004', 'Network connection issues', 'Intermittent network connectivity issues in conference room B.', 'resolved', 'high', 'Network', 5, 2);

-- Insert Sample SLA Tracking Records
INSERT INTO sla_tracking (ticket_id, event_type, shift_type, accumulated_minutes, notes) VALUES
(1, 'assigned', 'AM', 0, 'Ticket assigned to agent2'),
(2, 'assigned', 'PM', 0, 'Ticket assigned to agent3'),
(2, 'responded', 'PM', 15.5, 'Initial response sent to user'),
(4, 'assigned', 'AM', 0, 'Ticket assigned to agent2'),
(4, 'responded', 'AM', 8.2, 'Initial response sent to user'),
(4, 'resolved', 'AM', 45.8, 'Network issue resolved');
