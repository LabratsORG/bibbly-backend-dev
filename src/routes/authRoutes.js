/**
 * Authentication Routes
 */

const express = require('express');
const router = express.Router();
const {
  signup,
  login,
  verifyGoogleToken,
  googleAuth,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  logoutAll,
  getMe,
  updateDeviceToken
} = require('../controllers/authController');
const { protect, createActionLimiter } = require('../middleware/auth');
const { validateSignup, validateLogin, validateGoogleAuth } = require('../middleware/validators');

// Rate limiters
const loginLimiter = createActionLimiter('login', 5, 15 * 60 * 1000); // 5 attempts per 15 min
const signupLimiter = createActionLimiter('signup', 3, 60 * 60 * 1000); // 3 per hour

// Public routes
router.post('/signup', signupLimiter, validateSignup, signup);
router.post('/login', loginLimiter, validateLogin, login);
router.post('/google/verify', validateGoogleAuth, verifyGoogleToken);
router.post('/google', validateGoogleAuth, googleAuth);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/refresh-token', refreshToken);

// Protected routes
router.use(protect);
router.get('/me', getMe);
router.post('/logout', logout);
router.post('/logout-all', logoutAll);
router.post('/device-token', updateDeviceToken);

module.exports = router;

