/**
 * Message Request Controller
 * Handles sending, accepting, rejecting message requests
 */

const MessageRequest = require('../models/MessageRequest');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Block = require('../models/Block');
const Notification = require('../models/Notification');
const AppConfig = require('../models/AppConfig');
const ApiResponse = require('../utils/apiResponse');
const { sendMessageRequestNotification, sendRequestAcceptedNotification } = require('../config/onesignal');
const { getBlurredImageUrl } = require('../config/cloudinary');
const { getSocketIO } = require('../socket');
const logger = require('../utils/logger');

/**
 * @desc    Send message request
 * @route   POST /api/v1/requests
 * @access  Private
 */
const sendRequest = async (req, res) => {
  try {
    const { recipientId, message, source, isAnonymous = true, isPriority = false } = req.body;
    const senderId = req.userId;

    // Validate not sending to self
    if (senderId.toString() === recipientId) {
      return ApiResponse.badRequest(res, 'Cannot send request to yourself');
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient || recipient.accountStatus !== 'active') {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Check recipient profile
    const recipientProfile = await Profile.findOne({ user: recipientId });
    if (!recipientProfile || recipientProfile.isBanned) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Check if blocked
    const isBlocked = await Block.hasBlockBetween(senderId, recipientId);
    if (isBlocked) {
      return ApiResponse.forbidden(res, 'Unable to send request to this user');
    }

    // Check if request already exists
    const existingRequest = await MessageRequest.existsBetweenUsers(senderId, recipientId);
    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return ApiResponse.conflict(res, 'A request already exists with this user');
      }
      if (existingRequest.status === 'accepted') {
        return ApiResponse.conflict(res, 'You already have a conversation with this user');
      }
    }

    // Check daily limit using app config
    const config = await AppConfig.getConfig();
    
    const dailyFreeLimit = config.microPayments.dailyFreeRequests;
    const todayRequests = await MessageRequest.countTodayRequestsBySender(senderId);
    
    // Check if free requests available
    if (todayRequests >= dailyFreeLimit) {
      return ApiResponse.tooManyRequests(res, 
        `You've used all ${dailyFreeLimit} free request(s) today. Try again tomorrow!`
      );
    }

    // Check if recipient allows anonymous messages
    if (isAnonymous && !recipientProfile.allowAnonymousMessages) {
      return ApiResponse.forbidden(res, 'This user does not accept anonymous messages');
    }

    // Get sender's profile (needed for message preferences check and later for stats)
    const senderProfile = await Profile.findOne({ user: senderId });

    // Check message preferences (who can message this user)
    const msgPrefs = recipientProfile.messagePreferences;
    if (msgPrefs && msgPrefs.allowFrom === 'restricted') {
      if (senderProfile) {
        let canMessage = false;
        const reasons = [];
        
        // Check same college
        if (msgPrefs.sameCollege && senderProfile.college?.name && recipientProfile.college?.name) {
          if (senderProfile.college.name.toLowerCase() === recipientProfile.college.name.toLowerCase()) {
            canMessage = true;
          }
        }
        
        // Check same workplace
        if (msgPrefs.sameWorkplace && senderProfile.workplace?.company && recipientProfile.workplace?.company) {
          if (senderProfile.workplace.company.toLowerCase() === recipientProfile.workplace.company.toLowerCase()) {
            canMessage = true;
          }
        }
        
        // Check same location (city)
        if (msgPrefs.sameLocation && senderProfile.location?.city && recipientProfile.location?.city) {
          if (senderProfile.location.city.toLowerCase() === recipientProfile.location.city.toLowerCase()) {
            canMessage = true;
          }
        }
        
        // Build rejection message based on what's required
        if (!canMessage) {
          if (msgPrefs.sameCollege) reasons.push('same college');
          if (msgPrefs.sameWorkplace) reasons.push('same workplace');
          if (msgPrefs.sameLocation) reasons.push('same location');
          
          const reasonText = reasons.length > 0 
            ? `This user only accepts messages from people with ${reasons.join(' or ')}.`
            : 'This user has restricted who can message them.';
          
          return ApiResponse.forbidden(res, reasonText);
        }
      } else {
        // Sender doesn't have a profile, check if any restrictions require profile info
        if (msgPrefs.sameCollege || msgPrefs.sameWorkplace || msgPrefs.sameLocation) {
          return ApiResponse.forbidden(res, 'Please complete your profile to message this user.');
        }
      }
    }

    // Create request
    const request = await MessageRequest.create({
      sender: senderId,
      recipient: recipientId,
      initialMessage: message,
      isAnonymous,
      source,
      isPriority: false
    });

    // Update sender's profile stats
    if (senderProfile) {
      senderProfile.requestsSent += 1;
      await senderProfile.save({ validateBeforeSave: false });
    }

    // Update recipient's profile stats
    recipientProfile.requestsReceived += 1;
    await recipientProfile.save({ validateBeforeSave: false });

    // Create notification
    await Notification.createNotification(
      recipientId,
      'message_request',
      'New Message Request 💬',
      isAnonymous ? 'Someone wants to chat with you!' : `${senderProfile?.name || 'Someone'} wants to chat with you!`,
      { targetType: 'request', targetId: request._id },
      isAnonymous ? null : senderId
    );

    // Send push notification
    if (recipient.oneSignalPlayerId) {
      logger.debug(`📤 Sending message request notification to user ${recipientId}, playerId: ${recipient.oneSignalPlayerId.substring(0, 8)}...`);
      
      await sendMessageRequestNotification(
        [recipient.oneSignalPlayerId],
        senderProfile?.name,
        isAnonymous,
        request._id.toString()
      );
    } else {
      logger.warn(`⚠️  Cannot send push notification: User ${recipientId} has no OneSignal player ID`);
    }

    // Emit socket event
    const io = getSocketIO();
    if (io) {
      io.to(`user:${recipientId}`).emit('new_request', {
        requestId: request._id,
        isAnonymous,
        source
      });
    }

    logger.info(`Message request sent from ${senderId} to ${recipientId}`);

    // Populate sender with profile for response
    await request.populate({
      path: 'sender',
      select: 'username',
      populate: {
        path: 'profile',
        select: 'name photos bio interests'
      }
    });

    // Format response with blurred photos for anonymous
    const requestObj = request.toObject();
    
    // Ensure IDs are strings
    if (requestObj._id) requestObj._id = requestObj._id.toString();
    if (requestObj.sender && typeof requestObj.sender === 'object') {
      if (requestObj.sender._id) {
        requestObj.sender._id = requestObj.sender._id.toString();
      }
    }
    if (requestObj.recipient && typeof requestObj.recipient === 'object') {
      if (requestObj.recipient._id) {
        requestObj.recipient._id = requestObj.recipient._id.toString();
      }
    }
    
    // Blur photos for anonymous requests
    if (isAnonymous && requestObj.sender?.profile?.photos && requestObj.sender.profile.photos.length > 0) {
      requestObj.sender.profile.photos = requestObj.sender.profile.photos.map(photo => {
        const photoObj = photo.toObject ? photo.toObject() : photo;
        const originalUrl = photoObj.url || photoObj.url;
        const blurredUrlValue = getBlurredImageUrl(originalUrl);
        return {
          ...photoObj,
          url: blurredUrlValue, // Replace url with blurred version for anonymous
          blurredUrl: blurredUrlValue // Also set blurredUrl
        };
      });
    }

    return ApiResponse.created(res, { request: requestObj }, 'Request sent successfully');

  } catch (error) {
    logger.error('Send request error:', error);
    return ApiResponse.error(res, 'Error sending request');
  }
};

