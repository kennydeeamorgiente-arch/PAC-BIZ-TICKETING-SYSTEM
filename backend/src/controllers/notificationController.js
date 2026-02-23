const {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../services/notificationService');

const listNotifications = async (req, res) => {
  try {
    const limit = Number(req.query.limit || 30);
    const rows = await getUserNotifications(req.user.id, limit);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error listing notifications:', error);
    return res.status(500).json({ success: false, message: 'Failed to load notifications', error: error.message });
  }
};

const readNotification = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid notification id' });
    await markNotificationRead(req.user.id, id);
    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ success: false, message: 'Failed to update notification', error: error.message });
  }
};

const readAllNotifications = async (req, res) => {
  try {
    await markAllNotificationsRead(req.user.id);
    return res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return res.status(500).json({ success: false, message: 'Failed to update notifications', error: error.message });
  }
};

module.exports = {
  listNotifications,
  readNotification,
  readAllNotifications,
};

