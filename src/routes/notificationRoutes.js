/**
 * Notification Routes
 */

const express = require('express');
const router = express.Router();
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.post('/read-all', markAllAsRead);
router.post('/:notificationId/read', markAsRead);
router.delete('/:notificationId', deleteNotification);
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);

module.exports = router;

