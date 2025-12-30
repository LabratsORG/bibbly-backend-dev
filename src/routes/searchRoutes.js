/**
 * Search Routes
 */

const express = require('express');
const router = express.Router();
const {
  searchUsers,
  searchByUsername,
  getSearchSuggestions,
  getPopularSearches
} = require('../controllers/searchController');
const { protect, requireCompleteProfile } = require('../middleware/auth');
const { validateSearch, validateUsername } = require('../middleware/validators');

router.use(protect);
router.use(requireCompleteProfile);

router.get('/', validateSearch, searchUsers);
router.get('/username/:username', validateUsername, searchByUsername);
router.get('/suggestions', getSearchSuggestions);
router.get('/popular', getPopularSearches);

module.exports = router;

