/**
 * Admin Routes
 */

const express = require('express');
const router = express.Router();
const {
  // Config
  getAppConfig,
  updateAppConfig,
  
  // Feature Flags
  getFeatureFlags,
  updateFeatureFlags,
  
  // User Management
  getUsers,
  getUserDetails,
  updateUserStatus,
  
  // Dashboard
  getDashboardStats,
  getLimits,
  updateLimits,
  
  // Unrevealed Chat Payment Settings
  getUnrevealedChatPaymentSettings,
  updateUnrevealedChatPaymentSettings,
  
  // Reports & Moderation
  getReports,
  getReportDetails,
  resolveReport,
  
  // Feedback Management
  getFeedback,
  getFeedbackDetails,
  updateFeedback,
  
  // Analytics
  getAnalytics,
  
  // Activity Logs
  getActivityLogs,
  
  // Blocks Management
  getBlocks,
  getBlockDetails,
  removeBlock,
  getBlockStats
} = require('../controllers/adminController');

const { protect, requireAdmin } = require('../middleware/auth');

// All routes require admin authentication
router.use(protect);
router.use(requireAdmin);

// ==================== DASHBOARD ====================
router.get('/dashboard', getDashboardStats);

// ==================== APP CONFIG ====================
router.get('/config', getAppConfig);
router.put('/config', updateAppConfig);

// ==================== FEATURE FLAGS ====================
router.get('/features', getFeatureFlags);
router.put('/features', updateFeatureFlags);

// ==================== LIMITS ====================
router.get('/limits', getLimits);
router.put('/limits', updateLimits);

// ==================== UNREVEALED CHAT PAYMENT ====================
router.get('/unrevealed-chat-payment', getUnrevealedChatPaymentSettings);
router.put('/unrevealed-chat-payment', updateUnrevealedChatPaymentSettings);

// ==================== USER MANAGEMENT ====================
router.get('/users', getUsers);
router.get('/users/:userId', getUserDetails);
router.put('/users/:userId/status', updateUserStatus);

// ==================== REPORTS & MODERATION ====================
router.get('/reports', getReports);
router.get('/reports/:reportId', getReportDetails);
router.post('/reports/:reportId/resolve', resolveReport);

// ==================== FEEDBACK MANAGEMENT ====================
router.get('/feedback', getFeedback);
router.get('/feedback/:feedbackId', getFeedbackDetails);
router.put('/feedback/:feedbackId', updateFeedback);

// ==================== BLOCKS MANAGEMENT ====================
router.get('/blocks/stats', getBlockStats);
router.get('/blocks', getBlocks);
router.get('/blocks/:blockId', getBlockDetails);
router.delete('/blocks/:blockId', removeBlock);

// ==================== ANALYTICS ====================
router.get('/analytics', getAnalytics);

// ==================== ACTIVITY LOGS ====================
router.get('/activity-logs', getActivityLogs);

module.exports = router;
