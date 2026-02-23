const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireAuth } = require('../middleware/auth');

router.get('/shifts', requireAuth, reportController.getShiftReport);
router.get('/technicians', requireAuth, reportController.getTechnicianPerformance);
router.get('/ticket-activity', requireAuth, reportController.getTicketActivity);

module.exports = router;
