/**
 * Feedback Model
 * Stores user feedback and support requests
 */

const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['general', 'bug', 'feature', 'safety', 'other'],
    default: 'general'
  },
  subject: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 2000
  },
  status: {
    type: String,
    enum: ['new', 'read', 'in_progress', 'resolved', 'closed'],
    default: 'new'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  // Admin handling
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminNotes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolution: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
}, {
  timestamps: true
});

// Indexes
feedbackSchema.index({ user: 1 });
feedbackSchema.index({ status: 1 });
feedbackSchema.index({ type: 1 });
feedbackSchema.index({ createdAt: -1 });

// Static method to get feedback by status
feedbackSchema.statics.getByStatus = function(status, limit = 50) {
  return this.find({ status })
    .populate('user', 'username email')
    .populate('assignedTo', 'username email')
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit);
};

// Static method to count by status
feedbackSchema.statics.countByStatus = function(status) {
  return this.countDocuments({ status });
};

const Feedback = mongoose.model('Feedback', feedbackSchema);

module.exports = Feedback;

