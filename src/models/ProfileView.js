/**
 * ProfileView Model
 * Tracks profile views for analytics (premium feature)
 */

const mongoose = require('mongoose');

const profileViewSchema = new mongoose.Schema({
  profile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Profile',
    required: true
  },
  profileOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  viewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  source: {
    type: String,
    enum: ['search', 'discovery_feed', 'profile_link', 'message_request', 'conversation'],
    required: true
  },
  isAnonymous: {
    type: Boolean,
    default: true
  },
  viewDuration: {
    type: Number, // seconds
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
profileViewSchema.index({ profileOwner: 1, createdAt: -1 });
profileViewSchema.index({ viewer: 1 });
profileViewSchema.index({ profile: 1 });
profileViewSchema.index({ createdAt: -1 });

// Compound index to prevent duplicate views within time window
profileViewSchema.index(
  { profile: 1, viewer: 1, createdAt: 1 },
  { 
    unique: true,
    partialFilterExpression: {
      createdAt: { 
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      }
    }
  }
);

// Static method to log a view (with deduplication)
profileViewSchema.statics.logView = async function(profileId, profileOwnerId, viewerId, source, isAnonymous = true) {
  // Check for existing view in last 24 hours
  const recentView = await this.findOne({
    profile: profileId,
    viewer: viewerId,
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
  
  if (recentView) {
    return recentView; // Don't log duplicate
  }
  
  return this.create({
    profile: profileId,
    profileOwner: profileOwnerId,
    viewer: viewerId,
    source,
    isAnonymous
  });
};

// Static method to get viewers for a profile owner (premium feature)
profileViewSchema.statics.getViewersForUser = function(userId, days = 7) {
  const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.find({
    profileOwner: userId,
    createdAt: { $gte: dateLimit }
  })
  .populate({
    path: 'viewer',
    select: 'username',
    populate: {
      path: 'profile',
      select: 'name photos bio'
    }
  })
  .sort({ createdAt: -1 });
};

// Static method to get view count for profile
profileViewSchema.statics.getViewCount = function(profileId, days = 30) {
  const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.countDocuments({
    profile: profileId,
    createdAt: { $gte: dateLimit }
  });
};

// Static method to get view analytics
profileViewSchema.statics.getAnalytics = async function(userId, days = 30) {
  const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const [totalViews, uniqueViewers, viewsBySource, viewsByDay] = await Promise.all([
    // Total views
    this.countDocuments({
      profileOwner: userId,
      createdAt: { $gte: dateLimit }
    }),
    
    // Unique viewers
    this.distinct('viewer', {
      profileOwner: userId,
      createdAt: { $gte: dateLimit }
    }).then(viewers => viewers.length),
    
    // Views by source
    this.aggregate([
      { $match: { profileOwner: new mongoose.Types.ObjectId(userId), createdAt: { $gte: dateLimit } } },
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]),
    
    // Views by day
    this.aggregate([
      { $match: { profileOwner: new mongoose.Types.ObjectId(userId), createdAt: { $gte: dateLimit } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);
  
  return {
    totalViews,
    uniqueViewers,
    viewsBySource: viewsBySource.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {}),
    viewsByDay
  };
};

const ProfileView = mongoose.model('ProfileView', profileViewSchema);

module.exports = ProfileView;

