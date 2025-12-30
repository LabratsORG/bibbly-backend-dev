/**
 * Support Routes
 */

const express = require('express');
const router = express.Router();
const {
  getHelpFAQ,
  getSafetyGuidelines,
  sendFeedback,
} = require('../controllers/supportController');
const { protect } = require('../middleware/auth');

// Public routes
router.get('/help-faq', getHelpFAQ);
router.get('/safety-guidelines', getSafetyGuidelines);

// Protected routes
router.post('/feedback', protect, sendFeedback);

module.exports = router;