/**
 * @desc    Get pending requests (received)
 * @route   GET /api/v1/requests/pending
 * @access  Private
 */
const getPendingRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // Get blocked user IDs
    const blockedIds = await Block.getAllBlockRelatedUserIds(req.userId);

    const requests = await MessageRequest.find({
      recipient: req.userId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
      sender: { $nin: blockedIds }
    })
    .populate({
      path: 'sender',
      select: 'username',
      populate: {
        path: 'profile',
        select: 'name photos bio interests'
      }
    })
    .sort({ isPriority: -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

    // Format response with blurred photos for anonymous
    const formattedRequests = requests.map(req => {
      const reqObj = req.toObject();
      
      // Ensure IDs are strings
      if (reqObj._id) reqObj._id = reqObj._id.toString();
      if (reqObj.sender && typeof reqObj.sender === 'object') {
        if (reqObj.sender._id) {
          reqObj.sender._id = reqObj.sender._id.toString();
        }
      }
      if (reqObj.recipient && typeof reqObj.recipient === 'object') {
        if (reqObj.recipient._id) {
          reqObj.recipient._id = reqObj.recipient._id.toString();
        }
      }
      
      // Calculate expiresIn if expiresAt exists
      if (reqObj.expiresAt) {
        const now = new Date();
        const expiresAt = new Date(reqObj.expiresAt);
        const diffMs = expiresAt - now;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        reqObj.expiresIn = diffHours > 0 ? diffHours : null;
      }
      
      // Always blur photos for anonymous requests (even if profile exists)
      if (req.isAnonymous && reqObj.sender?.profile?.photos && reqObj.sender.profile.photos.length > 0) {
        reqObj.sender.profile.photos = reqObj.sender.profile.photos.map(photo => {
          const photoObj = photo.toObject ? photo.toObject() : photo;
          const originalUrl = photoObj.url;
          const blurredUrlValue = getBlurredImageUrl(originalUrl);
          return {
            ...photoObj,
            url: blurredUrlValue, // Replace url with blurred version for anonymous
            blurredUrl: blurredUrlValue // Also set blurredUrl
          };
        });
      }
      return reqObj;
    });
    
    logger.info(`Sent ${formattedRequests.length} pending requests to user ${req.userId}`);

    const total = await MessageRequest.countDocuments({
      recipient: req.userId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
      sender: { $nin: blockedIds }
    });

    return ApiResponse.paginated(res, formattedRequests, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });

  } catch (error) {
    logger.error('Get pending requests error:', error);
    return ApiResponse.error(res, 'Error fetching requests');
  }
};

