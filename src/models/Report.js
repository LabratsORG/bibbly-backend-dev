/**
 * Report Model
 * Handles user reporting for safety and moderation
 */

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedContent: {
    type: {
      type: String,
      enum: ['profile', 'message', 'photo', 'conversation'],
      required: true
    },
    contentId: mongoose.Schema.Types.ObjectId,
    contentSnapshot: String // Store content at time of report
  },
  reason: {
    type: String,
    enum: [
      'harassment',
      'hate_speech',
      'inappropriate_content',
      'spam',
      'fake_profile',
      'underage',
      'scam',
      'violence',
      'self_harm',
      'impersonation',
      'other'
    ],
    required: true
  },
  description: {
    type: String,
    maxlength: 1000
  },
  evidence: [{
    type: {
      type: String,
      enum: ['screenshot', 'message_id', 'url']
    },
    data: String
  }],
  status: {
    type: String,
    enum: ['pending', 'reviewing', 'resolved', 'dismissed', 'escalated'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  // Admin handling
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  resolution: {
    action: {
      type: String,
      enum: ['no_action', 'warning', 'content_removed', 'temporary_ban', 'permanent_ban']
    },
    notes: String,
    resolvedAt: Date
  },
  // Auto-action triggered
  autoActionTaken: {
    type: Boolean,
    default: false
  },
  autoActionDetails: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
}, {
  timestamps: true
});

// Indexes
reportSchema.index({ reporter: 1 });
reportSchema.index({ reportedUser: 1 });
reportSchema.index({ status: 1 });
reportSchema.index({ priority: 1, status: 1 });
reportSchema.index({ createdAt: -1 });

// Pre-save middleware to set priority
reportSchema.pre('save', function(next) {
  // Set high priority for serious reports
  const highPriorityReasons = ['underage', 'violence', 'self_harm'];
  const criticalReasons = ['underage'];
  
  if (criticalReasons.includes(this.reason)) {
    this.priority = 'critical';
  } else if (highPriorityReasons.includes(this.reason)) {
    this.priority = 'high';
  }
  
  next();
});

// Static method to get pending reports
reportSchema.statics.getPendingReports = function(limit = 50) {
  return this.find({ status: 'pending' })
    .populate('reporter', 'username email')
    .populate({
      path: 'reportedUser',
      select: 'username email accountStatus',
      populate: { path: 'profile', select: 'name photos' }
    })
    .sort({ priority: -1, createdAt: 1 })
    .limit(limit);
};

// Static method to count reports against a user
reportSchema.statics.countReportsAgainstUser = function(userId) {
  return this.countDocuments({ reportedUser: userId });
};

// Static method to get report history by reporter
reportSchema.statics.getByReporter = function(userId) {
  return this.find({ reporter: userId })
    .select('reportedUser reason status createdAt')
    .sort({ createdAt: -1 });
};

// Static method to check if user already reported
reportSchema.statics.hasReported = async function(reporterId, reportedUserId, contentType, contentId) {
  const report = await this.findOne({
    reporter: reporterId,
    reportedUser: reportedUserId,
    'reportedContent.type': contentType,
    'reportedContent.contentId': contentId
  });
  return !!report;
};

// Method to resolve report
reportSchema.methods.resolve = async function(adminId, action, notes = '') {
  this.status = 'resolved';
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  this.resolution = {
    action,
    notes,
    resolvedAt: new Date()
  };
  return this.save();
};

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;

