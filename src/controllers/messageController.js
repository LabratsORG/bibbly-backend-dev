/**
 * Message Controller
 * Handles real-time messaging within conversations
 */

const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Profile = require('../models/Profile');
const Block = require('../models/Block');
const Notification = require('../models/Notification');
const AppConfig = require('../models/AppConfig');
const ApiResponse = require('../utils/apiResponse');
const { sendNewMessageNotification, sendRevealNotification } = require('../config/onesignal');
const { formatMessagePreview } = require('../utils/helpers');
const { getBlurredImageUrl } = require('../config/cloudinary');
const { getSocketIO } = require('../socket');
const logger = require('../utils/logger');

/**
 * @desc    Get conversations (inbox)
 * @route   GET /api/v1/messages/conversations
 * @access  Private
 */
const getConversations = async (req, res) => {
  try {
    const { page = 1, limit = 20, archived = false } = req.query;

    const conversations = await Conversation.findForUser(req.userId, archived === 'true')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Get blocked user IDs to filter
    const blockedIds = await Block.getAllBlockRelatedUserIds(req.userId);

    // Filter and format conversations
    const formattedConversations = conversations
      .filter(conv => {
        const otherParticipant = conv.getOtherParticipant(req.userId);
        const otherUserId = otherParticipant?.user?._id || otherParticipant?.user;
        return otherUserId && !blockedIds.includes(otherUserId.toString());
      })
      .map(conv => {
        const convObj = conv.toObject();
        const otherParticipant = conv.getOtherParticipant(req.userId);
        const myData = conv.getParticipantData(req.userId);
        
        // Convert mongoose document to plain object
        let otherUserData = otherParticipant.user;
        if (otherUserData && typeof otherUserData.toObject === 'function') {
          otherUserData = otherUserData.toObject();
        }
        
        // Ensure IDs are strings
        if (convObj._id) convObj._id = convObj._id.toString();
        if (convObj.lastMessage?.senderId) {
          convObj.lastMessage.senderId = convObj.lastMessage.senderId.toString();
        }
        if (otherUserData?._id) {
          otherUserData._id = otherUserData._id.toString();
        }
        if (otherUserData?.profile?._id) {
          otherUserData.profile._id = otherUserData.profile._id.toString();
        }
        
        // Format lastMessage dates
        if (convObj.lastMessage?.sentAt) {
          convObj.lastMessage.sentAt = new Date(convObj.lastMessage.sentAt).toISOString();
        }
        
        // Only include profile data if the other user is revealed
        const isOtherRevealed = otherParticipant.isRevealed || false;
        const otherUserResponse = {
          _id: otherUserData?._id,
          username: otherUserData?.username || '',
          isRevealed: isOtherRevealed,
          revealedFields: otherParticipant.revealedFields || []
        };
        
        // Include profile data - blurred photos if not revealed
        if (otherUserData?.profile) {
          const profile = otherUserData.profile;
          const photos = profile.photos || [];
          
          // If not revealed, blur photos
          let processedPhotos = photos;
          if (!isOtherRevealed && photos.length > 0) {
            processedPhotos = photos.map(photo => {
              const photoObj = photo.toObject ? photo.toObject() : photo;
              const originalUrl = photoObj.url;
              const blurredUrlValue = getBlurredImageUrl(originalUrl);
              return {
                ...photoObj,
                url: blurredUrlValue, // Replace url with blurred version
                blurredUrl: blurredUrlValue // Also set blurredUrl
              };
            });
          }
          
          otherUserResponse.profile = {
            name: isOtherRevealed ? profile.name : null, // Hide name if not revealed
            photos: processedPhotos,
            bio: isOtherRevealed ? profile.bio : profile.bio, // Show bio even if not revealed
            interests: isOtherRevealed ? profile.interests : profile.interests, // Show interests even if not revealed
            age: isOtherRevealed ? profile.age : profile.age, // Show age even if not revealed
            whyOnApp: isOtherRevealed ? profile.whyOnApp : profile.whyOnApp, // Show whyOnApp even if not revealed
            lookingFor: isOtherRevealed ? profile.lookingFor : profile.lookingFor // Show lookingFor even if not revealed
          };
        }
        
        return {
          ...convObj,
          otherUser: otherUserResponse,
          initiator: convObj.initiator?.toString() || convObj.initiator,
          revealRequestedBy: convObj.revealRequestedBy?.toString() || null,
          unreadCount: myData?.unreadCount || 0,
          isMuted: myData?.isMuted || false,
          isArchived: myData?.isArchived || false,
          lastMessage: convObj.lastMessage || null
        };
      });
    
    logger.info(`Sent ${formattedConversations.length} conversations to user ${req.userId}`);

    const total = await Conversation.countDocuments({
      'participants.user': req.userId,
      status: 'active'
    });

    return ApiResponse.paginated(res, formattedConversations, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });

  } catch (error) {
    logger.error('Get conversations error:', error);
    return ApiResponse.error(res, 'Error fetching conversations');
  }
};

