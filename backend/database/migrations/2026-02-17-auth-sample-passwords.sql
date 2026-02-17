-- Phase auth migration: align sample passwords to admin123
USE it_ticketing;

UPDATE users
SET password_hash = '$2b$10$ujuA5XMXHLXV7Y6Lp1Sf2.pZBh.45XMkiLCc216q4pmHOBGGa/.ki'
WHERE email IN ('admin@company.com', 'agent1@company.com', 'agent2@company.com', 'user1@company.com', 'user2@company.com');
