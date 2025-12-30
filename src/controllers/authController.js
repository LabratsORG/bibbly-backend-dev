/**
 * Authentication Controller
 * Handles signup, login, Google OAuth, password reset
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Notification = require('../models/Notification');
const ApiResponse = require('../utils/apiResponse');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../utils/email');
const { generateUsername, sanitizeUser } = require('../utils/helpers');
const logger = require('../utils/logger');

// Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Generate JWT tokens
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { id: userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
};

/**
 * @desc    Register new user with email/password
 * @route   POST /api/v1/auth/signup
 * @access  Public
 */
const signup = async (req, res) => {
  try {
    const { email, password, name, username } = req.body;

    // Validate username is provided
    if (!username || username.trim().length === 0) {
      return ApiResponse.badRequest(res, 'Username is required');
    }

    // Validate username length
    if (username.trim().length < 6) {
      return ApiResponse.badRequest(res, 'Username must be at least 6 characters');
    }

    // Check if user exists by email
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return ApiResponse.conflict(res, 'An account with this email already exists');
    }

    // Check if username is already taken
    const existingUsername = await User.findOne({ username: username.toLowerCase().trim() });
    if (existingUsername) {
      return ApiResponse.conflict(res, 'This username is already taken. Please choose another one.');
    }

    // Use provided username (lowercase and trimmed)
    const finalUsername = username.toLowerCase().trim();

    // Create user
    const user = await User.create({
      email,
      password,
      username: finalUsername,
      accountStatus: 'active'
    });

    // Generate tokens
    const tokens = generateTokens(user._id);

    // Store refresh token
    user.refreshTokens.push({
      token: tokens.refreshToken,
      deviceId: req.headers['x-device-id'] || 'unknown'
    });
    user.loginCount = 1;
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    // Send welcome email (use username if name not provided)
    await sendWelcomeEmail(email, username, name || username);

    // Create welcome notification
    await Notification.createNotification(
      user._id,
      'welcome',
      'Welcome to bibbly! 🎉',
      'Complete your profile to start connecting with people you know.',
      { targetType: 'profile', actionUrl: '/profile/setup' }
    );

    logger.info(`New user registered: ${email}`);

    return ApiResponse.created(res, {
      user: sanitizeUser(user),
      tokens,
      profileComplete: false
    }, 'Account created successfully!');

  } catch (error) {
    logger.error('Signup error:', error);
    return ApiResponse.error(res, 'Error creating account');
  }
};

/**
 * @desc    Login with email/password
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user with password
    const user = await User.findByEmail(email).select('+password');
    
    if (!user) {
      return ApiResponse.unauthorized(res, 'Invalid email or password');
    }

    // Check account status
    if (user.accountStatus === 'suspended') {
      return ApiResponse.forbidden(res, 'Your account has been suspended');
    }

    if (user.accountStatus === 'deleted') {
      return ApiResponse.unauthorized(res, 'This account has been deleted');
    }

    // Check if user signed up with Google
    if (!user.password && user.googleId) {
      return ApiResponse.badRequest(res, 'This account uses Google sign-in. Please use Google to login.');
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return ApiResponse.unauthorized(res, 'Invalid email or password');
    }

    // Generate tokens
    const tokens = generateTokens(user._id);

    // Store refresh token (limit to 5 devices)
    if (user.refreshTokens.length >= 5) {
      user.refreshTokens.shift(); // Remove oldest
    }
    user.refreshTokens.push({
      token: tokens.refreshToken,
      deviceId: req.headers['x-device-id'] || 'unknown'
    });
    user.loginCount += 1;
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    // Check if profile exists
    const profile = await Profile.findOne({ user: user._id });

    logger.info(`User logged in: ${email}`);

    return ApiResponse.success(res, {
      user: sanitizeUser(user),
      tokens,
      profileComplete: profile ? profile.isComplete : false
    }, 'Login successful');

  } catch (error) {
    logger.error('Login error:', error);
    return ApiResponse.error(res, 'Error logging in');
  }
};

/**
 * @desc    Verify Google token and check if user exists
 * @route   POST /api/v1/auth/google/verify
 * @access  Public
 */
