const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/notificationController');

router.get('/', requireAuth, controller.listNotifications);
router.patch('/read-all', requireAuth, controller.readAllNotifications);
router.patch('/:id/read', requireAuth, controller.readNotification);

module.exports = router;

