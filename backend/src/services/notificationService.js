const db = require('../config/database');

async function getNotificationTypeId(typeCode) {
  const [rows] = await db.query(
    'SELECT id FROM notification_types WHERE type_code = ? AND is_active = 1 LIMIT 1',
    [typeCode]
  );
  return rows.length ? rows[0].id : null;
}

async function createInAppNotification({
  recipientUserId,
  typeCode,
  title,
  message,
  ticketId = null,
  payload = null,
  priority = 'normal',
}) {
  if (!recipientUserId) return null;
  const typeId = await getNotificationTypeId(typeCode);
  if (!typeId) return null;

  const [result] = await db.query(
    `INSERT INTO notifications
       (ticket_id, notification_type_id, recipient_user_id, channel, title, message, payload, priority, status)
     VALUES (?, ?, ?, 'in_app', ?, ?, ?, ?, 'sent')`,
    [ticketId, typeId, recipientUserId, title, message, payload ? JSON.stringify(payload) : null, priority]
  );

  return result.insertId;
}

async function notifyUsers(userIds, params) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean).map(Number))];
  for (const userId of uniqueIds) {
    // eslint-disable-next-line no-await-in-loop
    await createInAppNotification({ ...params, recipientUserId: userId });
  }
}

async function getUserNotifications(userId, limit = 30) {
  const [rows] = await db.query(
    `SELECT n.id, n.ticket_id, n.title, n.message, n.priority, n.read_at, n.created_at,
            nt.type_code
     FROM notifications n
     INNER JOIN notification_types nt ON nt.id = n.notification_type_id
     WHERE n.recipient_user_id = ?
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [userId, Number(limit) || 30]
  );
  return rows;
}

async function markNotificationRead(userId, notificationId) {
  await db.query(
    'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND recipient_user_id = ?',
    [notificationId, userId]
  );
}

async function markAllNotificationsRead(userId) {
  await db.query(
    'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE recipient_user_id = ?',
    [userId]
  );
}

module.exports = {
  createInAppNotification,
  notifyUsers,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};

