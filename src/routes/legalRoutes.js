/**
 * Legal Routes
 */

const express = require('express');
const router = express.Router();
const {
  getTermsOfService,
  getPrivacyPolicy,
  getCommunityGuidelines,
} = require('../controllers/legalController');

// All legal routes are public
router.get('/terms', getTermsOfService);
router.get('/privacy', getPrivacyPolicy);
router.get('/guidelines', getCommunityGuidelines);

module.exports = router;