/**
 * @desc    Get single conversation
 * @route   GET /api/v1/messages/conversations/:conversationId
 * @access  Private
 */
const getConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
      status: 'active'
    }).populate({
      path: 'participants.user',
      select: 'username',
      populate: {
        path: 'profile',
        select: 'name photos bio interests age whyOnApp lookingFor socialHandles'
      }
    });

    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }

    // Mark as read
    await conversation.markAsRead(req.userId);

    const otherParticipant = conversation.getOtherParticipant(req.userId);
    const myData = conversation.getParticipantData(req.userId);
    
    // Only include profile data if the other user is revealed
    const isOtherRevealed = otherParticipant.isRevealed || false;
    const otherUserObj = otherParticipant.user.toObject();
    const otherUserResponse = {
      _id: otherUserObj._id,
      username: otherUserObj.username || '',
      isRevealed: isOtherRevealed,
      revealedFields: otherParticipant.revealedFields || []
    };
    
    // Include profile data - blurred photos if not revealed
    if (otherUserObj.profile) {
      const profile = otherUserObj.profile;
      const photos = profile.photos || [];
      
      // If not revealed, blur photos
      let processedPhotos = photos;
      if (!isOtherRevealed && photos.length > 0) {
        processedPhotos = photos.map(photo => {
          const photoObj = photo.toObject ? photo.toObject() : photo;
          const originalUrl = photoObj.url;
          const blurredUrlValue = getBlurredImageUrl(originalUrl);
          return {
            ...photoObj,
            url: blurredUrlValue, // Replace url with blurred version
            blurredUrl: blurredUrlValue // Also set blurredUrl
          };
        });
      }
      
      otherUserResponse.profile = {
        name: isOtherRevealed ? profile.name : null, // Hide name if not revealed
        photos: processedPhotos,
        bio: profile.bio, // Show bio even if not revealed
        interests: profile.interests, // Show interests even if not revealed
        age: profile.age, // Show age even if not revealed
        whyOnApp: profile.whyOnApp, // Show whyOnApp even if not revealed
        lookingFor: profile.lookingFor // Show lookingFor even if not revealed
      };
    }

    const convObj = conversation.toObject();
    
    return ApiResponse.success(res, {
      conversation: {
        ...convObj,
        initiator: convObj.initiator?.toString() || convObj.initiator,
        revealRequestedBy: convObj.revealRequestedBy?.toString() || null
      },
      otherUser: otherUserResponse,
      isAnonymous: conversation.isAnonymous,
      myRevealStatus: myData?.isRevealed || false
    });

  } catch (error) {
    logger.error('Get conversation error:', error);
    return ApiResponse.error(res, 'Error fetching conversation');
  }
};

/**
 * @desc    Get messages in conversation
 * @route   GET /api/v1/messages/conversations/:conversationId/messages
 * @access  Private
 */
const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId
    });

    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }

    const messages = await Message.getForConversation(
      conversationId,
      req.userId,
      parseInt(page),
      parseInt(limit)
    );

    // Mark messages as read
    await Message.markAllAsRead(conversationId, req.userId);
    await conversation.markAsRead(req.userId);

    const total = await Message.countDocuments({
      conversation: conversationId,
      deletedFor: { $ne: req.userId }
    });

    return ApiResponse.paginated(res, messages.reverse(), {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });

  } catch (error) {
    logger.error('Get messages error:', error);
    return ApiResponse.error(res, 'Error fetching messages');
  }
};

/**
 * @desc    Send message
 * @route   POST /api/v1/messages/conversations/:conversationId/messages
 * @access  Private
 */
