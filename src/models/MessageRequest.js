/**
 * Message Request Model
 * Handles message request system (inbox/requests/sent)
 */

const mongoose = require('mongoose');

const messageRequestSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  initialMessage: {
    type: String,
    required: [true, 'Initial message is required'],
    maxlength: [500, 'Message cannot exceed 500 characters'],
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'expired', 'cancelled'],
    default: 'pending'
  },
  isAnonymous: {
    type: Boolean,
    default: true
  },
  // Entry source - how did sender find recipient
  source: {
    type: String,
    enum: ['profile_link', 'search', 'discovery_feed', 'qr_code'],
    required: true
  },
  // Conversation created after acceptance
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation'
  },
  // Request expiry (7 days by default)
  expiresAt: {
    type: Date,
    default: function() {
      const expiryDays = parseInt(process.env.MESSAGE_REQUEST_EXPIRY_DAYS) || 7;
      return new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    }
  },
  // Timestamps for actions
  acceptedAt: Date,
  rejectedAt: Date,
  cancelledAt: Date,
  // Read status
  isReadByRecipient: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  // Priority (premium feature)
  isPriority: {
    type: Boolean,
    default: false
  },
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
messageRequestSchema.index({ sender: 1, status: 1 });
messageRequestSchema.index({ recipient: 1, status: 1 });
messageRequestSchema.index({ sender: 1, recipient: 1 }, { unique: true });
messageRequestSchema.index({ status: 1, expiresAt: 1 });
messageRequestSchema.index({ createdAt: -1 });
messageRequestSchema.index({ isPriority: -1, createdAt: -1 });

// Virtual for checking if expired
messageRequestSchema.virtual('isExpired').get(function() {
  return this.status === 'pending' && this.expiresAt < new Date();
});

// Virtual for time until expiry
messageRequestSchema.virtual('expiresIn').get(function() {
  if (this.status !== 'pending') return null;
  const diff = this.expiresAt - new Date();
  return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60)) : 0; // hours
});

// Pre-save middleware to auto-expire
messageRequestSchema.pre('save', function(next) {
  if (this.status === 'pending' && this.expiresAt < new Date()) {
    this.status = 'expired';
  }
  next();
});

// Method to accept request
messageRequestSchema.methods.accept = async function(conversationId) {
  this.status = 'accepted';
  this.acceptedAt = new Date();
  this.conversation = conversationId;
  return this.save();
};

// Method to reject request
messageRequestSchema.methods.reject = async function() {
  this.status = 'rejected';
  this.rejectedAt = new Date();
  return this.save();
};

// Method to cancel request (by sender)
messageRequestSchema.methods.cancel = async function() {
  if (this.status !== 'pending') {
    throw new Error('Can only cancel pending requests');
  }
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  return this.save();
};

// Method to mark as read
messageRequestSchema.methods.markAsRead = async function() {
  if (!this.isReadByRecipient) {
    this.isReadByRecipient = true;
    this.readAt = new Date();
    return this.save();
  }
  return this;
};

// Static method to get pending requests for user
messageRequestSchema.statics.getPendingForUser = function(userId) {
  return this.find({
    recipient: userId,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  })
  .populate({
    path: 'sender',
    select: 'username',
    populate: {
      path: 'profile',
      select: 'name photos bio interests isAnonymous'
    }
  })
  .sort({ isPriority: -1, createdAt: -1 });
};

// Static method to get sent requests by user
messageRequestSchema.statics.getSentByUser = function(userId) {
  return this.find({ sender: userId })
    .populate({
      path: 'recipient',
      select: 'username',
      populate: {
        path: 'profile',
        select: 'name photos bio'
      }
    })
    .sort({ createdAt: -1 });
};

// Static method to check if request exists between users
messageRequestSchema.statics.existsBetweenUsers = async function(userId1, userId2) {
  return this.findOne({
    $or: [
      { sender: userId1, recipient: userId2 },
      { sender: userId2, recipient: userId1 }
    ],
    status: { $in: ['pending', 'accepted'] }
  });
};

// Static method to expire old requests
messageRequestSchema.statics.expireOldRequests = async function() {
  return this.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
};

// Static method to count daily requests sent by user
messageRequestSchema.statics.countTodayRequestsBySender = async function(userId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  return this.countDocuments({
    sender: userId,
    createdAt: { $gte: startOfDay }
  });
};

const MessageRequest = mongoose.model('MessageRequest', messageRequestSchema);

module.exports = MessageRequest;

