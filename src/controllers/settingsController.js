/**
 * Settings Controller
 * Handles user settings and account management
 */

const User = require('../models/User');
const Profile = require('../models/Profile');
const Conversation = require('../models/Conversation');
const MessageRequest = require('../models/MessageRequest');
const Block = require('../models/Block');
const ApiResponse = require('../utils/apiResponse');
const { deleteImage } = require('../config/cloudinary');
const logger = require('../utils/logger');

/**
 * @desc    Get all settings
 * @route   GET /api/v1/settings
 * @access  Private
 */
const getSettings = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const profile = await Profile.findOne({ user: req.userId });

    const settings = {
      account: {
        email: user.email,
        username: user.username,
        createdAt: user.createdAt
      },
      privacy: {
        visibility: profile?.visibility || 'discoverable',
        showInFeed: profile?.showInFeed ?? true,
        allowAnonymousMessages: profile?.allowAnonymousMessages ?? true,
        photoBlurForAnonymous: profile?.photoBlurForAnonymous ?? true,
        messagePreferences: profile?.messagePreferences || {
          allowFrom: 'anyone',
          sameCollege: false,
          sameWorkplace: false,
          sameLocation: false
        }
      },
      notifications: user.notificationPreferences || {
        messageRequests: true,
        messages: true,
        requestAccepted: true,
        identityReveals: true,
        profileViews: true,
        marketing: false,
        emailNotifications: true,
        pushNotifications: true
      },
    };

    return ApiResponse.success(res, { settings });

  } catch (error) {
    logger.error('Get settings error:', error);
    return ApiResponse.error(res, 'Error fetching settings');
  }
};

/**
 * @desc    Update privacy settings
 * @route   PUT /api/v1/settings/privacy
 * @access  Private
 */
const updatePrivacySettings = async (req, res) => {
  try {
    const {
      visibility,
      showInFeed,
      allowAnonymousMessages,
      photoBlurForAnonymous,
      messagePreferences
    } = req.body;

    const profile = await Profile.findOne({ user: req.userId });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    if (visibility !== undefined) profile.visibility = visibility;
    if (showInFeed !== undefined) profile.showInFeed = showInFeed;
    if (allowAnonymousMessages !== undefined) profile.allowAnonymousMessages = allowAnonymousMessages;
    if (photoBlurForAnonymous !== undefined) profile.photoBlurForAnonymous = photoBlurForAnonymous;
    
    // Update message preferences
    if (messagePreferences !== undefined) {
      if (!profile.messagePreferences) {
        profile.messagePreferences = {};
      }
      if (messagePreferences.allowFrom !== undefined) {
        profile.messagePreferences.allowFrom = messagePreferences.allowFrom;
      }
      if (messagePreferences.sameCollege !== undefined) {
        profile.messagePreferences.sameCollege = messagePreferences.sameCollege;
      }
      if (messagePreferences.sameWorkplace !== undefined) {
        profile.messagePreferences.sameWorkplace = messagePreferences.sameWorkplace;
      }
      if (messagePreferences.sameLocation !== undefined) {
        profile.messagePreferences.sameLocation = messagePreferences.sameLocation;
      }
    }

    await profile.save();

    return ApiResponse.success(res, {
      privacy: {
        visibility: profile.visibility,
        showInFeed: profile.showInFeed,
        allowAnonymousMessages: profile.allowAnonymousMessages,
        photoBlurForAnonymous: profile.photoBlurForAnonymous,
        messagePreferences: profile.messagePreferences || {
          allowFrom: 'anyone',
          sameCollege: false,
          sameWorkplace: false,
          sameLocation: false
        }
      }
    }, 'Privacy settings updated');

  } catch (error) {
    logger.error('Update privacy settings error:', error);
    return ApiResponse.error(res, 'Error updating privacy settings');
  }
};

/**
 * @desc    Update notification settings
 * @route   PUT /api/v1/settings/notifications
 * @access  Private
 */
const updateNotificationSettings = async (req, res) => {
  try {
    const { notifications } = req.body;

    await User.findByIdAndUpdate(req.userId, {
      notificationPreferences: notifications
    });

    return ApiResponse.success(res, { notifications }, 'Notification settings updated');

  } catch (error) {
    logger.error('Update notification settings error:', error);
    return ApiResponse.error(res, 'Error updating notification settings');
  }
};

/**
 * @desc    Change password
 * @route   PUT /api/v1/settings/password
 * @access  Private
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.userId).select('+password');

    // Check if user has password (might be Google-only)
    if (!user.password) {
      return ApiResponse.badRequest(res, 'Your account uses Google sign-in. You cannot set a password.');
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return ApiResponse.unauthorized(res, 'Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    // Clear all refresh tokens (logout from all devices)
    user.refreshTokens = [];
    await user.save();

    logger.info(`Password changed for user ${req.userId}`);

    return ApiResponse.success(res, null, 'Password changed successfully. Please login again.');

  } catch (error) {
    logger.error('Change password error:', error);
    return ApiResponse.error(res, 'Error changing password');
  }
};

/**
 * @desc    Update email
 * @route   PUT /api/v1/settings/email
 * @access  Private
 */