const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, type = 'text', replyTo } = req.body;

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId,
      status: 'active'
    });

    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }

    // Get recipient
    const otherParticipant = conversation.getOtherParticipant(req.userId);
    const recipientId = otherParticipant.user;

    // Check if blocked
    const isBlocked = await Block.hasBlockBetween(req.userId, recipientId);
    if (isBlocked) {
      return ApiResponse.forbidden(res, 'Cannot send message to this user');
    }

    // Check unrevealed chat payment requirement (only for initiator in unrevealed chats)
    const isInitiator = conversation.initiator && 
                        conversation.initiator.toString() === req.userId.toString();
    
    // Get initiator's reveal status
    const initiatorParticipant = conversation.getParticipantData(conversation.initiator);
    const isInitiatorRevealed = initiatorParticipant ? initiatorParticipant.isRevealed : false;
    
    logger.info(`Message check - User: ${req.userId}, isInitiator: ${isInitiator}, isRevealed: ${isInitiatorRevealed}, msgCount: ${conversation.initiatorMessageCount || 0}`);
    
    // Only check payment if initiator AND not revealed
    if (isInitiator && !isInitiatorRevealed) {
      const config = await AppConfig.getConfig();
      const microPayments = config.microPayments || {};
      const unrevealedPayment = microPayments.unrevealedChatPayment || {
        isEnabled: true,
        freeMessageLimit: 100,
        pricePerMessageInPaisa: 200,
        priceDisplay: '₹2'
      };
      
      logger.info(`Payment config - isEnabled: ${unrevealedPayment.isEnabled}, limit: ${unrevealedPayment.freeMessageLimit}`);
      
      if (unrevealedPayment.isEnabled !== false) {
        const freeMessageLimit = unrevealedPayment.freeMessageLimit || 100;
        const currentCount = conversation.initiatorMessageCount || 0;
        const paidCycles = conversation.initiatorPaidCycles || 0;
        const allowedMessages = freeMessageLimit * (paidCycles + 1);
        
        logger.info(`Payment check - currentCount: ${currentCount}, allowedMessages: ${allowedMessages}, paidCycles: ${paidCycles}`);
        
        // Check if initiator needs to pay (already sent >= allowed messages)
        if (currentCount >= allowedMessages) {
          logger.info(`User ${req.userId} needs to pay for message in conversation ${conversationId} - count: ${currentCount}, allowed: ${allowedMessages}`);
          
          return ApiResponse.paymentRequired(res, {
            reason: 'message_limit_reached',
            message: `You've sent ${currentCount} messages. Pay ${unrevealedPayment.priceDisplay || '₹2'} to send another ${freeMessageLimit} messages or reveal your identity for unlimited messaging.`,
            priceInPaisa: unrevealedPayment.pricePerMessageInPaisa || 200,
            priceDisplay: unrevealedPayment.priceDisplay || '₹2',
            freeMessageLimit,
            currentCount,
            paidCycles,
            allowedMessages,
            conversationId: conversationId
          });
        }
      }
    }

    // Create message
    const message = await Message.create({
      conversation: conversationId,
      sender: req.userId,
      recipient: recipientId,
      content,
      type,
      replyTo: replyTo || null
    });

    // Populate sender info
    await message.populate('sender', 'username');
    if (replyTo) {
      await message.populate('replyTo', 'content sender');
    }

    // Update conversation
    await conversation.updateLastMessage(content, req.userId, type);

    // Send push notification if not muted
    if (!otherParticipant.isMuted) {
      const recipient = await User.findById(recipientId);
      if (recipient.oneSignalPlayerId) {
        const senderProfile = await Profile.findOne({ user: req.userId });
        const senderUser = await User.findById(req.userId);
        const senderIsRevealed = conversation.isUserRevealed(req.userId);
        const isSenderInitiator = conversation.initiator.toString() === req.userId.toString();
        
        // Determine notification title based on reveal status and who sent the request
        // If sender is initiator (who sent request) AND not revealed: show username
        // Otherwise: show full name
        let notificationTitle;
        if (isSenderInitiator && !senderIsRevealed) {
          // Sender is the one who requested and is not revealed: show username
          notificationTitle = senderUser?.username || 'Someone';
        } else {
          // Sender is not the initiator OR is revealed: show full name
          notificationTitle = senderProfile?.name || senderUser?.username || 'Someone';
        }
        
        logger.debug(`📤 Sending push notification to user ${recipientId}, playerId: ${recipient.oneSignalPlayerId.substring(0, 8)}...`);
        logger.debug(`   Sender is initiator: ${isSenderInitiator}, Revealed: ${senderIsRevealed}, Title: ${notificationTitle}`);
        
        await sendNewMessageNotification(
          [recipient.oneSignalPlayerId],
          notificationTitle,
          formatMessagePreview(content),
          !senderIsRevealed,
          conversationId.toString()
        );
      } else {
        logger.warn(`⚠️  Cannot send push notification: User ${recipientId} has no OneSignal player ID`);
      }
    }

    // Emit socket event
    const io = getSocketIO();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('new_message', {
        message,
        conversationId
      });
    }

    return ApiResponse.created(res, { message }, 'Message sent');

  } catch (error) {
    logger.error('Send message error:', error);
    return ApiResponse.error(res, 'Error sending message');
  }
};

