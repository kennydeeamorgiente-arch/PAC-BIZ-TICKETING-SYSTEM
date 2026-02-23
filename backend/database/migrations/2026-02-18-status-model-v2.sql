-- V2 status model extension for richer operational flow
-- Safe to run multiple times.

USE it_ticketing_v2;

INSERT INTO ticket_statuses (status_code, is_terminal, sort_order)
VALUES ('new', 0, 1)
ON DUPLICATE KEY UPDATE
  is_terminal = VALUES(is_terminal),
  sort_order = VALUES(sort_order);

INSERT INTO ticket_statuses (status_code, is_terminal, sort_order)
VALUES ('open', 0, 2)
ON DUPLICATE KEY UPDATE
  is_terminal = VALUES(is_terminal),
  sort_order = VALUES(sort_order);

INSERT INTO ticket_statuses (status_code, is_terminal, sort_order)
VALUES ('in_progress', 0, 3)
ON DUPLICATE KEY UPDATE
  is_terminal = VALUES(is_terminal),
  sort_order = VALUES(sort_order);

INSERT INTO ticket_statuses (status_code, is_terminal, sort_order)
VALUES ('user_pending', 0, 4)
ON DUPLICATE KEY UPDATE
  is_terminal = VALUES(is_terminal),
  sort_order = VALUES(sort_order);

INSERT INTO ticket_statuses (status_code, is_terminal, sort_order)
VALUES ('external_support', 0, 5)
ON DUPLICATE KEY UPDATE
  is_terminal = VALUES(is_terminal),
  sort_order = VALUES(sort_order);

INSERT INTO ticket_statuses (status_code, is_terminal, sort_order)
VALUES ('reopened', 0, 6)
ON DUPLICATE KEY UPDATE
  is_terminal = VALUES(is_terminal),
  sort_order = VALUES(sort_order);

INSERT INTO ticket_statuses (status_code, is_terminal, sort_order)
VALUES ('resolved', 1, 7)
ON DUPLICATE KEY UPDATE
  is_terminal = VALUES(is_terminal),
  sort_order = VALUES(sort_order);

INSERT INTO ticket_statuses (status_code, is_terminal, sort_order)
VALUES ('closed', 1, 8)
ON DUPLICATE KEY UPDATE
  is_terminal = VALUES(is_terminal),
  sort_order = VALUES(sort_order);

INSERT INTO ticket_statuses (status_code, is_terminal, sort_order)
VALUES ('deleted', 1, 9)
ON DUPLICATE KEY UPDATE
  is_terminal = VALUES(is_terminal),
  sort_order = VALUES(sort_order);
