/**
 * Activity Log Model
 * Tracks all admin actions and system events for audit trail
 */

const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  // Who performed the action
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorType: {
    type: String,
    enum: ['admin', 'system', 'user'],
    default: 'admin'
  },
  // What action was performed
  action: {
    type: String,
    required: true,
    enum: [
      // User actions
      'user_created', 'user_updated', 'user_suspended', 'user_deleted', 'user_restored',
      'premium_granted', 'premium_revoked',
      // Report actions
      'report_created', 'report_resolved', 'report_dismissed',
      // Config actions
      'config_updated', 'feature_flag_updated', 'limit_updated',
      'unrevealed_chat_payment_updated',
      // Content actions
      'content_updated', 'announcement_sent',
      // System actions
      'system_error', 'auto_moderation', 'bulk_action'
    ]
  },
  // What entity was affected
  entityType: {
    type: String,
    enum: ['user', 'report', 'config', 'feedback', 'content', 'system', 'other']
  },
  entityId: mongoose.Schema.Types.ObjectId,
  // Details about the action
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // IP address for security
  ipAddress: String,
  // User agent
  userAgent: String,
  // Result of action
  result: {
    type: String,
    enum: ['success', 'failure', 'partial'],
    default: 'success'
  },
  // Error if any
  error: String,
  // Timestamp
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for fast queries
activityLogSchema.index({ actor: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1 });
activityLogSchema.index({ createdAt: -1 });

// Static method to log activity
activityLogSchema.statics.log = async function(data) {
  try {
    return await this.create(data);
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw - logging should never break the app
    return null;
  }
};

// Static method to get logs with filters
activityLogSchema.statics.getLogs = function(filters = {}, limit = 100, skip = 0) {
  const query = this.find(filters)
    .populate('actor', 'username email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
  
  return query;
};

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;

