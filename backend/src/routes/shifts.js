const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, shiftController.getShifts);
router.patch('/:id', requireAuth, shiftController.updateShift);

module.exports = router;
