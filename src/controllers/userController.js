/**
 * User Controller
 * Handles user-related operations
 */

const User = require('../models/User');
const Profile = require('../models/Profile');
const Block = require('../models/Block');
const ApiResponse = require('../utils/apiResponse');
const { getBlurredImageUrl } = require('../config/cloudinary');
const logger = require('../utils/logger');

/**
 * @desc    Get user by ID
 * @route   GET /api/v1/users/:id
 * @access  Private
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if blocked
    const isBlocked = await Block.hasBlockBetween(req.userId, id);
    if (isBlocked) {
      return ApiResponse.notFound(res, 'User not found');
    }

    const user = await User.findOne({
      _id: id,
      accountStatus: 'active'
    }).select('username createdAt');

    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    const profile = await Profile.findOne({
      user: id,
      isBanned: false
    }).select('name photos bio interests age gender');

    return ApiResponse.success(res, {
      user: {
        id: user._id,
        username: user.username
      },
      profile: profile ? {
        ...profile.toObject(),
        photos: profile.photos.map(p => ({
          ...p,
          blurredUrl: getBlurredImageUrl(p.url)
        }))
      } : null
    });

  } catch (error) {
    logger.error('Get user by ID error:', error);
    return ApiResponse.error(res, 'Error fetching user');
  }
};

/**
 * @desc    Get user by username
 * @route   GET /api/v1/users/username/:username
 * @access  Public
 */
const getUserByUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({
      username: username.toLowerCase(),
      accountStatus: 'active'
    }).select('username');

    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Check if blocked (if authenticated)
    if (req.userId) {
      const isBlocked = await Block.hasBlockBetween(req.userId, user._id);
      if (isBlocked) {
        return ApiResponse.notFound(res, 'User not found');
      }
    }

    const profile = await Profile.findOne({
      user: user._id,
      isBanned: false
    });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    // Check visibility
    if (profile.visibility === 'invisible' && (!req.userId || req.userId.toString() !== user._id.toString())) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    return ApiResponse.success(res, {
      username: user.username,
      profile: profile.getPublicProfile(true) // Always blur for public view
    });

  } catch (error) {
    logger.error('Get user by username error:', error);
    return ApiResponse.error(res, 'Error fetching user');
  }
};

/**
 * @desc    Check username availability
 * @route   GET /api/v1/users/check-username/:username
 * @access  Public
 */
const checkUsernameAvailability = async (req, res) => {
  try {
    const { username } = req.params;

    // Validate format
    if (!/^[a-z0-9_]+$/.test(username)) {
      return ApiResponse.success(res, {
        available: false,
        reason: 'Username can only contain lowercase letters, numbers, and underscores'
      });
    }

    if (username.length < 3 || username.length > 30) {
      return ApiResponse.success(res, {
        available: false,
        reason: 'Username must be between 3 and 30 characters'
      });
    }

    // Check reserved usernames
    const reserved = ['admin', 'support', 'help', 'bibbly', 'official', 'team'];
    if (reserved.includes(username.toLowerCase())) {
      return ApiResponse.success(res, {
        available: false,
        reason: 'This username is reserved'
      });
    }

    const existing = await User.findOne({ username: username.toLowerCase() });

    return ApiResponse.success(res, {
      available: !existing,
      reason: existing ? 'Username is already taken' : null
    });

  } catch (error) {
    logger.error('Check username error:', error);
    return ApiResponse.error(res, 'Error checking username');
  }
};

/**
 * @desc    Get online status
 * @route   GET /api/v1/users/:id/status
 * @access  Private
 */
const getOnlineStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('lastActiveAt');

    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Consider online if active in last 5 minutes
    const isOnline = user.lastActiveAt && 
      (Date.now() - user.lastActiveAt.getTime()) < 5 * 60 * 1000;

    return ApiResponse.success(res, {
      isOnline,
      lastActive: user.lastActiveAt
    });

  } catch (error) {
    logger.error('Get online status error:', error);
    return ApiResponse.error(res, 'Error fetching status');
  }
};

module.exports = {
  getUserById,
  getUserByUsername,
  checkUsernameAvailability,
  getOnlineStatus
};

