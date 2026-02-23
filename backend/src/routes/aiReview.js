const express = require('express');
const { requireAuth } = require('../middleware/auth');
const aiReviewController = require('../controllers/aiReviewController');

const router = express.Router();

router.get('/queue', requireAuth, aiReviewController.getQueue);
router.get('/intake-queue', requireAuth, aiReviewController.getIntakeQueue);
router.get('/metrics', requireAuth, aiReviewController.getMetrics);
router.get('/dashboard', requireAuth, aiReviewController.getDashboard);
router.get('/recommendations', requireAuth, aiReviewController.getRecommendations);
router.get('/readiness', requireAuth, aiReviewController.getReadiness);
router.post('/email-sync', requireAuth, aiReviewController.runEmailSyncNow);
router.patch('/intake-queue/:id/release', requireAuth, aiReviewController.releaseIntakeEmail);
router.patch('/intake-queue/:id/dismiss', requireAuth, aiReviewController.dismissIntakeEmail);
router.delete('/intake-queue/:id', requireAuth, aiReviewController.deleteIntakeEmail);
router.patch('/:id/review', requireAuth, aiReviewController.reviewInference);

module.exports = router;
