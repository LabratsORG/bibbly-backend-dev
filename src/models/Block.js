/**
 * Block Model
 * Handles user blocking functionality
 */

const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema({
  blocker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  blocked: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reason: {
    type: String,
    enum: ['harassment', 'spam', 'inappropriate', 'fake_profile', 'other', 'not_specified'],
    default: 'not_specified'
  },
  additionalNotes: {
    type: String,
    maxlength: 500
  },
  // Source of block (from which screen/feature)
  source: {
    type: String,
    enum: ['chat', 'profile', 'request', 'search', 'feed'],
    default: 'profile'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for unique block relationship
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
blockSchema.index({ blocker: 1 });
blockSchema.index({ blocked: 1 });

// Static method to check if user is blocked
blockSchema.statics.isBlocked = async function(blockerId, blockedId) {
  const block = await this.findOne({
    blocker: blockerId,
    blocked: blockedId
  });
  return !!block;
};

// Static method to check if either user has blocked the other
blockSchema.statics.hasBlockBetween = async function(userId1, userId2) {
  const block = await this.findOne({
    $or: [
      { blocker: userId1, blocked: userId2 },
      { blocker: userId2, blocked: userId1 }
    ]
  });
  return !!block;
};

// Static method to get blocked users by a user
blockSchema.statics.getBlockedByUser = function(userId) {
  return this.find({ blocker: userId })
    .populate({
      path: 'blocked',
      select: 'username',
      populate: {
        path: 'profile',
        select: 'name photos'
      }
    })
    .sort({ createdAt: -1 });
};

// Static method to get list of blocked user IDs
blockSchema.statics.getBlockedUserIds = async function(userId) {
  const blocks = await this.find({ blocker: userId }).select('blocked');
  return blocks.map(b => b.blocked);
};

// Static method to get users who blocked this user
blockSchema.statics.getBlockersOfUser = async function(userId) {
  const blocks = await this.find({ blocked: userId }).select('blocker');
  return blocks.map(b => b.blocker);
};

// Static method to get all blocked and blocking user IDs (for filtering)
blockSchema.statics.getAllBlockRelatedUserIds = async function(userId) {
  const [blocked, blockers] = await Promise.all([
    this.getBlockedUserIds(userId),
    this.getBlockersOfUser(userId)
  ]);
  return [...new Set([...blocked.map(id => id.toString()), ...blockers.map(id => id.toString())])];
};

const Block = mongoose.model('Block', blockSchema);

module.exports = Block;

