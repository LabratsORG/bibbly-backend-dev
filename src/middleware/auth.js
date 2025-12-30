/**
 * Authentication Middleware
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');

/**
 * Protect routes - require authentication
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return ApiResponse.unauthorized(res, 'Not authorized to access this route');
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from token
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return ApiResponse.unauthorized(res, 'User not found');
      }

      // Check if account is active
      if (user.accountStatus === 'suspended') {
        return ApiResponse.forbidden(res, 'Your account has been suspended');
      }

      if (user.accountStatus === 'deleted') {
        return ApiResponse.unauthorized(res, 'This account has been deleted');
      }

      // Attach user to request
      req.user = user;
      req.userId = user._id;

      // Update last active
      user.lastActiveAt = new Date();
      await user.save({ validateBeforeSave: false });

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return ApiResponse.unauthorized(res, 'Token expired. Please login again');
      }
      if (error.name === 'JsonWebTokenError') {
        return ApiResponse.unauthorized(res, 'Invalid token');
      }
      throw error;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return ApiResponse.error(res, 'Authentication error', 500);
  }
};

/**
 * Optional authentication - attach user if token present
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (user && user.accountStatus === 'active') {
          req.user = user;
          req.userId = user._id;
        }
      } catch (error) {
        // Token invalid but continue without user
        req.user = null;
      }
    }

    next();
  } catch (error) {
    next();
  }
};

/**
 * Require verified email (deprecated - email verification removed)
 * Kept for backwards compatibility but always allows access
 */
const requireVerified = (req, res, next) => {
  // Email verification removed - all users are active
  next();
};

/**
 * Require complete profile
 */
const requireCompleteProfile = async (req, res, next) => {
  try {
    const Profile = require('../models/Profile');
    const profile = await Profile.findOne({ user: req.userId });
    
    if (!profile || !profile.isComplete) {
      return ApiResponse.forbidden(res, 'Please complete your profile first');
    }
    
    req.profile = profile;
    next();
  } catch (error) {
    return ApiResponse.error(res, 'Error checking profile status');
  }
};

/**
 * Require premium subscription
 */
const requirePremium = (req, res, next) => {
  if (!req.user.checkPremiumStatus()) {
    return ApiResponse.forbidden(res, 'This feature requires a premium subscription');
  }
  next();
};

/**
 * Require admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return ApiResponse.forbidden(res, 'Admin access required');
  }
  next();
};

/**
 * Rate limiter for specific actions
 */
const createActionLimiter = (action, maxAttempts, windowMs) => {
  const attempts = new Map();

  return (req, res, next) => {
    const key = `${action}:${req.userId || req.ip}`;
    const now = Date.now();
    
    if (!attempts.has(key)) {
      attempts.set(key, { count: 1, firstAttempt: now });
      return next();
    }

    const userAttempts = attempts.get(key);
    
    // Reset if window has passed
    if (now - userAttempts.firstAttempt > windowMs) {
      attempts.set(key, { count: 1, firstAttempt: now });
      return next();
    }

    // Check if exceeded
    if (userAttempts.count >= maxAttempts) {
      const retryAfter = Math.ceil((windowMs - (now - userAttempts.firstAttempt)) / 1000);
      return ApiResponse.tooManyRequests(res, `Too many ${action} attempts. Try again in ${retryAfter} seconds`);
    }

    userAttempts.count++;
    next();
  };
};

module.exports = {
  protect,
  optionalAuth,
  requireVerified,
  requireCompleteProfile,
  requirePremium,
  requireAdmin,
  createActionLimiter
};

