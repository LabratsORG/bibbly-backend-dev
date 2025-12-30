/**
 * Admin Controller
 * Handles all admin operations - app configuration, users, moderation
 */

const AppConfig = require('../models/AppConfig');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Report = require('../models/Report');
const Block = require('../models/Block');
const MessageRequest = require('../models/MessageRequest');
const Conversation = require('../models/Conversation');
const Feedback = require('../models/Feedback');
const ActivityLog = require('../models/ActivityLog');
const Message = require('../models/Message');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

// ==================== APP CONFIGURATION ====================

/**
 * @desc    Get full app configuration
 * @route   GET /api/v1/admin/config
 * @access  Admin
 */
const getAppConfig = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    
    return ApiResponse.success(res, { config });
  } catch (error) {
    logger.error('Get app config error:', error);
    return ApiResponse.error(res, 'Error fetching configuration');
  }
};

/**
 * @desc    Update app configuration
 * @route   PUT /api/v1/admin/config
 * @access  Admin
 */
const updateAppConfig = async (req, res) => {
  try {
    const updates = req.body;
    const config = await AppConfig.updateConfig(updates, req.userId);
    
    // Log activity
    await ActivityLog.log({
      actor: req.userId,
      actorType: 'admin',
      action: 'config_updated',
      entityType: 'config',
      details: { updates: Object.keys(updates) },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    logger.info(`App config updated by admin ${req.userId}`);
    
    return ApiResponse.success(res, { config }, 'Configuration updated successfully');
  } catch (error) {
    logger.error('Update app config error:', error);
    return ApiResponse.error(res, 'Error updating configuration');
  }
};

// ==================== FEATURE FLAGS ====================

/**
 * @desc    Get all feature flags
 * @route   GET /api/v1/admin/features
 * @access  Admin
 */
const getFeatureFlags = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    
    return ApiResponse.success(res, {
      featureFlags: config.featureFlags
    });
  } catch (error) {
    logger.error('Get feature flags error:', error);
    return ApiResponse.error(res, 'Error fetching feature flags');
  }
};

/**
 * @desc    Update feature flags
 * @route   PUT /api/v1/admin/features
 * @access  Admin
 */
const updateFeatureFlags = async (req, res) => {
  try {
    const { featureFlags } = req.body;
    
    const config = await AppConfig.updateConfig({ featureFlags }, req.userId);
    
    logger.info(`Feature flags updated by admin ${req.userId}`);
    
    return ApiResponse.success(res, {
      featureFlags: config.featureFlags
    }, 'Feature flags updated');
  } catch (error) {
    logger.error('Update feature flags error:', error);
    return ApiResponse.error(res, 'Error updating feature flags');
  }
};

// ==================== USER MANAGEMENT ====================

/**
 * @desc    Get all users with filters
 * @route   GET /api/v1/admin/users
 * @access  Admin
 */
const getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      isPremium,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = {};
    
    if (status) query.accountStatus = status;
    if (search) {
      query.$or = [
        { email: new RegExp(search, 'i') },
        { username: new RegExp(search, 'i') }
      ];
    }
    
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    const users = await User.find(query)
      .select('-password -refreshTokens')
      .populate({
        path: 'profile',
        select: 'name photos isComplete'
      })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    return ApiResponse.paginated(res, users, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });
  } catch (error) {
    logger.error('Get users error:', error);
    return ApiResponse.error(res, 'Error fetching users');
  }
};

/**
 * @desc    Get user details
 * @route   GET /api/v1/admin/users/:userId
 * @access  Admin
 */
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-password -refreshTokens')
      .populate('profile');
    
    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }
    
    // Get additional stats
    const [requestsSent, requestsReceived, conversations, reports] = await Promise.all([
      MessageRequest.countDocuments({ sender: userId }),
      MessageRequest.countDocuments({ recipient: userId }),
      Conversation.countDocuments({ 'participants.user': userId }),
      Report.countDocuments({ reportedUser: userId })
    ]);
    
    return ApiResponse.success(res, {
      user,
      stats: {
        requestsSent,
        requestsReceived,
        conversations,
        reportsAgainst: reports
      }
    });
  } catch (error) {
    logger.error('Get user details error:', error);
    return ApiResponse.error(res, 'Error fetching user details');
  }
};