/**
 * @desc    Add reaction to message
 * @route   POST /api/v1/messages/:messageId/reactions
 * @access  Private
 */
const addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    const message = await Message.findById(messageId);

    if (!message) {
      return ApiResponse.notFound(res, 'Message not found');
    }

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: message.conversation,
      'participants.user': req.userId
    });

    if (!conversation) {
      return ApiResponse.forbidden(res, 'Not authorized');
    }

    await message.addReaction(req.userId, emoji);

    // Emit socket event
    const io = getSocketIO();
    if (io) {
      io.to(`conversation:${message.conversation}`).emit('message_reaction', {
        messageId,
        userId: req.userId,
        emoji
      });
    }

    return ApiResponse.success(res, { reactions: message.reactions }, 'Reaction added');

  } catch (error) {
    logger.error('Add reaction error:', error);
    return ApiResponse.error(res, 'Error adding reaction');
  }
};

/**
 * @desc    Remove reaction from message
 * @route   DELETE /api/v1/messages/:messageId/reactions
 * @access  Private
 */
const removeReaction = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return ApiResponse.notFound(res, 'Message not found');
    }

    await message.removeReaction(req.userId);

    // Emit socket event
    const io = getSocketIO();
    if (io) {
      io.to(`conversation:${message.conversation}`).emit('reaction_removed', {
        messageId,
        userId: req.userId
      });
    }

    return ApiResponse.success(res, null, 'Reaction removed');

  } catch (error) {
    logger.error('Remove reaction error:', error);
    return ApiResponse.error(res, 'Error removing reaction');
  }
};

/**
 * @desc    Delete message for me
 * @route   DELETE /api/v1/messages/:messageId
 * @access  Private
 */
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { forEveryone = false } = req.query;

    const message = await Message.findById(messageId);

    if (!message) {
      return ApiResponse.notFound(res, 'Message not found');
    }

    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: message.conversation,
      'participants.user': req.userId
    });

    if (!conversation) {
      return ApiResponse.forbidden(res, 'Not authorized');
    }

    if (forEveryone === 'true') {
      await message.deleteForEveryone(req.userId);
      
      // Emit socket event
      const io = getSocketIO();
      if (io) {
        io.to(`conversation:${message.conversation}`).emit('message_deleted', {
          messageId,
          forEveryone: true
        });
      }
    } else {
      await message.deleteForUser(req.userId);
    }

    return ApiResponse.success(res, null, 'Message deleted');

  } catch (error) {
    logger.error('Delete message error:', error);
    if (error.message.includes('Time limit') || error.message.includes('Only sender')) {
      return ApiResponse.badRequest(res, error.message);
    }
    return ApiResponse.error(res, 'Error deleting message');
  }
};

/**
 * @desc    Mute conversation
 * @route   POST /api/v1/messages/conversations/:conversationId/mute
 * @access  Private
 */
const muteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { duration } = req.body; // duration in milliseconds, null for permanent

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId
    });

    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }

    await conversation.muteForUser(req.userId, duration);

    return ApiResponse.success(res, null, 'Conversation muted');

  } catch (error) {
    logger.error('Mute conversation error:', error);
    return ApiResponse.error(res, 'Error muting conversation');
  }
};

/**
 * @desc    Unmute conversation
 * @route   POST /api/v1/messages/conversations/:conversationId/unmute
 * @access  Private
 */
const unmuteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId
    });

    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }

    const participantIndex = conversation.participants.findIndex(
      p => p.user.toString() === req.userId.toString()
    );

    if (participantIndex !== -1) {
      conversation.participants[participantIndex].isMuted = false;
      conversation.participants[participantIndex].mutedUntil = null;
      await conversation.save();
    }

    return ApiResponse.success(res, null, 'Conversation unmuted');

  } catch (error) {
    logger.error('Unmute conversation error:', error);
    return ApiResponse.error(res, 'Error unmuting conversation');
  }
};

