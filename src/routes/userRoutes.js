/**
 * User Routes
 */

const express = require('express');
const router = express.Router();
const {
  getUserById,
  getUserByUsername,
  checkUsernameAvailability,
  getOnlineStatus
} = require('../controllers/userController');
const { protect, optionalAuth } = require('../middleware/auth');
const { validateId, validateUsername } = require('../middleware/validators');

// Public routes
router.get('/check-username/:username', checkUsernameAvailability);
router.get('/username/:username', optionalAuth, validateUsername, getUserByUsername);

// Protected routes
router.use(protect);

router.get('/:id', validateId, getUserById);
router.get('/:id/status', validateId, getOnlineStatus);

module.exports = router;

