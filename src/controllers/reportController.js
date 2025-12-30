/**
 * Report Controller
 * Handles user reporting for safety
 */

const Report = require('../models/Report');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Message = require('../models/Message');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * @desc    Report a user
 * @route   POST /api/v1/report
 * @access  Private
 */
const reportUser = async (req, res) => {
  try {
    const {
      reportedUserId,
      contentType,
      contentId,
      reason,
      description,
      evidence = []
    } = req.body;

    // Can't report yourself
    if (reportedUserId === req.userId.toString()) {
      return ApiResponse.badRequest(res, 'You cannot report yourself');
    }

    // Check if user exists
    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Check for duplicate report
    const existingReport = await Report.hasReported(
      req.userId,
      reportedUserId,
      contentType,
      contentId
    );

    if (existingReport) {
      return ApiResponse.conflict(res, 'You have already reported this content');
    }

    // Get content snapshot
    let contentSnapshot = null;
    if (contentType === 'message' && contentId) {
      const message = await Message.findById(contentId);
      if (message) {
        contentSnapshot = message.content;
      }
    } else if (contentType === 'profile') {
      const profile = await Profile.findOne({ user: reportedUserId });
      if (profile) {
        contentSnapshot = JSON.stringify({
          name: profile.name,
          bio: profile.bio,
          photos: profile.photos.map(p => p.url)
        });
      }
    }

    // Create report
    const report = await Report.create({
      reporter: req.userId,
      reportedUser: reportedUserId,
      reportedContent: {
        type: contentType,
        contentId,
        contentSnapshot
      },
      reason,
      description,
      evidence
    });

    // Update reported user's profile
    const profile = await Profile.findOne({ user: reportedUserId });
    if (profile) {
      profile.reportCount += 1;
      profile.isReported = true;
      await profile.save({ validateBeforeSave: false });

      // Auto-action for multiple reports
      if (profile.reportCount >= 5) {
        // Auto-suspend account for review
        reportedUser.accountStatus = 'suspended';
        await reportedUser.save({ validateBeforeSave: false });
        
        report.autoActionTaken = true;
        report.autoActionDetails = 'Account auto-suspended due to multiple reports';
        await report.save();

        logger.warn(`User ${reportedUserId} auto-suspended due to ${profile.reportCount} reports`);
      }
    }

    logger.info(`Report created: ${req.userId} reported ${reportedUserId} for ${reason}`);

    return ApiResponse.created(res, {
      reportId: report._id,
      status: report.status
    }, 'Report submitted successfully. Our team will review it.');

  } catch (error) {
    logger.error('Report user error:', error);
    return ApiResponse.error(res, 'Error submitting report');
  }
};

/**
 * @desc    Get my report history
 * @route   GET /api/v1/report/history
 * @access  Private
 */
const getReportHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const reports = await Report.find({ reporter: req.userId })
      .select('reportedContent.type reason status createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Report.countDocuments({ reporter: req.userId });

    return ApiResponse.paginated(res, reports, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });

  } catch (error) {
    logger.error('Get report history error:', error);
    return ApiResponse.error(res, 'Error fetching report history');
  }
};

/**
 * @desc    Get report status
 * @route   GET /api/v1/report/:reportId
 * @access  Private
 */
const getReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await Report.findOne({
      _id: reportId,
      reporter: req.userId
    }).select('reason status resolution.action createdAt');

    if (!report) {
      return ApiResponse.notFound(res, 'Report not found');
    }

    return ApiResponse.success(res, { report });

  } catch (error) {
    logger.error('Get report status error:', error);
    return ApiResponse.error(res, 'Error fetching report status');
  }
};

// Admin functions
/**
 * @desc    Get pending reports (Admin)
 * @route   GET /api/v1/report/admin/pending
 * @access  Private/Admin
 */
const getPendingReports = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const reports = await Report.getPendingReports(parseInt(limit));

    const total = await Report.countDocuments({ status: 'pending' });

    return ApiResponse.paginated(res, reports, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });

  } catch (error) {
    logger.error('Get pending reports error:', error);
    return ApiResponse.error(res, 'Error fetching pending reports');
  }
};

/**
 * @desc    Resolve report (Admin)
 * @route   POST /api/v1/report/admin/:reportId/resolve
 * @access  Private/Admin
 */
const resolveReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { action, notes } = req.body;

    const report = await Report.findById(reportId);

    if (!report) {
      return ApiResponse.notFound(res, 'Report not found');
    }

    // Apply action
    if (action === 'warning' || action === 'temporary_ban' || action === 'permanent_ban') {
      const reportedUser = await User.findById(report.reportedUser);
      
      if (action === 'temporary_ban') {
        reportedUser.accountStatus = 'suspended';
        await reportedUser.save();
      } else if (action === 'permanent_ban') {
        reportedUser.accountStatus = 'deleted';
        await reportedUser.save();
        
        const profile = await Profile.findOne({ user: report.reportedUser });
        if (profile) {
          profile.isBanned = true;
          profile.bannedAt = new Date();
          profile.banReason = notes || reason;
          await profile.save();
        }
      }
    }

    await report.resolve(req.userId, action, notes);

    logger.info(`Report ${reportId} resolved by admin ${req.userId} with action: ${action}`);

    return ApiResponse.success(res, { report }, 'Report resolved');

  } catch (error) {
    logger.error('Resolve report error:', error);
    return ApiResponse.error(res, 'Error resolving report');
  }
};

module.exports = {
  reportUser,
  getReportHistory,
  getReportStatus,
  getPendingReports,
  resolveReport
};