/**
 * @desc    Archive conversation
 * @route   POST /api/v1/messages/conversations/:conversationId/archive
 * @access  Private
 */
const archiveConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId
    });

    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }

    await conversation.archiveForUser(req.userId);

    return ApiResponse.success(res, null, 'Conversation archived');

  } catch (error) {
    logger.error('Archive conversation error:', error);
    return ApiResponse.error(res, 'Error archiving conversation');
  }
};

/**
 * @desc    Unarchive conversation
 * @route   POST /api/v1/messages/conversations/:conversationId/unarchive
 * @access  Private
 */
const unarchiveConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId
    });

    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }

    const participantIndex = conversation.participants.findIndex(
      p => p.user.toString() === req.userId.toString()
    );

    if (participantIndex !== -1) {
      conversation.participants[participantIndex].isArchived = false;
      conversation.participants[participantIndex].archivedAt = null;
      await conversation.save();
    }

    return ApiResponse.success(res, null, 'Conversation unarchived');

  } catch (error) {
    logger.error('Unarchive conversation error:', error);
    return ApiResponse.error(res, 'Error unarchiving conversation');
  }
};

/**
 * @desc    Request to see identity (receiver only)
 * @route   POST /api/v1/messages/conversations/:conversationId/request-reveal
 * @access  Private
 */
const requestReveal = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId
    });

    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }

    // Only receiver (non-initiator) can request reveal
    const isInitiator = conversation.initiator.toString() === req.userId.toString();
    if (isInitiator) {
      logger.info(`User ${req.userId} is initiator, cannot request reveal`);
      return ApiResponse.forbidden(res, 'Only the receiver can request to see identity');
    }

    // Get other participant (the initiator/sender)
    const otherParticipant = conversation.getOtherParticipant(req.userId);
    if (!otherParticipant) {
      logger.error(`Other participant not found for conversation ${conversationId}`);
      return ApiResponse.error(res, 'Unable to find other participant');
    }

    // Check if already revealed
    if (otherParticipant.isRevealed) {
      logger.info(`Identity already revealed for conversation ${conversationId}`);
      return ApiResponse.badRequest(res, 'Identity is already revealed');
    }

    // Allow multiple reveal requests - no need to check if already requested

    // Set reveal request
    conversation.revealRequestedBy = req.userId;
    conversation.revealRequestedAt = new Date();
    conversation.mutualRevealRequested = true;
    await conversation.save();

    // Create system message
    const systemMessage = await Message.create({
      conversation: conversationId,
      sender: req.userId,
      recipient: conversation.initiator,
      type: 'system',
      content: 'wants to see your identity',
      systemData: {
        action: 'reveal_requested',
        metadata: {
          requestedBy: req.userId
        }
      }
    });

    logger.info(`System message created: ${systemMessage._id} for conversation ${conversationId}`);

    // Populate sender info for socket emission
    await systemMessage.populate('sender', 'username');

    // Update conversation
    await conversation.updateLastMessage('wants to see your identity', req.userId, 'system');

    // Create notification for initiator
    await Notification.createNotification(
      conversation.initiator,
      'reveal_requested',
      'Someone wants to see you! 👀',
      'The other person wants to see your identity',
      { targetType: 'conversation', targetId: conversationId },
      req.userId
    );

    // Emit socket events
    const io = getSocketIO();
    if (io) {
      // Emit as new_message so it appears in the chat
      io.to(`conversation:${conversationId}`).emit('new_message', {
        message: systemMessage.toObject(),
        conversationId
      });
      
      // Also emit reveal_requested event for specific handling
      io.to(`conversation:${conversationId}`).emit('reveal_requested', {
        conversationId,
        requestedBy: req.userId
      });
    }

    logger.info(`User ${req.userId} requested to see identity in conversation ${conversationId}`);

    return ApiResponse.success(res, {
      requested: true,
      message: systemMessage
    }, 'Reveal request sent');

  } catch (error) {
    logger.error('Request reveal error:', error);
    return ApiResponse.error(res, 'Error requesting reveal');
  }
};

/**
 * @desc    Reveal identity in conversation (initiator only)
 * @route   POST /api/v1/messages/conversations/:conversationId/reveal
 * @access  Private
 */