/**
 * @desc    Get sent requests
 * @route   GET /api/v1/requests/sent
 * @access  Private
 */
const getSentRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = { sender: req.userId };
    if (status) {
      query.status = status;
    }

    const requests = await MessageRequest.find(query)
      .populate({
        path: 'sender',
        select: 'username',
        populate: {
          path: 'profile',
          select: 'name photos bio'
        }
      })
      .populate({
        path: 'recipient',
        select: 'username',
        populate: {
          path: 'profile',
          select: 'name photos bio'
        }
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Convert to plain objects and format
    const formattedRequests = requests.map(req => {
      const reqObj = { ...req };
      
      // Ensure IDs are strings
      if (reqObj._id) reqObj._id = reqObj._id.toString();
      
      // Blur photos for anonymous sent requests (when viewing sent requests, blur if anonymous)
      if (reqObj.isAnonymous && reqObj.sender?.profile?.photos && reqObj.sender.profile.photos.length > 0) {
        reqObj.sender.profile.photos = reqObj.sender.profile.photos.map(photo => {
          const photoObj = photo.toObject ? photo.toObject() : photo;
          const originalUrl = photoObj.url;
          const blurredUrlValue = getBlurredImageUrl(originalUrl);
          return {
            ...photoObj,
            url: blurredUrlValue, // Replace url with blurred version for anonymous
            blurredUrl: blurredUrlValue // Also set blurredUrl
          };
        });
      }
      
      // Handle sender
      if (reqObj.sender && typeof reqObj.sender === 'object') {
        if (reqObj.sender._id) {
          reqObj.sender._id = reqObj.sender._id.toString();
        }
        if (reqObj.sender.profile?._id) {
          reqObj.sender.profile._id = reqObj.sender.profile._id.toString();
        }
      } else if (reqObj.sender) {
        reqObj.sender = reqObj.sender.toString();
      }
      
      // Handle recipient
      if (reqObj.recipient && typeof reqObj.recipient === 'object') {
        if (reqObj.recipient._id) {
          reqObj.recipient._id = reqObj.recipient._id.toString();
        }
        if (reqObj.recipient.profile?._id) {
          reqObj.recipient.profile._id = reqObj.recipient.profile._id.toString();
        }
      } else if (reqObj.recipient) {
        reqObj.recipient = reqObj.recipient.toString();
      }
      
      // Calculate expiresIn if expiresAt exists
      if (reqObj.expiresAt) {
        const now = new Date();
        const expiresAt = new Date(reqObj.expiresAt);
        const diffMs = expiresAt - now;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        reqObj.expiresIn = diffHours > 0 ? diffHours : null;
      }
      
      return reqObj;
    });
    
    logger.info(`Sent ${formattedRequests.length} requests to user ${req.userId}`);

    const total = await MessageRequest.countDocuments(query);

    return ApiResponse.paginated(res, formattedRequests, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });

  } catch (error) {
    logger.error('Get sent requests error:', error);
    return ApiResponse.error(res, 'Error fetching sent requests');
  }
};

/**
 * @desc    Accept message request
 * @route   POST /api/v1/requests/:id/accept
 * @access  Private
 */
const acceptRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await MessageRequest.findOne({
      _id: id,
      recipient: req.userId,
      status: 'pending'
    }).populate('sender', 'username oneSignalPlayerId');

    if (!request) {
      return ApiResponse.notFound(res, 'Request not found or already processed');
    }

    // Check if expired
    if (request.expiresAt < new Date()) {
      request.status = 'expired';
      await request.save();
      return ApiResponse.badRequest(res, 'Request has expired');
    }

    // Create conversation
    const conversation = await Conversation.create({
      participants: [
        { user: request.sender._id, isRevealed: !request.isAnonymous },
        { user: req.userId, isRevealed: true }
      ],
      initiator: request.sender._id,
      messageRequest: request._id,
      isAnonymous: request.isAnonymous
    });

    // Create initial message
    const message = await Message.create({
      conversation: conversation._id,
      sender: request.sender._id,
      recipient: req.userId,
      content: request.initialMessage,
      type: 'text'
    });

    // Update conversation with last message
    await conversation.updateLastMessage(request.initialMessage, request.sender._id);

    // Accept request
    await request.accept(conversation._id);

    // Create notification for sender
    await Notification.createNotification(
      request.sender._id,
      'request_accepted',
      'Request Accepted! ✅',
      'Your message request was accepted. Start chatting!',
      { targetType: 'conversation', targetId: conversation._id },
      req.userId
    );

    // Send push notification
    if (request.sender.oneSignalPlayerId) {
      const recipientProfile = await Profile.findOne({ user: req.userId });
      await sendRequestAcceptedNotification(
        [request.sender.oneSignalPlayerId],
        recipientProfile?.name,
        request.isAnonymous,
        conversation._id.toString()
      );
    }

    // Emit socket event
    const io = getSocketIO();
    if (io) {
      io.to(`user:${request.sender._id}`).emit('request_accepted', {
        requestId: request._id,
        conversationId: conversation._id
      });
    }

    logger.info(`Request ${id} accepted, conversation ${conversation._id} created`);

    return ApiResponse.success(res, {
      conversation,
      message
    }, 'Request accepted');

  } catch (error) {
    logger.error('Accept request error:', error);
    return ApiResponse.error(res, 'Error accepting request');
  }
};

/**
 * @desc    Reject message request
 * @route   POST /api/v1/requests/:id/reject
 * @access  Private
 */
const rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await MessageRequest.findOne({
      _id: id,
      recipient: req.userId,
      status: 'pending'
    });

    if (!request) {
      return ApiResponse.notFound(res, 'Request not found or already processed');
    }

    await request.reject();

    logger.info(`Request ${id} rejected`);

    return ApiResponse.success(res, null, 'Request rejected');

  } catch (error) {
    logger.error('Reject request error:', error);
    return ApiResponse.error(res, 'Error rejecting request');
  }
};

/**
 * @desc    Cancel sent request
 * @route   DELETE /api/v1/requests/:id
 * @access  Private
 */
const cancelRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await MessageRequest.findOne({
      _id: id,
      sender: req.userId,
      status: 'pending'
    });

    if (!request) {
      return ApiResponse.notFound(res, 'Request not found or cannot be cancelled');
    }

    await request.cancel();

    logger.info(`Request ${id} cancelled`);

    return ApiResponse.success(res, null, 'Request cancelled');

  } catch (error) {
    logger.error('Cancel request error:', error);
    return ApiResponse.error(res, 'Error cancelling request');
  }
};

/**
 * @desc    Mark request as read
 * @route   POST /api/v1/requests/:id/read
 * @access  Private
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await MessageRequest.findOne({
      _id: id,
      recipient: req.userId
    });

    if (!request) {
      return ApiResponse.notFound(res, 'Request not found');
    }

    await request.markAsRead();

    return ApiResponse.success(res, null, 'Marked as read');

  } catch (error) {
    logger.error('Mark as read error:', error);
    return ApiResponse.error(res, 'Error marking as read');
  }
};

/**
 * @desc    Get request stats
 * @route   GET /api/v1/requests/stats
 * @access  Private
 */
const getRequestStats = async (req, res) => {
  try {
    const [pendingReceived, pendingSent, accepted, rejected] = await Promise.all([
      MessageRequest.countDocuments({
        recipient: req.userId,
        status: 'pending',
        expiresAt: { $gt: new Date() }
      }),
      MessageRequest.countDocuments({
        sender: req.userId,
        status: 'pending'
      }),
      MessageRequest.countDocuments({
        $or: [{ sender: req.userId }, { recipient: req.userId }],
        status: 'accepted'
      }),
      MessageRequest.countDocuments({
        sender: req.userId,
        status: 'rejected'
      })
    ]);

    // Get config
    const config = await AppConfig.getConfig();
    // Get daily limits
    const dailyFreeLimit = config.microPayments.dailyFreeRequests;
    const todayRequests = await MessageRequest.countTodayRequestsBySender(req.userId);
    
    // Calculate remaining
    const freeRemaining = Math.max(0, dailyFreeLimit - todayRequests);

    return ApiResponse.success(res, {
      pendingReceived,
      pendingSent,
      accepted,
      rejected,
      // Daily free requests
      dailyFreeLimit,
      dailyFreeUsed: Math.min(todayRequests, dailyFreeLimit),
      dailyFreeRemaining: freeRemaining,
      // Total
      totalAvailable: freeRemaining
    });

  } catch (error) {
    logger.error('Get request stats error:', error);
    return ApiResponse.error(res, 'Error fetching stats');
  }
};

module.exports = {
  sendRequest,
  getPendingRequests,
  getSentRequests,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  markAsRead,
  getRequestStats
};

