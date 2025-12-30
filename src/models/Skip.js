/**
 * Skip Model
 * Tracks skipped profiles in discovery feed
 */

const mongoose = require('mongoose');

const skipSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  skippedProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  skippedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 7 * 24 * 60 * 60 // Auto-delete after 7 days (allow profile to reappear)
  }
}, {
  timestamps: true
});

// Compound index for unique skip relationship
skipSchema.index({ user: 1, skippedProfile: 1 }, { unique: true });
skipSchema.index({ user: 1, createdAt: -1 });

// Static method to get skipped profile IDs for user
skipSchema.statics.getSkippedProfileIds = async function(userId) {
  const skips = await this.find({ user: userId }).select('skippedProfile');
  return skips.map(s => s.skippedProfile);
};

// Static method to get skipped user IDs
skipSchema.statics.getSkippedUserIds = async function(userId) {
  const skips = await this.find({ user: userId }).select('skippedUser');
  return skips.map(s => s.skippedUser);
};

// Static method to check if profile is skipped
skipSchema.statics.isSkipped = async function(userId, profileId) {
  const skip = await this.findOne({ user: userId, skippedProfile: profileId });
  return !!skip;
};

const Skip = mongoose.model('Skip', skipSchema);

module.exports = Skip;

