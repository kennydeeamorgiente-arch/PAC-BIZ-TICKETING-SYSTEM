const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/templateController');

router.get('/email-replies', requireAuth, controller.listTemplates);
router.post('/email-replies/preview', requireAuth, controller.previewTemplate);

module.exports = router;

