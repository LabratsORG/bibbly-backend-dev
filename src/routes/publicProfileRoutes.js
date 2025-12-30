/**
 * Public Profile Routes
 * For shareable profile links
 */

const express = require('express');
const router = express.Router();
const { getProfileByUsername } = require('../controllers/profileController');
const { optionalAuth } = require('../middleware/auth');
const { validateUsername } = require('../middleware/validators');

// Public profile access via shared link
router.get('/:username', optionalAuth, validateUsername, getProfileByUsername);

module.exports = router;

