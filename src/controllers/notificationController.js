/**
 * Notification Controller
 * Handles in-app notifications
 */

const Notification = require('../models/Notification');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * @desc    Get notifications
 * @route   GET /api/v1/notifications
 * @access  Private
 */
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const query = { user: req.userId };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = await Notification.getForUser(
      req.userId,
      parseInt(page),
      parseInt(limit)
    );

    // Convert to plain objects and format
    const formattedNotifications = notifications.map(notif => {
      const notifObj = notif.toObject();
      
      // Ensure IDs are strings
      if (notifObj._id) notifObj._id = notifObj._id.toString();
      if (notifObj.user) {
        notifObj.user = notifObj.user.toString();
      }
      if (notifObj.relatedUser && typeof notifObj.relatedUser === 'object') {
        if (notifObj.relatedUser._id) {
          notifObj.relatedUser._id = notifObj.relatedUser._id.toString();
        }
      }
      if (notifObj.data?.targetId) {
        notifObj.data.targetId = notifObj.data.targetId.toString();
      }
      
      return notifObj;
    });

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.getUnreadCount(req.userId);

    return ApiResponse.paginated(res, formattedNotifications, {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      unreadCount
    });

  } catch (error) {
    logger.error('Get notifications error:', error);
    return ApiResponse.error(res, 'Error fetching notifications');
  }
};

/**
 * @desc    Get unread count
 * @route   GET /api/v1/notifications/unread-count
 * @access  Private
 */
const getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.getUnreadCount(req.userId);

    return ApiResponse.success(res, { unreadCount });

  } catch (error) {
    logger.error('Get unread count error:', error);
    return ApiResponse.error(res, 'Error fetching unread count');
  }
};

/**
 * @desc    Mark notification as read
 * @route   POST /api/v1/notifications/:notificationId/read
 * @access  Private
 */
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.markAsRead(notificationId, req.userId);

    if (!notification) {
      return ApiResponse.notFound(res, 'Notification not found');
    }

    return ApiResponse.success(res, null, 'Notification marked as read');

  } catch (error) {
    logger.error('Mark as read error:', error);
    return ApiResponse.error(res, 'Error marking notification as read');
  }
};

/**
 * @desc    Mark all notifications as read
 * @route   POST /api/v1/notifications/read-all
 * @access  Private
 */
const markAllAsRead = async (req, res) => {
  try {
    await Notification.markAllAsRead(req.userId);

    return ApiResponse.success(res, null, 'All notifications marked as read');

  } catch (error) {
    logger.error('Mark all as read error:', error);
    return ApiResponse.error(res, 'Error marking notifications as read');
  }
};

/**
 * @desc    Delete notification
 * @route   DELETE /api/v1/notifications/:notificationId
 * @access  Private
 */
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      user: req.userId
    });

    if (!notification) {
      return ApiResponse.notFound(res, 'Notification not found');
    }

    return ApiResponse.success(res, null, 'Notification deleted');

  } catch (error) {
    logger.error('Delete notification error:', error);
    return ApiResponse.error(res, 'Error deleting notification');
  }
};

/**
 * @desc    Get notification preferences
 * @route   GET /api/v1/notifications/preferences
 * @access  Private
 */
const getPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('notificationPreferences');

    // Default preferences if not set
    const preferences = user.notificationPreferences || {
      messageRequests: true,
      messages: true,
      requestAccepted: true,
      identityReveals: true,
      profileViews: true,
      marketing: false,
      emailNotifications: true,
      pushNotifications: true
    };

    return ApiResponse.success(res, { preferences });

  } catch (error) {
    logger.error('Get preferences error:', error);
    return ApiResponse.error(res, 'Error fetching preferences');
  }
};

/**
 * @desc    Update notification preferences
 * @route   PUT /api/v1/notifications/preferences
 * @access  Private
 */
const updatePreferences = async (req, res) => {
  try {
    const { preferences } = req.body;

    await User.findByIdAndUpdate(req.userId, {
      notificationPreferences: preferences
    });

    return ApiResponse.success(res, { preferences }, 'Preferences updated');

  } catch (error) {
    logger.error('Update preferences error:', error);
    return ApiResponse.error(res, 'Error updating preferences');
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences
};

