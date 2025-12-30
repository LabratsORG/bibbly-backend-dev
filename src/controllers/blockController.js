/**
 * Block Controller
 * Handles user blocking functionality
 */

const Block = require('../models/Block');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Profile = require('../models/Profile');
const ApiResponse = require('../utils/apiResponse');
const { getSocketIO } = require('../socket');
const logger = require('../utils/logger');

/**
 * @desc    Block a user
 * @route   POST /api/v1/block
 * @access  Private
 */
const blockUser = async (req, res) => {
  try {
    const { userId, reason = 'not_specified', additionalNotes, source = 'profile' } = req.body;

    // Can't block yourself
    if (userId === req.userId.toString()) {
      return ApiResponse.badRequest(res, 'You cannot block yourself');
    }

    // Check if user exists
    const userToBlock = await User.findById(userId);
    if (!userToBlock) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Check if already blocked
    const existingBlock = await Block.findOne({
      blocker: req.userId,
      blocked: userId
    });

    if (existingBlock) {
      return ApiResponse.conflict(res, 'User is already blocked');
    }

    // Create block
    const block = await Block.create({
      blocker: req.userId,
      blocked: userId,
      reason,
      additionalNotes,
      source
    });

    // Update any existing conversations
    const conversation = await Conversation.findOne({
      'participants.user': { $all: [req.userId, userId] },
      status: 'active'
    });

    if (conversation) {
      conversation.status = 'blocked';
      conversation.blockedBy = req.userId;
      conversation.blockedAt = new Date();
      await conversation.save();

      // Emit socket event to notify the blocked user
      const io = getSocketIO();
      if (io) {
        io.to(`user:${userId}`).emit('conversation_blocked', {
          conversationId: conversation._id
        });
      }
    }

    logger.info(`User ${req.userId} blocked user ${userId}`);

    return ApiResponse.success(res, { blocked: true }, 'User blocked successfully');

  } catch (error) {
    logger.error('Block user error:', error);
    return ApiResponse.error(res, 'Error blocking user');
  }
};

/**
 * @desc    Unblock a user
 * @route   DELETE /api/v1/block/:userId
 * @access  Private
 */
const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const block = await Block.findOneAndDelete({
      blocker: req.userId,
      blocked: userId
    });

    if (!block) {
      return ApiResponse.notFound(res, 'Block not found');
    }

    // Note: We don't automatically restore blocked conversations
    // User can start a new conversation if they want

    logger.info(`User ${req.userId} unblocked user ${userId}`);

    return ApiResponse.success(res, null, 'User unblocked successfully');

  } catch (error) {
    logger.error('Unblock user error:', error);
    return ApiResponse.error(res, 'Error unblocking user');
  }
};

/**
 * @desc    Get blocked users list
 * @route   GET /api/v1/block
 * @access  Private
 */
const getBlockedUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const blocks = await Block.find({ blocker: req.userId })
      .populate({
        path: 'blocked',
        select: 'username',
        populate: {
          path: 'profile',
          select: 'name photos'
        }
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Block.countDocuments({ blocker: req.userId });

    // Format response
    const blockedUsers = blocks.map(block => ({
      userId: block.blocked._id,
      username: block.blocked.username,
      name: block.blocked.profile?.name,
      photo: block.blocked.profile?.photos?.[0]?.url,
      blockedAt: block.createdAt,
      reason: block.reason
    }));

    return ApiResponse.paginated(res, blockedUsers, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });

  } catch (error) {
    logger.error('Get blocked users error:', error);
    return ApiResponse.error(res, 'Error fetching blocked users');
  }
};

/**
 * @desc    Check if user is blocked
 * @route   GET /api/v1/block/check/:userId
 * @access  Private
 */
const checkBlocked = async (req, res) => {
  try {
    const { userId } = req.params;

    const [isBlockedByMe, isBlockedByThem] = await Promise.all([
      Block.isBlocked(req.userId, userId),
      Block.isBlocked(userId, req.userId)
    ]);

    return ApiResponse.success(res, {
      isBlockedByMe,
      isBlockedByThem,
      hasBlockBetween: isBlockedByMe || isBlockedByThem
    });

  } catch (error) {
    logger.error('Check blocked error:', error);
    return ApiResponse.error(res, 'Error checking block status');
  }
};

/**
 * @desc    Panic block (instant block and clear chat)
 * @route   POST /api/v1/block/panic
 * @access  Private
 */
const panicBlock = async (req, res) => {
  try {
    const { userId } = req.body;

    // Block user
    const existingBlock = await Block.findOne({
      blocker: req.userId,
      blocked: userId
    });

    if (!existingBlock) {
      await Block.create({
        blocker: req.userId,
        blocked: userId,
        reason: 'other',
        additionalNotes: 'Panic block',
        source: 'chat'
      });
    }

    // Find and delete conversation
    const conversation = await Conversation.findOne({
      'participants.user': { $all: [req.userId, userId] }
    });

    if (conversation) {
      conversation.status = 'deleted';
      conversation.deletedBy.push(req.userId);
      await conversation.save();
    }

    // Emit socket event
    const io = getSocketIO();
    if (io) {
      io.to(`user:${userId}`).emit('panic_block', {
        conversationId: conversation?._id
      });
    }

    logger.info(`Panic block: User ${req.userId} blocked user ${userId}`);

    return ApiResponse.success(res, { blocked: true, chatCleared: true }, 'Panic block executed');

  } catch (error) {
    logger.error('Panic block error:', error);
    return ApiResponse.error(res, 'Error executing panic block');
  }
};

module.exports = {
  blockUser,
  unblockUser,
  getBlockedUsers,
  checkBlocked,
  panicBlock
};