/**
 * @desc    Update user status
 * @route   PUT /api/v1/admin/users/:userId/status
 * @access  Admin
 */
const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, reason } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }
    
    const oldStatus = user.accountStatus;
    user.accountStatus = status;
    await user.save();
    
    // If suspending, also update profile
    if (status === 'suspended') {
      await Profile.findOneAndUpdate(
        { user: userId },
        { isBanned: true, banReason: reason }
      );
    } else if (status === 'active') {
      await Profile.findOneAndUpdate(
        { user: userId },
        { isBanned: false, banReason: null }
      );
    }
    
    // Log activity
    const actionMap = {
      'suspended': 'user_suspended',
      'deleted': 'user_deleted',
      'active': 'user_restored'
    };
    
    await ActivityLog.log({
      actor: req.userId,
      actorType: 'admin',
      action: actionMap[status] || 'user_updated',
      entityType: 'user',
      entityId: userId,
      details: { oldStatus, newStatus: status, reason },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    logger.info(`User ${userId} status changed to ${status} by admin ${req.userId}`);
    
    return ApiResponse.success(res, {
      userId,
      newStatus: status
    }, `User status updated to ${status}`);
  } catch (error) {
    logger.error('Update user status error:', error);
    return ApiResponse.error(res, 'Error updating user status');
  }
};


// ==================== DASHBOARD STATS ====================

/**
 * @desc    Get admin dashboard stats
 * @route   GET /api/v1/admin/dashboard
 * @access  Admin
 */
const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    
    const last30Days = new Date(today);
    last30Days.setDate(last30Days.getDate() - 30);
    
    const [
      totalUsers,
      newUsersToday,
      newUsersLast7Days,
      activeUsers,
      totalConversations,
      totalRequests,
      pendingReports
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: last7Days } }),
      User.countDocuments({ lastActiveAt: { $gte: last7Days } }),
      Conversation.countDocuments(),
      MessageRequest.countDocuments(),
      Report.countDocuments({ status: 'pending' })
    ]);
    
    // Get config
    const config = await AppConfig.getConfig();
    
    return ApiResponse.success(res, {
      overview: {
        totalUsers,
        newUsersToday,
        newUsersLast7Days,
        activeUsers,
        totalConversations,
        totalRequests,
        pendingReports
      },
      appStatus: {
        maintenanceMode: config.maintenanceMode,
        appVersion: config.appVersion
      }
    });
  } catch (error) {
    logger.error('Get dashboard stats error:', error);
    return ApiResponse.error(res, 'Error fetching dashboard stats');
  }
};

/**
 * @desc    Get limits configuration
 * @route   GET /api/v1/admin/limits
 * @access  Admin
 */
const getLimits = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    
    return ApiResponse.success(res, {
      limits: config.limits,
      moderation: config.moderation
    });
  } catch (error) {
    logger.error('Get limits error:', error);
    return ApiResponse.error(res, 'Error fetching limits');
  }
};

/**
 * @desc    Update limits configuration
 * @route   PUT /api/v1/admin/limits
 * @access  Admin
 */
const updateLimits = async (req, res) => {
  try {
    const { limits, moderation } = req.body;
    
    const updates = {};
    if (limits) updates.limits = limits;
    if (moderation) updates.moderation = moderation;
    
    const config = await AppConfig.updateConfig(updates, req.userId);
    
    logger.info(`Limits updated by admin ${req.userId}`);
    
    return ApiResponse.success(res, {
      limits: config.limits,
      moderation: config.moderation
    }, 'Limits updated successfully');
  } catch (error) {
    logger.error('Update limits error:', error);
    return ApiResponse.error(res, 'Error updating limits');
  }
};

/**
 * @desc    Get unrevealed chat payment settings
 * @route   GET /api/v1/admin/unrevealed-chat-payment
 * @access  Admin
 */