const verifyGoogleToken = async (req, res) => {
  try {
    const { idToken } = req.body;

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists with this Google ID or email
    let user = await User.findOne({ googleId });
    if (!user) {
      user = await User.findByEmail(email);
    }

    return ApiResponse.success(res, {
      exists: !!user,
      email,
      name,
      picture,
      googleId
    }, 'Token verified');

  } catch (error) {
    logger.error('Google token verify error:', error);
    return ApiResponse.error(res, 'Google token verification failed');
  }
};

/**
 * @desc    Google OAuth authentication
 * @route   POST /api/v1/auth/google
 * @access  Public
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken, username: providedUsername } = req.body;

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists with this Google ID
    let user = await User.findOne({ googleId });
    let isNewUser = false;

    if (!user) {
      // Check if email is already registered
      const existingUser = await User.findByEmail(email);
      
      if (existingUser) {
        // Link Google to existing account
        existingUser.googleId = googleId;
        existingUser.accountStatus = 'active';
        await existingUser.save();
        user = existingUser;
      } else {
        // For new users, username is required
        if (!providedUsername || providedUsername.trim().length === 0) {
          return ApiResponse.badRequest(res, 'Username is required for new accounts');
        }

        const username = providedUsername.toLowerCase().trim();

        // Validate username length
        if (username.length < 6) {
          return ApiResponse.badRequest(res, 'Username must be at least 6 characters');
        }

        // Check if username is already taken
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
          return ApiResponse.conflict(res, 'This username is already taken. Please choose another one.');
        }

        // Create new user with provided username
        user = await User.create({
          email,
          googleId,
          username,
          accountStatus: 'active'
        });

        isNewUser = true;

        // Create welcome notification
        await Notification.createNotification(
          user._id,
          'welcome',
          'Welcome to bibbly! 🎉',
          'Complete your profile to start connecting with people you know.',
          { targetType: 'profile', actionUrl: '/profile/setup' }
        );

        // Send welcome email
        await sendWelcomeEmail(email, username, name || username);

        logger.info(`New user registered via Google: ${email} with username: ${username}`);
      }
    }

    // Check account status
    if (user.accountStatus === 'suspended') {
      return ApiResponse.forbidden(res, 'Your account has been suspended');
    }

    // Generate tokens
    const tokens = generateTokens(user._id);

    // Store refresh token
    if (user.refreshTokens.length >= 5) {
      user.refreshTokens.shift();
    }
    user.refreshTokens.push({
      token: tokens.refreshToken,
      deviceId: req.headers['x-device-id'] || 'unknown'
    });
    user.loginCount += 1;
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    // Check if profile exists
    const profile = await Profile.findOne({ user: user._id });

    return ApiResponse.success(res, {
      user: sanitizeUser(user),
      tokens,
      profileComplete: profile ? profile.isComplete : false,
      isNewUser: isNewUser || !profile
    }, 'Google authentication successful');

  } catch (error) {
    logger.error('Google auth error:', error);
    return ApiResponse.error(res, 'Google authentication failed');
  }
};

/**
 * @desc    Forgot password
 * @route   POST /api/v1/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findByEmail(email);

    // Always return success (don't reveal if email exists)
    if (!user) {
      return ApiResponse.success(res, null, 'If an account exists, a password reset email has been sent');
    }

    // Check if user uses Google auth only
    if (!user.password && user.googleId) {
      return ApiResponse.success(res, null, 'If an account exists, a password reset email has been sent');
    }

    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // Send reset email
    await sendPasswordResetEmail(user.email, resetToken, user.username);

    return ApiResponse.success(res, null, 'If an account exists, a password reset email has been sent');

  } catch (error) {
    logger.error('Forgot password error:', error);
    return ApiResponse.error(res, 'Error processing request');
  }
};

/**
 * @desc    Reset password
 * @route   POST /api/v1/auth/reset-password/:token
 * @access  Public
 */
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Hash token to compare
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return ApiResponse.badRequest(res, 'Invalid or expired reset token');
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    // Clear all refresh tokens (logout from all devices)
    user.refreshTokens = [];
    await user.save();

    logger.info(`Password reset: ${user.email}`);

    return ApiResponse.success(res, null, 'Password reset successful. Please login with your new password.');

  } catch (error) {
    logger.error('Reset password error:', error);
    return ApiResponse.error(res, 'Error resetting password');
  }
};

