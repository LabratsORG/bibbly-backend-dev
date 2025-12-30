/**
 * Premium Routes
 */

const express = require('express');
const router = express.Router();
const {
  getAppConfig,
  getPlans,
  getPremiumStatus,
  activatePremium,
  cancelPremium,
  getFeatures,
  getPremiumInsights
} = require('../controllers/premiumController');
const { protect, requirePremium } = require('../middleware/auth');

// Public routes
router.get('/config', getAppConfig);
router.get('/plans', getPlans);
router.get('/features', getFeatures);

// Protected routes
router.use(protect);

router.get('/status', getPremiumStatus);
router.post('/activate', activatePremium);
router.post('/cancel', cancelPremium);
router.get('/insights', requirePremium, getPremiumInsights);

module.exports = router;