const getUnrevealedChatPaymentSettings = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    
    return ApiResponse.success(res, {
      unrevealedChatPayment: config.microPayments?.unrevealedChatPayment || {
        isEnabled: true,
        freeMessageLimit: 100,
        pricePerMessageInPaisa: 200,
        priceDisplay: '₹2'
      }
    });
  } catch (error) {
    logger.error('Get unrevealed chat payment settings error:', error);
    return ApiResponse.error(res, 'Error fetching settings');
  }
};

/**
 * @desc    Update unrevealed chat payment settings
 * @route   PUT /api/v1/admin/unrevealed-chat-payment
 * @access  Admin
 */
const updateUnrevealedChatPaymentSettings = async (req, res) => {
  try {
    const { isEnabled, freeMessageLimit, pricePerMessageInPaisa, priceDisplay } = req.body;
    
    logger.info(`Updating unrevealed chat payment - received: isEnabled=${isEnabled}, limit=${freeMessageLimit}, price=${pricePerMessageInPaisa}`);
    
    const config = await AppConfig.getConfig();
    
    // Convert to plain object for proper spreading
    const currentMicroPayments = config.microPayments?.toObject ? config.microPayments.toObject() : (config.microPayments || {});
    const currentSettings = currentMicroPayments.unrevealedChatPayment || {
      isEnabled: true,
      freeMessageLimit: 100,
      pricePerMessageInPaisa: 200,
      priceDisplay: '₹2'
    };
    
    // Build updated settings
    const updatedSettings = {
      isEnabled: isEnabled !== undefined ? isEnabled : currentSettings.isEnabled,
      freeMessageLimit: freeMessageLimit !== undefined ? parseInt(freeMessageLimit) : currentSettings.freeMessageLimit,
      pricePerMessageInPaisa: pricePerMessageInPaisa !== undefined ? parseInt(pricePerMessageInPaisa) : currentSettings.pricePerMessageInPaisa,
      priceDisplay: priceDisplay || `₹${((pricePerMessageInPaisa !== undefined ? pricePerMessageInPaisa : currentSettings.pricePerMessageInPaisa) / 100).toFixed(0)}`
    };
    
    logger.info(`Updated settings will be: ${JSON.stringify(updatedSettings)}`);
    
    // Update microPayments with new unrevealedChatPayment settings
    const updatedMicroPayments = {
      ...currentMicroPayments,
      unrevealedChatPayment: updatedSettings
    };
    
    const updatedConfig = await AppConfig.updateConfig(
      { microPayments: updatedMicroPayments }, 
      req.userId
    );
    
    // Log activity (don't await to prevent blocking)
    ActivityLog.log({
      actor: req.userId,
      actorType: 'admin',
      action: 'unrevealed_chat_payment_updated',
      entityType: 'config',
      details: { 
        isEnabled: updatedSettings.isEnabled,
        freeMessageLimit: updatedSettings.freeMessageLimit,
        pricePerMessageInPaisa: updatedSettings.pricePerMessageInPaisa
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    }).catch(err => logger.warn('Activity log failed:', err.message));
    
    logger.info(`Unrevealed chat payment settings updated by admin ${req.userId}: ${JSON.stringify(updatedSettings)}`);
    
    return ApiResponse.success(res, {
      unrevealedChatPayment: updatedConfig.microPayments?.unrevealedChatPayment
    }, 'Settings updated successfully');
  } catch (error) {
    logger.error('Update unrevealed chat payment settings error:', error);
    return ApiResponse.error(res, 'Error updating settings');
  }
};

// ==================== REPORTS & MODERATION ====================

/**
 * @desc    Get all reports with filters
 * @route   GET /api/v1/admin/reports
 * @access  Admin
 */
const getReports = async (req, res) => {
  try {
    const { status, priority, reason, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (reason) query.reason = reason;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const reports = await Report.find(query)
      .populate('reporter', 'username email')
      .populate('reportedUser', 'username email accountStatus')
      .populate('reviewedBy', 'username email')
      .sort({ priority: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Report.countDocuments(query);
    
    return ApiResponse.paginated(res, reports, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });
  } catch (error) {
    logger.error('Get reports error:', error);
    return ApiResponse.error(res, 'Error fetching reports');
  }
};

/**
 * @desc    Get report details
 * @route   GET /api/v1/admin/reports/:reportId
 * @access  Admin
 */
const getReportDetails = async (req, res) => {
  try {
    const { reportId } = req.params;
    
    const report = await Report.findById(reportId)
      .populate('reporter', 'username email')
      .populate('reportedUser', 'username email accountStatus')
      .populate('reviewedBy', 'username email');
    
    if (!report) {
      return ApiResponse.notFound(res, 'Report not found');
    }
    
    return ApiResponse.success(res, { report });
  } catch (error) {
    logger.error('Get report details error:', error);
    return ApiResponse.error(res, 'Error fetching report details');
  }
};

/**
 * @desc    Resolve report
 * @route   POST /api/v1/admin/reports/:reportId/resolve
 * @access  Admin
 */
const resolveReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action, notes } = req.body;
    
    const report = await Report.findById(reportId);
    if (!report) {
      return ApiResponse.notFound(res, 'Report not found');
    }
    
    // Apply action to user if needed
    if (action === 'temporary_ban' || action === 'permanent_ban') {
      const reportedUser = await User.findById(report.reportedUser);
      if (reportedUser) {
        if (action === 'temporary_ban') {
          reportedUser.accountStatus = 'suspended';
        } else if (action === 'permanent_ban') {
          reportedUser.accountStatus = 'deleted';
          const profile = await Profile.findOne({ user: report.reportedUser });
          if (profile) {
            profile.isBanned = true;
            profile.bannedAt = new Date();
            await profile.save();
          }
        }
        await reportedUser.save();
      }
    }
    
    await report.resolve(req.userId, action, notes);
    
    // Log activity
    await ActivityLog.log({
      actor: req.userId,
      actorType: 'admin',
      action: 'report_resolved',
      entityType: 'report',
      entityId: reportId,
      details: { action, notes },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    return ApiResponse.success(res, { report }, 'Report resolved successfully');
  } catch (error) {
    logger.error('Resolve report error:', error);
    return ApiResponse.error(res, 'Error resolving report');
  }
};

// ==================== FEEDBACK MANAGEMENT ====================

/**
 * @desc    Get all feedback with filters
 * @route   GET /api/v1/admin/feedback
 * @access  Admin
 */
const getFeedback = async (req, res) => {
  try {
    const { status, type, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const feedback = await Feedback.find(query)
      .populate('user', 'username email')
      .populate('assignedTo', 'username email')
      .populate('resolvedBy', 'username email')
      .sort({ priority: -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    const total = await Feedback.countDocuments(query);
    
    return ApiResponse.paginated(res, feedback, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });
  } catch (error) {
    logger.error('Get feedback error:', error);
    return ApiResponse.error(res, 'Error fetching feedback');
  }
};

/**
 * @desc    Get feedback details
 * @route   GET /api/v1/admin/feedback/:feedbackId
 * @access  Admin
 */
const getFeedbackDetails = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    
    const feedback = await Feedback.findById(feedbackId)
      .populate('user', 'username email')
      .populate('assignedTo', 'username email')
      .populate('resolvedBy', 'username email')
      .populate('adminNotes.addedBy', 'username email');
    
    if (!feedback) {
      return ApiResponse.notFound(res, 'Feedback not found');
    }
    
    return ApiResponse.success(res, { feedback });
  } catch (error) {
    logger.error('Get feedback details error:', error);
    return ApiResponse.error(res, 'Error fetching feedback details');
  }
};

/**
 * @desc    Update feedback status
 * @route   PUT /api/v1/admin/feedback/:feedbackId
 * @access  Admin
 */
const updateFeedback = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const { status, priority, assignedTo, adminNote, resolution } = req.body;
    
    const feedback = await Feedback.findById(feedbackId);
    if (!feedback) {
      return ApiResponse.notFound(res, 'Feedback not found');
    }
    
    if (status) feedback.status = status;
    if (priority) feedback.priority = priority;
    if (assignedTo) feedback.assignedTo = assignedTo;
    if (resolution) feedback.resolution = resolution;
    
    if (adminNote) {
      feedback.adminNotes.push({
        note: adminNote,
        addedBy: req.userId
      });
    }
    
    if (status === 'resolved') {
      feedback.resolvedAt = new Date();
      feedback.resolvedBy = req.userId;
    }
    
    await feedback.save();
    
    // Log activity
    await ActivityLog.log({
      actor: req.userId,
      actorType: 'admin',
      action: 'feedback_updated',
      entityType: 'feedback',
      entityId: feedbackId,
      details: { status, priority },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    return ApiResponse.success(res, { feedback }, 'Feedback updated successfully');
  } catch (error) {
    logger.error('Update feedback error:', error);
    return ApiResponse.error(res, 'Error updating feedback');
  }
};

// ==================== ANALYTICS & INSIGHTS ====================

/**
 * @desc    Get analytics data
 * @route   GET /api/v1/admin/analytics
 * @access  Admin
 */
const getAnalytics = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));
    
    // User growth
    const totalUsers = await User.countDocuments();
    const newUsers = await User.countDocuments({ createdAt: { $gte: daysAgo } });
    const activeUsers = await User.countDocuments({ 
      lastLoginAt: { $gte: daysAgo } 
    });
    
    // Engagement metrics
    const totalConversations = await Conversation.countDocuments();
    const totalMessages = await Message.countDocuments();
    const totalRequests = await MessageRequest.countDocuments();
    const newRequests = await MessageRequest.countDocuments({ 
      createdAt: { $gte: daysAgo } 
    });
    
    // User growth over time
    const userGrowth = await User.aggregate([
      {
        $match: { createdAt: { $gte: daysAgo } }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Reports statistics
    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    const resolvedReports = await Report.countDocuments({ status: 'resolved' });
    
    // Feedback statistics
    const totalFeedback = await Feedback.countDocuments();
    const newFeedback = await Feedback.countDocuments({ status: 'new' });
    
    // Premium users
    const premiumUsers = await User.countDocuments({ isPremium: true });
    
    return ApiResponse.success(res, {
      overview: {
        totalUsers,
        newUsers,
        activeUsers,
        premiumUsers
      },
      engagement: {
        totalConversations,
        totalMessages,
        totalRequests,
        newRequests
      },
      moderation: {
        totalReports,
        pendingReports,
        resolvedReports,
        totalFeedback,
        newFeedback
      },
      growth: userGrowth
    });
  } catch (error) {
    logger.error('Get analytics error:', error);
    return ApiResponse.error(res, 'Error fetching analytics');
  }
};

// ==================== ACTIVITY LOGS ====================

/**
 * @desc    Get activity logs
 * @route   GET /api/v1/admin/activity-logs
 * @access  Admin
 */
const getActivityLogs = async (req, res) => {
  try {
    const { action, entityType, actor, page = 1, limit = 100 } = req.query;
    
    const filters = {};
    if (action) filters.action = action;
    if (entityType) filters.entityType = entityType;
    if (actor) filters.actor = actor;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const logs = await ActivityLog.getLogs(filters, parseInt(limit), skip);
    const total = await ActivityLog.countDocuments(filters);
    
    return ApiResponse.paginated(res, logs, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });
  } catch (error) {
    logger.error('Get activity logs error:', error);
    return ApiResponse.error(res, 'Error fetching activity logs');
  }
};