/**
 * @desc    Refresh access token
 * @route   POST /api/v1/auth/refresh-token
 * @access  Public
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return ApiResponse.badRequest(res, 'Refresh token is required');
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      return ApiResponse.unauthorized(res, 'Invalid or expired refresh token');
    }

    // Find user and check if token exists
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return ApiResponse.unauthorized(res, 'User not found');
    }

    const tokenExists = user.refreshTokens.some(t => t.token === token);
    if (!tokenExists) {
      return ApiResponse.unauthorized(res, 'Refresh token not found');
    }

    // Generate new tokens
    const tokens = generateTokens(user._id);

    // Replace old refresh token with new one
    user.refreshTokens = user.refreshTokens.filter(t => t.token !== token);
    user.refreshTokens.push({
      token: tokens.refreshToken,
      deviceId: req.headers['x-device-id'] || 'unknown'
    });
    await user.save({ validateBeforeSave: false });

    return ApiResponse.success(res, { tokens }, 'Token refreshed');

  } catch (error) {
    logger.error('Refresh token error:', error);
    return ApiResponse.error(res, 'Error refreshing token');
  }
};

/**
 * @desc    Logout
 * @route   POST /api/v1/auth/logout
 * @access  Private
 */
const logout = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    const user = req.user;

    // Remove refresh token
    if (token) {
      user.refreshTokens = user.refreshTokens.filter(t => t.token !== token);
      await user.save({ validateBeforeSave: false });
    }

    return ApiResponse.success(res, null, 'Logged out successfully');

  } catch (error) {
    logger.error('Logout error:', error);
    return ApiResponse.error(res, 'Error logging out');
  }
};

/**
 * @desc    Logout from all devices
 * @route   POST /api/v1/auth/logout-all
 * @access  Private
 */
const logoutAll = async (req, res) => {
  try {
    const user = req.user;

    // Clear all refresh tokens
    user.refreshTokens = [];
    await user.save({ validateBeforeSave: false });

    return ApiResponse.success(res, null, 'Logged out from all devices');

  } catch (error) {
    logger.error('Logout all error:', error);
    return ApiResponse.error(res, 'Error logging out');
  }
};

/**
 * @desc    Get current user
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    // Get profile separately to ensure it's loaded
    const profile = await Profile.findOne({ user: req.userId });
    
    return ApiResponse.success(res, {
      user: sanitizeUser(user),
      profile: profile || null
    });

  } catch (error) {
    logger.error('Get me error:', error);
    return ApiResponse.error(res, 'Error fetching user data');
  }
};

/**
 * @desc    Update OneSignal player ID
 * @route   POST /api/v1/auth/device-token
 * @access  Private
 */
const updateDeviceToken = async (req, res) => {
  try {
    const { playerId, platform } = req.body;
    const user = req.user;

    if (!playerId) {
      logger.warn(`⚠️  updateDeviceToken called without playerId for user ${user._id}`);
      return ApiResponse.error(res, 'Player ID is required');
    }

    logger.info(`📱 Updating device token for user ${user._id}:`, {
      playerId: playerId.substring(0, 8) + '...',
      platform: platform || 'unknown',
      previousPlayerId: user.oneSignalPlayerId ? user.oneSignalPlayerId.substring(0, 8) + '...' : 'none'
    });

    user.oneSignalPlayerId = playerId;
    
    // Add device token if not exists
    const exists = user.deviceTokens.some(
      d => d.token === playerId && d.platform === platform
    );
    
    if (!exists) {
      user.deviceTokens.push({ token: playerId, platform });
      logger.debug(`✅ Added new device token for platform: ${platform}`);
    } else {
      logger.debug(`ℹ️  Device token already exists for platform: ${platform}`);
    }

    await user.save({ validateBeforeSave: false });

    logger.info(`✅ Device token updated successfully for user ${user._id}`);
    return ApiResponse.success(res, null, 'Device token updated');

  } catch (error) {
    logger.error('Update device token error:', error);
    return ApiResponse.error(res, 'Error updating device token');
  }
};

module.exports = {
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
};