const revealIdentity = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { fields = ['name', 'photos'] } = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': req.userId
    });

    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }

    // Only initiator (sender) can reveal
    const isInitiator = conversation.initiator.toString() === req.userId.toString();
    if (!isInitiator) {
      return ApiResponse.forbidden(res, 'Only the sender can reveal their identity');
    }

    // Check if already revealed
    if (conversation.isUserRevealed(req.userId)) {
      return ApiResponse.badRequest(res, 'Identity already revealed');
    }

    // Reveal identity
    await conversation.revealIdentity(req.userId, fields);

    // Get profile for reveal message
    const profile = await Profile.findOne({ user: req.userId });

    // Create reveal message
    const revealMessage = await Message.create({
      conversation: conversationId,
      sender: req.userId,
      recipient: conversation.getOtherParticipant(req.userId).user,
      type: 'reveal',
      content: `${profile?.name || 'User'} revealed their identity`,
      revealData: {
        revealedFields: fields,
        previouslyAnonymous: conversation.isAnonymous
      }
    });

    // Update conversation
    await conversation.updateLastMessage('Identity revealed', req.userId, 'reveal');

    // Create notification
    const otherUserId = conversation.getOtherParticipant(req.userId).user;
    await Notification.createNotification(
      otherUserId,
      'identity_reveal',
      'Identity Revealed! 🎭',
      `${profile?.name || 'Someone'} revealed their identity to you!`,
      { targetType: 'conversation', targetId: conversationId },
      req.userId
    );

    // Send push notification
    const otherUser = await User.findById(otherUserId);
    if (otherUser?.oneSignalPlayerId) {
      await sendRevealNotification(
        [otherUser.oneSignalPlayerId],
        profile?.name || 'Someone',
        conversationId.toString()
      );
    }

    // Emit socket event
    const io = getSocketIO();
    if (io) {
      io.to(`conversation:${conversationId}`).emit('identity_revealed', {
        userId: req.userId,
        fields,
        conversationId
      });
    }

    logger.info(`User ${req.userId} revealed identity in conversation ${conversationId}`);

    return ApiResponse.success(res, {
      revealed: true,
      fields,
      isConversationAnonymous: conversation.isAnonymous
    }, 'Identity revealed successfully');

  } catch (error) {
    logger.error('Reveal identity error:', error);
    return ApiResponse.error(res, 'Error revealing identity');
  }
};

/**
 * @desc    Get unread count
 * @route   GET /api/v1/messages/unread-count
 * @access  Private
 */
const getUnreadCount = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      'participants.user': req.userId,
      status: 'active'
    });

    let totalUnread = 0;
    conversations.forEach(conv => {
      const myData = conv.getParticipantData(req.userId);
      if (myData) {
        totalUnread += myData.unreadCount;
      }
    });

    return ApiResponse.success(res, { unreadCount: totalUnread });

  } catch (error) {
    logger.error('Get unread count error:', error);
    return ApiResponse.error(res, 'Error fetching unread count');
  }
};

/**
 * @desc    Report screenshot (trust system)
 * @route   POST /api/v1/messages/:messageId/screenshot
 * @access  Private
 */
const reportScreenshot = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);

    if (!message) {
      return ApiResponse.notFound(res, 'Message not found');
    }

    // Verify user is recipient (the one being screenshotted)
    if (message.sender.toString() !== req.userId.toString()) {
      return ApiResponse.forbidden(res, 'Not authorized');
    }

    message.screenshotDetected = true;
    message.screenshotDetectedAt = new Date();
    await message.save();

    // Notify sender that recipient took screenshot
    const io = getSocketIO();
    if (io) {
      io.to(`conversation:${message.conversation}`).emit('screenshot_detected', {
        messageId,
        detectedAt: message.screenshotDetectedAt
      });
    }

    return ApiResponse.success(res, null, 'Screenshot reported');

  } catch (error) {
    logger.error('Report screenshot error:', error);
    return ApiResponse.error(res, 'Error reporting screenshot');
  }
};

module.exports = {
  getConversations,
  getConversation,
  getMessages,
  sendMessage,
  addReaction,
  removeReaction,
  deleteMessage,
  muteConversation,
  unmuteConversation,
  archiveConversation,
  unarchiveConversation,
  requestReveal,
  revealIdentity,
  getUnreadCount,
  reportScreenshot
};

