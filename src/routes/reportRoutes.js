/**
 * Report Routes
 */

const express = require('express');
const router = express.Router();
const {
  reportUser,
  getReportHistory,
  getReportStatus,
  getPendingReports,
  resolveReport
} = require('../controllers/reportController');
const { protect, requireAdmin } = require('../middleware/auth');
const { validateReport, validateId } = require('../middleware/validators');

router.use(protect);

// User routes
router.post('/', validateReport, reportUser);
router.get('/history', getReportHistory);
router.get('/:reportId', getReportStatus);

// Admin routes
router.get('/admin/pending', requireAdmin, getPendingReports);
router.post('/admin/:reportId/resolve', requireAdmin, resolveReport);

module.exports = router;

