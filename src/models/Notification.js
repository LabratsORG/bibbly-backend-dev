/**
 * Notification Model
 * In-app notifications storage
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'message_request',
      'request_accepted',
      'request_rejected',
      'new_message',
      'identity_reveal',
      'reveal_requested',
      'profile_view',
      'system',
      'premium_expiring',
      'premium_expired',
      'welcome'
    ],
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  message: {
    type: String,
    required: true,
    maxlength: 500
  },
  data: {
    // Additional data for navigation/action
    targetType: {
      type: String,
      enum: ['conversation', 'profile', 'request', 'settings', 'premium', null]
    },
    targetId: mongoose.Schema.Types.ObjectId,
    actionUrl: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  relatedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  isPushed: {
    type: Boolean,
    default: false
  },
  pushedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

// TTL index - auto-delete after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Static method to create notification
notificationSchema.statics.createNotification = async function(userId, type, title, message, data = {}, relatedUserId = null) {
  return this.create({
    user: userId,
    type,
    title,
    message,
    data,
    relatedUser: relatedUserId
  });
};

// Static method to get notifications for user
notificationSchema.statics.getForUser = function(userId, page = 1, limit = 20) {
  return this.find({ user: userId })
    .populate({
      path: 'relatedUser',
      select: 'username',
      populate: {
        path: 'profile',
        select: 'name photos'
      }
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ user: userId, isRead: false });
};

// Static method to mark all as read
notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    { user: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
};

// Static method to mark single as read
notificationSchema.statics.markAsRead = function(notificationId, userId) {
  return this.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );
};

// Method to mark as pushed
notificationSchema.methods.markAsPushed = async function() {
  this.isPushed = true;
  this.pushedAt = new Date();
  return this.save();
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;

