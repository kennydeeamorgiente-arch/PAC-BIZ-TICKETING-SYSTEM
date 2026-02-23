const db = require('../config/database');

async function logAudit({
  actorUserId = null,
  entityType,
  entityId = null,
  action,
  oldValues = null,
  newValues = null,
  ipAddress = null,
  userAgent = null,
}) {
  if (!entityType || !action) return;

  await db.query(
    `INSERT INTO audit_logs
      (actor_user_id, entity_type, entity_id, action, old_values, new_values, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actorUserId,
      entityType,
      entityId,
      action,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      ipAddress,
      userAgent,
    ]
  );
}

async function addSystemActivityComment(ticketId, message) {
  if (!ticketId || !message) return;
  await db.query(
    `INSERT INTO ticket_comments (ticket_id, author_user_id, comment_text, is_internal)
     VALUES (?, NULL, ?, 1)`,
    [ticketId, `[SYSTEM] ${message}`]
  );
}

module.exports = {
  logAudit,
  addSystemActivityComment,
};

