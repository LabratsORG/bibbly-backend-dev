/**
 * Conversation Model
 * Represents a chat conversation between two users
 */

const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isRevealed: {
    type: Boolean,
    default: false
  },
  revealedAt: Date,
  // What has been revealed
  revealedFields: [{
    type: String,
    enum: ['name', 'photos', 'instagram', 'twitter', 'linkedin', 'snapchat', 'full_profile']
  }],
  isMuted: {
    type: Boolean,
    default: false
  },
  mutedUntil: Date,
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: Date,
  lastReadAt: Date,
  unreadCount: {
    type: Number,
    default: 0
  }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  participants: {
    type: [participantSchema],
    validate: {
      validator: function(participants) {
        return participants.length === 2;
      },
      message: 'Conversation must have exactly 2 participants'
    }
  },
  // Who initiated (sent the message request)
  initiator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Original message request
  messageRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MessageRequest',
    required: true
  },
  // Anonymous status (both need to reveal for it to become non-anonymous)
  isAnonymous: {
    type: Boolean,
    default: true
  },
  // Last message info for listing
  lastMessage: {
    content: String,
    senderId: mongoose.Schema.Types.ObjectId,
    sentAt: Date,
    type: {
      type: String,
      enum: ['text', 'image', 'reveal', 'system'],
      default: 'text'
    }
  },
  // Message count
  messageCount: {
    type: Number,
    default: 0
  },
  // Initiator message tracking for unrevealed chat payment
  // Tracks messages sent by initiator while they haven't revealed
  initiatorMessageCount: {
    type: Number,
    default: 0
  },
  // Resets after payment - tracks paid message cycles
  initiatorPaidCycles: {
    type: Number,
    default: 0
  },
  // Last payment info
  lastMessagePayment: {
    paymentId: String,
    orderId: String,
    paidAt: Date,
    amountPaisa: Number
  },
  // Reveal-related
  mutualRevealRequested: {
    type: Boolean,
    default: false
  },
  revealRequestedBy: mongoose.Schema.Types.ObjectId,
  revealRequestedAt: Date,
  // Status
  status: {
    type: String,
    enum: ['active', 'blocked', 'deleted', 'reported'],
    default: 'active'
  },
  // Block info
  blockedBy: mongoose.Schema.Types.ObjectId,
  blockedAt: Date,
  // Deletion
  deletedBy: [mongoose.Schema.Types.ObjectId],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
conversationSchema.index({ 'participants.user': 1 });
conversationSchema.index({ initiator: 1 });
conversationSchema.index({ status: 1 });
conversationSchema.index({ 'lastMessage.sentAt': -1 });
conversationSchema.index({ createdAt: -1 });

// Helper to get user ID from participant (handles populated and non-populated)
const getUserId = (user) => {
  if (!user) return null;
  return user._id?.toString() || user.toString();
};

// Virtual for getting the other participant
conversationSchema.methods.getOtherParticipant = function(userId) {
  const userIdStr = userId.toString();
  const participant = this.participants.find(
    p => getUserId(p.user) !== userIdStr
  );
  return participant;
};

// Method to get participant data
conversationSchema.methods.getParticipantData = function(userId) {
  const userIdStr = userId.toString();
  return this.participants.find(
    p => getUserId(p.user) === userIdStr
  );
};

// Method to check if user is revealed
conversationSchema.methods.isUserRevealed = function(userId) {
  const participant = this.getParticipantData(userId);
  return participant ? participant.isRevealed : false;
};

// Method to reveal user identity
conversationSchema.methods.revealIdentity = async function(userId, fieldsToReveal = ['name', 'photos']) {
  const userIdStr = userId.toString();
  const participantIndex = this.participants.findIndex(
    p => getUserId(p.user) === userIdStr
  );
  
  if (participantIndex === -1) {
    throw new Error('User is not a participant in this conversation');
  }
  
  this.participants[participantIndex].isRevealed = true;
  this.participants[participantIndex].revealedAt = new Date();
  this.participants[participantIndex].revealedFields = fieldsToReveal;
  
  // Check if both are revealed
  const allRevealed = this.participants.every(p => p.isRevealed);
  if (allRevealed) {
    this.isAnonymous = false;
  }
  
  return this.save();
};

// Method to update last message
conversationSchema.methods.updateLastMessage = async function(content, senderId, type = 'text') {
  this.lastMessage = {
    content: content.substring(0, 100),
    senderId,
    sentAt: new Date(),
    type
  };
  this.messageCount += 1;
  
  // Track initiator messages for payment system
  // Only count if sender is initiator AND initiator hasn't revealed their identity
  const senderIdStr = senderId.toString();
  const isInitiator = this.initiator && this.initiator.toString() === senderIdStr;
  
  if (isInitiator) {
    // Check if initiator has revealed
    const initiatorParticipant = this.participants.find(
      p => getUserId(p.user) === senderIdStr
    );
    const initiatorRevealed = initiatorParticipant ? initiatorParticipant.isRevealed : false;
    
    // Only increment if NOT revealed
    if (!initiatorRevealed) {
      this.initiatorMessageCount = (this.initiatorMessageCount || 0) + 1;
    }
  }
  
  // Update unread count for other participant
  this.participants.forEach(p => {
    if (getUserId(p.user) !== senderIdStr) {
      p.unreadCount += 1;
    }
  });
  
  return this.save();
};

