/**
 * Discovery Routes
 */

const express = require('express');
const router = express.Router();
const {
  getDiscoveryFeed,
  getSmartFeed,
  getFeedSections,
  skipProfile,
  getFilterOptions,
  getCollegeProfiles,
  getWorkplaceProfiles
} = require('../controllers/discoveryController');
const { protect, requireCompleteProfile } = require('../middleware/auth');
const { validateId } = require('../middleware/validators');

router.use(protect);
router.use(requireCompleteProfile);

router.get('/', getDiscoveryFeed);
router.get('/smart-feed', getSmartFeed);
router.get('/sections', getFeedSections);
router.post('/skip/:profileId', skipProfile);
router.get('/filters', getFilterOptions);
router.get('/college', getCollegeProfiles);
router.get('/workplace', getWorkplaceProfiles);

module.exports = router;

