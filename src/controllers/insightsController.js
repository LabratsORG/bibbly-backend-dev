/**
 * Insights Controller
 * Handles user activity insights and analytics
 */

const Profile = require('../models/Profile');
const ProfileView = require('../models/ProfileView');
const MessageRequest = require('../models/MessageRequest');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * @desc    Get user insights/activity
 * @route   GET /api/v1/insights
 * @access  Private
 */
const getInsights = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dateLimit = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const profile = await Profile.findOne({ user: req.userId });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }


    // Basic stats (available to all)
    const [
      totalViews,
      requestsSent,
      requestsReceived,
      requestsAccepted,
      activeConversations
    ] = await Promise.all([
      profile.viewCount,
      MessageRequest.countDocuments({ sender: req.userId }),
      MessageRequest.countDocuments({ recipient: req.userId }),
      MessageRequest.countDocuments({
        $or: [{ sender: req.userId }, { recipient: req.userId }],
        status: 'accepted'
      }),
      Conversation.countDocuments({
        'participants.user': req.userId,
        status: 'active'
      })
    ]);

    // Calculate acceptance rate
    const acceptanceRate = requestsSent > 0
      ? Math.round((requestsAccepted / requestsSent) * 100)
      : 0;

    // Recent activity (last 30 days)
    const recentViews = await ProfileView.countDocuments({
      profileOwner: req.userId,
      createdAt: { $gte: dateLimit }
    });

    const recentRequests = await MessageRequest.countDocuments({
      recipient: req.userId,
      createdAt: { $gte: dateLimit }
    });

    // Profile score
    const profileScore = calculateProfileScore(profile, {
      views: totalViews,
      requestsReceived,
      acceptanceRate
    });

    const insights = {
      profileScore,
      stats: {
        totalViews,
        recentViews,
        requestsSent,
        requestsReceived,
        recentRequests,
        requestsAccepted,
        acceptanceRate,
        activeConversations
      },
    };

    // Detailed analytics
    {
      // Views by day
      const viewsByDay = await ProfileView.aggregate([
        {
          $match: {
            profileOwner: user._id,
            createdAt: { $gte: dateLimit }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Views by source
      const viewsBySource = await ProfileView.aggregate([
        {
          $match: {
            profileOwner: user._id,
            createdAt: { $gte: dateLimit }
          }
        },
        {
          $group: {
            _id: '$source',
            count: { $sum: 1 }
          }
        }
      ]);

      // Popular interests among viewers
      const viewerProfiles = await ProfileView.find({
        profileOwner: req.userId,
        createdAt: { $gte: dateLimit }
      }).distinct('viewer');

      const viewerInterests = await Profile.aggregate([
        { $match: { user: { $in: viewerProfiles } } },
        { $unwind: '$interests' },
        { $group: { _id: '$interests', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      insights.detailed = {
        viewsByDay,
        viewsBySource: viewsBySource.reduce((acc, v) => {
          acc[v._id] = v.count;
          return acc;
        }, {}),
        viewerInterests: viewerInterests.map(i => i._id)
      };
    }

    return ApiResponse.success(res, insights);

  } catch (error) {
    logger.error('Get insights error:', error);
    return ApiResponse.error(res, 'Error fetching insights');
  }
};

/**
 * @desc    Get profile score breakdown
 * @route   GET /api/v1/insights/score
 * @access  Private
 */
const getProfileScore = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.userId });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    const breakdown = {
      profileCompleteness: {
        isComplete: profile.isComplete,
        tips: getProfileTips(profile)
      },
      photos: {
        count: profile.photos?.length || 0,
        maxCount: 4,
        score: Math.round((profile.photos?.length || 0) / 4 * 25),
        tips: profile.photos?.length < 4 ? ['Add more photos to increase visibility'] : []
      },
      bio: {
        hasContent: !!profile.bio,
        length: profile.bio?.length || 0,
        score: profile.bio?.length >= 50 ? 15 : profile.bio?.length > 0 ? 8 : 0,
        tips: !profile.bio ? ['Add a bio to tell people about yourself'] : 
              profile.bio.length < 50 ? ['Write a longer bio for better engagement'] : []
      },
      interests: {
        count: profile.interests?.length || 0,
        score: Math.min((profile.interests?.length || 0) * 2, 10),
        tips: (profile.interests?.length || 0) < 3 ? ['Add more interests to find like-minded people'] : []
      },
      prompts: {
        answered: profile.promptAnswers?.length || 0,
        score: Math.min((profile.promptAnswers?.length || 0) * 5, 10),
        tips: (profile.promptAnswers?.length || 0) < 2 ? ['Answer prompts to showcase your personality'] : []
      }
    };

    const totalScore = breakdown.profileCompleteness.score;

    return ApiResponse.success(res, {
      totalScore,
      breakdown,
      grade: getGrade(totalScore)
    });

  } catch (error) {
    logger.error('Get profile score error:', error);
    return ApiResponse.error(res, 'Error fetching profile score');
  }
};

/**
 * @desc    Get popular interests
 * @route   GET /api/v1/insights/interests
 * @access  Private
 */
const getPopularInterests = async (req, res) => {
  try {
    const interests = await Profile.aggregate([
      { $match: { isComplete: true, isBanned: false } },
      { $unwind: '$interests' },
      { $group: { _id: '$interests', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);

    return ApiResponse.success(res, {
      interests: interests.map(i => ({
        name: i._id,
        count: i.count
      }))
    });

  } catch (error) {
    logger.error('Get popular interests error:', error);
    return ApiResponse.error(res, 'Error fetching interests');
  }
};

// Helper functions
function calculateProfileScore(profile, stats) {
  let score = 0;
  
  // Bonus for engagement
  if (stats.views > 100) score += 10;
  else if (stats.views > 50) score += 5;
  
  if (stats.requestsReceived > 10) score += 10;
  else if (stats.requestsReceived > 5) score += 5;
  
  if (stats.acceptanceRate > 50) score += 5;
  
  return Math.min(score, 100);
}

function getProfileTips(profile) {
  const tips = [];
  
  if (!profile.photos || profile.photos.length < 4) {
    tips.push('Add more photos to get more visibility');
  }
  if (!profile.bio || profile.bio.length < 50) {
    tips.push('Write a longer bio to tell people about yourself');
  }
  if (!profile.interests || profile.interests.length < 3) {
    tips.push('Add more interests to match with like-minded people');
  }
  if (!profile.whyOnApp) {
    tips.push('Tell people why you\'re on bibbly');
  }
  if (!profile.lookingFor) {
    tips.push('Share what you\'re looking for');
  }
  if (!profile.promptAnswers || profile.promptAnswers.length < 2) {
    tips.push('Answer prompts to showcase your personality');
  }
  
  return tips;
}

function getGrade(score) {
  if (score >= 90) return { letter: 'A+', description: 'Outstanding!' };
  if (score >= 80) return { letter: 'A', description: 'Excellent' };
  if (score >= 70) return { letter: 'B', description: 'Good' };
  if (score >= 60) return { letter: 'C', description: 'Average' };
  if (score >= 50) return { letter: 'D', description: 'Needs work' };
  return { letter: 'F', description: 'Incomplete' };
}

module.exports = {
  getInsights,
  getProfileScore,
  getPopularInterests
};