// Method to check if initiator needs to pay for message
conversationSchema.methods.initiatorNeedsToPay = function(freeMessageLimit) {
  // Check if initiator has revealed
  const initiatorIdStr = this.initiator ? this.initiator.toString() : null;
  if (!initiatorIdStr) return false;
  
  const initiatorParticipant = this.participants.find(
    p => getUserId(p.user) === initiatorIdStr
  );
  const initiatorRevealed = initiatorParticipant ? initiatorParticipant.isRevealed : false;
  
  // If revealed, no payment needed
  if (initiatorRevealed) return false;
  
  // Calculate allowed messages based on paid cycles
  const paidCycles = this.initiatorPaidCycles || 0;
  const allowedMessages = freeMessageLimit * (paidCycles + 1);
  const currentCount = this.initiatorMessageCount || 0;
  
  return currentCount >= allowedMessages;
};

// Method to record payment and reset counter
conversationSchema.methods.recordMessagePayment = async function(paymentId, orderId, amountPaisa) {
  this.initiatorPaidCycles = (this.initiatorPaidCycles || 0) + 1;
  this.lastMessagePayment = {
    paymentId,
    orderId,
    paidAt: new Date(),
    amountPaisa
  };
  return this.save();
};

// Method to get initiator message stats
conversationSchema.methods.getInitiatorMessageStats = function(freeMessageLimit) {
  const initiatorIdStr = this.initiator ? this.initiator.toString() : null;
  if (!initiatorIdStr) return null;
  
  const initiatorParticipant = this.participants.find(
    p => getUserId(p.user) === initiatorIdStr
  );
  const initiatorRevealed = initiatorParticipant ? initiatorParticipant.isRevealed : false;
  
  if (initiatorRevealed) {
    return {
      isRevealed: true,
      needsToPay: false,
      currentCount: 0,
      limitPerCycle: freeMessageLimit,
      paidCycles: 0,
      messagesUntilPayment: Infinity
    };
  }
  
  const paidCycles = this.initiatorPaidCycles || 0;
  const currentCount = this.initiatorMessageCount || 0;
  const allowedMessages = freeMessageLimit * (paidCycles + 1);
  const messagesUntilPayment = Math.max(0, allowedMessages - currentCount);
  
  return {
    isRevealed: false,
    needsToPay: currentCount >= allowedMessages,
    currentCount,
    limitPerCycle: freeMessageLimit,
    paidCycles,
    messagesUntilPayment
  };
};

// Method to mark as read
conversationSchema.methods.markAsRead = async function(userId) {
  const userIdStr = userId.toString();
  const participantIndex = this.participants.findIndex(
    p => getUserId(p.user) === userIdStr
  );
  
  if (participantIndex !== -1) {
    this.participants[participantIndex].lastReadAt = new Date();
    this.participants[participantIndex].unreadCount = 0;
  }
  
  return this.save();
};

// Method to mute conversation
conversationSchema.methods.muteForUser = async function(userId, duration = null) {
  const userIdStr = userId.toString();
  const participantIndex = this.participants.findIndex(
    p => getUserId(p.user) === userIdStr
  );
  
  if (participantIndex !== -1) {
    this.participants[participantIndex].isMuted = true;
    if (duration) {
      this.participants[participantIndex].mutedUntil = new Date(Date.now() + duration);
    }
  }
  
  return this.save();
};

// Method to archive conversation
conversationSchema.methods.archiveForUser = async function(userId) {
  const userIdStr = userId.toString();
  const participantIndex = this.participants.findIndex(
    p => getUserId(p.user) === userIdStr
  );
  
  if (participantIndex !== -1) {
    this.participants[participantIndex].isArchived = true;
    this.participants[participantIndex].archivedAt = new Date();
  }
  
  return this.save();
};

// Static method to find conversations for user
conversationSchema.statics.findForUser = function(userId, includeArchived = false) {
  const query = {
    'participants.user': userId,
    status: 'active',
    deletedBy: { $ne: userId }
  };
  
  if (!includeArchived) {
    query['participants'] = {
      $elemMatch: {
        user: userId,
        isArchived: false
      }
    };
  }
  
  return this.find(query)
    .populate({
      path: 'participants.user',
      select: 'username',
      populate: {
        path: 'profile',
        select: 'name photos bio interests age whyOnApp lookingFor'
      }
    })
    .sort({ 'lastMessage.sentAt': -1 });
};

// Static method to find conversation between two users
conversationSchema.statics.findBetweenUsers = function(userId1, userId2) {
  return this.findOne({
    'participants.user': { $all: [userId1, userId2] },
    status: 'active'
  });
};

// Static method to get unread count for user
conversationSchema.statics.getTotalUnreadCount = async function(userId) {
  const result = await this.aggregate([
    { $match: { 'participants.user': new mongoose.Types.ObjectId(userId), status: 'active' } },
    { $unwind: '$participants' },
    { $match: { 'participants.user': new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, totalUnread: { $sum: '$participants.unreadCount' } } }
  ]);
  
  return result.length > 0 ? result[0].totalUnread : 0;
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;

