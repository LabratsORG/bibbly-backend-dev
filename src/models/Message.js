/**
 * Message Model
 * Individual messages within a conversation
 */

const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  emoji: {
    type: String,
    required: true,
    maxlength: 10
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
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
  content: {
    type: String,
    required: function() {
      return this.type === 'text';
    },
    maxlength: [2000, 'Message cannot exceed 2000 characters'],
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'reveal', 'system'],
    default: 'text'
  },
  // For image messages
  media: {
    url: String,
    publicId: String,
    thumbnailUrl: String,
    width: Number,
    height: Number
  },
  // For reveal messages
  revealData: {
    revealedFields: [String],
    previouslyAnonymous: Boolean
  },
  // For system messages
  systemData: {
    action: {
      type: String,
      enum: ['conversation_started', 'identity_revealed', 'user_blocked', 'chat_reported', 'reveal_requested']
    },
    metadata: mongoose.Schema.Types.Mixed
  },
  // Read status
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  // Delivery status
  deliveryStatus: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  deliveredAt: Date,
  // Reactions
  reactions: [reactionSchema],
  // Reply to another message
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  // Deletion
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Edit history
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  originalContent: String,
  // Screenshot warning
  screenshotDetected: {
    type: Boolean,
    default: false
  },
  screenshotDetectedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ recipient: 1 });
messageSchema.index({ conversation: 1, isRead: 1 });
messageSchema.index({ createdAt: -1 });

// Virtual for formatted timestamp
messageSchema.virtual('formattedTime').get(function() {
  return this.createdAt.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Method to mark as read
messageSchema.methods.markAsRead = async function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
    this.deliveryStatus = 'read';
    return this.save();
  }
  return this;
};

// Method to mark as delivered
messageSchema.methods.markAsDelivered = async function() {
  if (this.deliveryStatus === 'sent') {
    this.deliveryStatus = 'delivered';
    this.deliveredAt = new Date();
    return this.save();
  }
  return this;
};

// Method to add reaction
messageSchema.methods.addReaction = async function(userId, emoji) {
  // Remove existing reaction from same user
  this.reactions = this.reactions.filter(
    r => r.user.toString() !== userId.toString()
  );
  
  // Add new reaction
  this.reactions.push({
    user: userId,
    emoji
  });
  
  return this.save();
};

// Method to remove reaction
messageSchema.methods.removeReaction = async function(userId) {
  this.reactions = this.reactions.filter(
    r => r.user.toString() !== userId.toString()
  );
  return this.save();
};

// Method to soft delete for user
messageSchema.methods.deleteForUser = async function(userId) {
  if (!this.deletedFor.includes(userId)) {
    this.deletedFor.push(userId);
  }
  return this.save();
};

// Method to delete for everyone (only sender can do within time limit)
messageSchema.methods.deleteForEveryone = async function(requesterId) {
  // Check if requester is sender
  if (this.sender.toString() !== requesterId.toString()) {
    throw new Error('Only sender can delete for everyone');
  }
  
  // Check time limit (e.g., 1 hour)
  const timeLimit = 60 * 60 * 1000; // 1 hour
  if (Date.now() - this.createdAt > timeLimit) {
    throw new Error('Time limit exceeded for deleting for everyone');
  }
  
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.content = 'This message was deleted';
  
  return this.save();
};

// Method to edit message
messageSchema.methods.editContent = async function(newContent, requesterId) {
  // Check if requester is sender
  if (this.sender.toString() !== requesterId.toString()) {
    throw new Error('Only sender can edit message');
  }
  
  // Check time limit (e.g., 15 minutes)
  const timeLimit = 15 * 60 * 1000;
  if (Date.now() - this.createdAt > timeLimit) {
    throw new Error('Time limit exceeded for editing');
  }
  
  if (!this.isEdited) {
    this.originalContent = this.content;
  }
  
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  
  return this.save();
};

// Static method to get messages for conversation
messageSchema.statics.getForConversation = function(conversationId, userId, page = 1, limit = 50) {
  return this.find({
    conversation: conversationId,
    deletedFor: { $ne: userId }
  })
  .populate('sender', 'username')
  .populate('replyTo', 'content sender')
  .sort({ createdAt: -1 })
  .skip((page - 1) * limit)
  .limit(limit);
};

// Static method to get unread messages count
messageSchema.statics.getUnreadCount = function(conversationId, userId) {
  return this.countDocuments({
    conversation: conversationId,
    recipient: userId,
    isRead: false
  });
};

// Static method to mark all as read in conversation
messageSchema.statics.markAllAsRead = function(conversationId, userId) {
  return this.updateMany(
    {
      conversation: conversationId,
      recipient: userId,
      isRead: false
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
        deliveryStatus: 'read'
      }
    }
  );
};

// Static method to create system message
messageSchema.statics.createSystemMessage = function(conversationId, action, metadata = {}) {
  return this.create({
    conversation: conversationId,
    sender: null,
    recipient: null,
    type: 'system',
    systemData: {
      action,
      metadata
    }
  });
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;

