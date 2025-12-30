/**
 * Settings Routes
 */

const express = require('express');
const router = express.Router();
const {
  getSettings,
  updatePrivacySettings,
  updateNotificationSettings,
  changePassword,
  updateEmail,
  changeUsername,
  exportData,
  deleteAccount
} = require('../controllers/settingsController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getSettings);
router.put('/privacy', updatePrivacySettings);
router.put('/notifications', updateNotificationSettings);
router.put('/password', changePassword);
router.put('/email', updateEmail);
router.put('/username', changeUsername);
router.get('/export', exportData);
router.delete('/account', deleteAccount);

module.exports = router;