// ==================== BLOCKS MANAGEMENT ====================

/**
 * @desc    Get all blocks with filters
 * @route   GET /api/v1/admin/blocks
 * @access  Admin
 */
const getBlocks = async (req, res) => {
  try {
    const { reason, source, search, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (reason) query.reason = reason;
    if (source) query.source = source;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let blocks = await Block.find(query)
      .populate({
        path: 'blocker',
        select: 'username email',
        populate: { path: 'profile', select: 'name photos' }
      })
      .populate({
        path: 'blocked',
        select: 'username email',
        populate: { path: 'profile', select: 'name photos' }
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);
    
    // Filter by search if provided
    if (search) {
      const searchLower = search.toLowerCase();
      blocks = blocks.filter(block => 
        block.blocker?.username?.toLowerCase().includes(searchLower) ||
        block.blocker?.email?.toLowerCase().includes(searchLower) ||
        block.blocked?.username?.toLowerCase().includes(searchLower) ||
        block.blocked?.email?.toLowerCase().includes(searchLower)
      );
    }
    
    const total = await Block.countDocuments(query);
    
    return ApiResponse.paginated(res, blocks, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });
  } catch (error) {
    logger.error('Get blocks error:', error);
    return ApiResponse.error(res, 'Error fetching blocks');
  }
};

/**
 * @desc    Get block details
 * @route   GET /api/v1/admin/blocks/:blockId
 * @access  Admin
 */
const getBlockDetails = async (req, res) => {
  try {
    const { blockId } = req.params;
    
    const block = await Block.findById(blockId)
      .populate({
        path: 'blocker',
        select: 'username email accountStatus createdAt',
        populate: { path: 'profile', select: 'name photos location' }
      })
      .populate({
        path: 'blocked',
        select: 'username email accountStatus createdAt',
        populate: { path: 'profile', select: 'name photos location' }
      });
    
    if (!block) {
      return ApiResponse.notFound(res, 'Block not found');
    }
    
    return ApiResponse.success(res, { block });
  } catch (error) {
    logger.error('Get block details error:', error);
    return ApiResponse.error(res, 'Error fetching block details');
  }
};

/**
 * @desc    Remove a block (admin override)
 * @route   DELETE /api/v1/admin/blocks/:blockId
 * @access  Admin
 */
const removeBlock = async (req, res) => {
  try {
    const { blockId } = req.params;
    const { reason } = req.body;
    
    const block = await Block.findById(blockId);
    
    if (!block) {
      return ApiResponse.notFound(res, 'Block not found');
    }
    
    await Block.findByIdAndDelete(blockId);
    
    // Log activity
    await ActivityLog.log({
      actor: req.userId,
      actorType: 'admin',
      action: 'block_removed',
      entityType: 'block',
      entityId: blockId,
      details: { 
        blocker: block.blocker,
        blocked: block.blocked,
        adminReason: reason 
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    
    logger.info(`Block ${blockId} removed by admin ${req.userId}`);
    
    return ApiResponse.success(res, { message: 'Block removed successfully' });
  } catch (error) {
    logger.error('Remove block error:', error);
    return ApiResponse.error(res, 'Error removing block');
  }
};

/**
 * @desc    Get block statistics
 * @route   GET /api/v1/admin/blocks/stats
 * @access  Admin
 */
const getBlockStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    
    const [
      totalBlocks,
      blocksToday,
      blocksLast7Days,
      blocksByReason,
      blocksBySource
    ] = await Promise.all([
      Block.countDocuments(),
      Block.countDocuments({ createdAt: { $gte: today } }),
      Block.countDocuments({ createdAt: { $gte: last7Days } }),
      Block.aggregate([
        { $group: { _id: '$reason', count: { $sum: 1 } } }
      ]),
      Block.aggregate([
        { $group: { _id: '$source', count: { $sum: 1 } } }
      ])
    ]);
    
    return ApiResponse.success(res, {
      stats: {
        totalBlocks,
        blocksToday,
        blocksLast7Days,
        byReason: blocksByReason.reduce((acc, item) => {
          acc[item._id || 'not_specified'] = item.count;
          return acc;
        }, {}),
        bySource: blocksBySource.reduce((acc, item) => {
          acc[item._id || 'profile'] = item.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    logger.error('Get block stats error:', error);
    return ApiResponse.error(res, 'Error fetching block statistics');
  }
};

module.exports = {
  // Config
  getAppConfig,
  updateAppConfig,
  
  // Feature Flags
  getFeatureFlags,
  updateFeatureFlags,
  
  // User Management
  getUsers,
  getUserDetails,
  updateUserStatus,
  
  // Dashboard
  getDashboardStats,
  getLimits,
  updateLimits,
  
  // Unrevealed Chat Payment Settings
  getUnrevealedChatPaymentSettings,
  updateUnrevealedChatPaymentSettings,
  
  // Reports & Moderation
  getReports,
  getReportDetails,
  resolveReport,
  
  // Feedback Management
  getFeedback,
  getFeedbackDetails,
  updateFeedback,
  
  // Analytics
  getAnalytics,
  
  // Activity Logs
  getActivityLogs,
  
  // Blocks Management
  getBlocks,
  getBlockDetails,
  removeBlock,
  getBlockStats
};

