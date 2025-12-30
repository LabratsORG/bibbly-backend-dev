/**
 * Purchased Pack Model
 * Tracks micro-payment purchases (request packs)
 */

const mongoose = require('mongoose');

const purchasedPackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  packId: {
    type: String,
    required: true
  },
  packName: String,
  requestCount: {
    type: Number,
    required: true
  },
  requestsUsed: {
    type: Number,
    default: 0
  },
  requestsRemaining: {
    type: Number,
    required: true
  },
  pricePaid: {
    type: Number,
    required: true // in paisa
  },
  orderId: String, // Razorpay order ID
  paymentId: String, // Razorpay payment ID
  paymentMethod: {
    type: String,
    enum: ['razorpay', 'upi', 'card', 'wallet', 'free'],
    default: 'razorpay'
  },
  status: {
    type: String,
    enum: ['active', 'exhausted', 'expired', 'refunded', 'failed'],
    default: 'active'
  },
  refundId: String, // Razorpay refund ID
  refundAmount: Number, // Refund amount in paisa
  failureReason: String, // Reason for failure if status is failed
  expiresAt: {
    type: Date,
    default: function() {
      // Packs expire in 30 days
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  },
  purchasedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
purchasedPackSchema.index({ user: 1, status: 1 });
purchasedPackSchema.index({ user: 1, expiresAt: 1 });
purchasedPackSchema.index({ purchasedAt: -1 });

// Virtual for checking if expired
purchasedPackSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Method to use requests from pack
purchasedPackSchema.methods.useRequests = async function(count = 1) {
  if (this.status !== 'active') {
    throw new Error('Pack is not active');
  }
  
  if (this.requestsRemaining < count) {
    throw new Error('Not enough requests in pack');
  }
  
  this.requestsUsed += count;
  this.requestsRemaining -= count;
  
  if (this.requestsRemaining === 0) {
    this.status = 'exhausted';
  }
  
  return this.save();
};

// Static method to get user's active packs
purchasedPackSchema.statics.getActivePacks = function(userId) {
  return this.find({
    user: userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  }).sort({ expiresAt: 1 }); // Use oldest first
};

// Static method to get total remaining requests for user
purchasedPackSchema.statics.getTotalRemainingRequests = async function(userId) {
  const result = await this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: 'active',
        expiresAt: { $gt: new Date() }
      }
    },
    {
      $group: {
        _id: null,
        totalRemaining: { $sum: '$requestsRemaining' }
      }
    }
  ]);
  
  return result.length > 0 ? result[0].totalRemaining : 0;
};

// Static method to use requests from user's packs
purchasedPackSchema.statics.useFromPacks = async function(userId, count = 1) {
  const packs = await this.getActivePacks(userId);
  
  let remaining = count;
  
  for (const pack of packs) {
    if (remaining <= 0) break;
    
    const toUse = Math.min(remaining, pack.requestsRemaining);
    await pack.useRequests(toUse);
    remaining -= toUse;
  }
  
  if (remaining > 0) {
    throw new Error('Not enough purchased requests');
  }
  
  return true;
};

// Static method to expire old packs
purchasedPackSchema.statics.expireOldPacks = async function() {
  return this.updateMany(
    {
      status: 'active',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
};

const PurchasedPack = mongoose.model('PurchasedPack', purchasedPackSchema);

module.exports = PurchasedPack;