const updateEmail = async (req, res) => {
  try {
    const { newEmail, password } = req.body;

    const user = await User.findById(req.userId).select('+password');

    // Verify password if set
    if (user.password) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return ApiResponse.unauthorized(res, 'Password is incorrect');
      }
    }

    // Check if email is taken
    const existing = await User.findOne({ email: newEmail.toLowerCase() });
    if (existing) {
      return ApiResponse.conflict(res, 'This email is already in use');
    }

    // Update email
    user.email = newEmail.toLowerCase();
    await user.save();

    logger.info(`Email updated for user ${req.userId}`);

    return ApiResponse.success(res, null, 'Email updated successfully.');

  } catch (error) {
    logger.error('Update email error:', error);
    return ApiResponse.error(res, 'Error updating email');
  }
};

/**
 * @desc    Change username
 * @route   PUT /api/v1/settings/username
 * @access  Private
 */
const changeUsername = async (req, res) => {
  try {
    const { username } = req.body;

    // Validate username
    if (!/^[a-z0-9_]+$/.test(username)) {
      return ApiResponse.badRequest(res, 'Username can only contain lowercase letters, numbers, and underscores');
    }

    if (username.length < 3 || username.length > 30) {
      return ApiResponse.badRequest(res, 'Username must be between 3 and 30 characters');
    }

    // Check if taken
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing && existing._id.toString() !== req.userId.toString()) {
      return ApiResponse.conflict(res, 'This username is already taken');
    }

    await User.findByIdAndUpdate(req.userId, {
      username: username.toLowerCase()
    });

    logger.info(`Username changed for user ${req.userId}`);

    return ApiResponse.success(res, { username }, 'Username updated');

  } catch (error) {
    logger.error('Change username error:', error);
    return ApiResponse.error(res, 'Error changing username');
  }
};

/**
 * @desc    Export user data (GDPR)
 * @route   GET /api/v1/settings/export
 * @access  Private
 */
const exportData = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password -refreshTokens');
    const profile = await Profile.findOne({ user: req.userId });
    const conversations = await Conversation.find({ 'participants.user': req.userId });
    const requests = await MessageRequest.find({
      $or: [{ sender: req.userId }, { recipient: req.userId }]
    });
    const blocks = await Block.find({ blocker: req.userId });

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      },
      profile: profile ? {
        name: profile.name,
        bio: profile.bio,
        interests: profile.interests,
        photos: profile.photos.map(p => p.url),
        location: profile.location,
        college: profile.college,
        workplace: profile.workplace
      } : null,
      conversations: conversations.length,
      messageRequests: requests.length,
      blockedUsers: blocks.length
    };

    return ApiResponse.success(res, { data: exportData });

  } catch (error) {
    logger.error('Export data error:', error);
    return ApiResponse.error(res, 'Error exporting data');
  }
};

/**
 * @desc    Delete account
 * @route   DELETE /api/v1/settings/account
 * @access  Private
 */
const deleteAccount = async (req, res) => {
  try {
    const { password, confirmation } = req.body;

    if (confirmation !== 'DELETE') {
      return ApiResponse.badRequest(res, 'Please type DELETE to confirm');
    }

    const user = await User.findById(req.userId).select('+password');

    // Verify password if set
    if (user.password) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return ApiResponse.unauthorized(res, 'Password is incorrect');
      }
    }

    // Delete profile photos from Cloudinary
    const profile = await Profile.findOne({ user: req.userId });
    if (profile?.photos) {
      for (const photo of profile.photos) {
        if (photo.publicId) {
          await deleteImage(photo.publicId);
        }
      }
    }

    // Soft delete - mark as deleted
    user.accountStatus = 'deleted';
    user.deletedAt = new Date();
    user.email = `deleted_${user._id}@deleted.bibbly`;
    user.refreshTokens = [];
    await user.save();

    if (profile) {
      profile.isBanned = true;
      profile.visibility = 'invisible';
      await profile.save();
    }

    logger.info(`Account deleted: ${req.userId}`);

    return ApiResponse.success(res, null, 'Your account has been deleted');

  } catch (error) {
    logger.error('Delete account error:', error);
    return ApiResponse.error(res, 'Error deleting account');
  }
};

module.exports = {
  getSettings,
  updatePrivacySettings,
  updateNotificationSettings,
  changePassword,
  updateEmail,
  changeUsername,
  exportData,
  deleteAccount
};

