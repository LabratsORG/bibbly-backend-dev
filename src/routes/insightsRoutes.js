/**
 * Insights Routes
 */

const express = require('express');
const router = express.Router();
const {
  getInsights,
  getProfileScore,
  getPopularInterests
} = require('../controllers/insightsController');
const { protect, requireCompleteProfile } = require('../middleware/auth');

router.use(protect);
router.use(requireCompleteProfile);

router.get('/', getInsights);
router.get('/score', getProfileScore);
router.get('/interests', getPopularInterests);

module.exports = router;

