/**
 * Premium Controller
 * Handles premium subscription features
 */

const User = require('../models/User');
const Profile = require('../models/Profile');
const ProfileView = require('../models/ProfileView');
const MessageRequest = require('../models/MessageRequest');
const Notification = require('../models/Notification');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Premium Plans Configuration
 */
const PREMIUM_PLANS = {
  monthly: {
    id: 'monthly',
    name: 'Premium Monthly',
    price: 999, // in cents
    duration: 30, // days
    features: [
      'See who viewed your profile',
      'Unlimited message requests',
      'Priority requests',
      'Early identity reveal',
      'No daily limits'
    ]
  },
  yearly: {
    id: 'yearly',
    name: 'Premium Yearly',
    price: 7999, // in cents
    duration: 365,
    savings: '33% off',
    features: [
      'All monthly features',
      'Best value',
      'Priority support'
    ]
  },
  lifetime: {
    id: 'lifetime',
    name: 'Premium Lifetime',
    price: 19999, // in cents
    duration: null,
    features: [
      'All features forever',
      'One-time payment',
      'Lifetime updates'
    ]
  }
};

/**
 * @desc    Get premium plans
 * @route   GET /api/v1/premium/plans
 * @access  Public
 */
const getPlans = async (req, res) => {
  try {
    const AppConfig = require('../models/AppConfig');
    const config = await AppConfig.getConfig();
    
    return ApiResponse.success(res, { 
      plans: Object.values(PREMIUM_PLANS),
      isPremiumEnabled: config.isPremiumEnabled,
      premiumComingSoonMessage: config.premiumComingSoonMessage
    });
  } catch (error) {
    logger.error('Get plans error:', error);
    return ApiResponse.error(res, 'Error fetching plans');
  }
};

/**
 * @desc    Get premium status
 * @route   GET /api/v1/premium/status
 * @access  Private
 */
const getPremiumStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const AppConfig = require('../models/AppConfig');
    const config = await AppConfig.getConfig();

    const isPremium = user.checkPremiumStatus();
    const isPremiumEnabled = config.isPremiumEnabled;

    return ApiResponse.success(res, {
      isPremium,
      isPremiumEnabled,
      plan: user.premiumPlan,
      expiresAt: user.premiumExpiresAt,
      features: isPremium && isPremiumEnabled ? PREMIUM_PLANS[user.premiumPlan]?.features : []
    });

  } catch (error) {
    logger.error('Get premium status error:', error);
    return ApiResponse.error(res, 'Error fetching premium status');
  }
};

/**
 * @desc    Activate premium (after payment verification)
 * @route   POST /api/v1/premium/activate
 * @access  Private
 * @note    In production, this should verify payment with payment provider
 */
const activatePremium = async (req, res) => {
  try {
    const { planId, paymentId } = req.body;

    const plan = PREMIUM_PLANS[planId];
    if (!plan) {
      return ApiResponse.badRequest(res, 'Invalid plan');
    }

    // TODO: Verify payment with payment provider (Stripe, Razorpay, etc.)
    // const paymentVerified = await verifyPayment(paymentId);
    // if (!paymentVerified) {
    //   return ApiResponse.badRequest(res, 'Payment verification failed');
    // }

    const user = await User.findById(req.userId);

    // Calculate expiry
    let expiresAt = null;
    if (plan.duration) {
      const currentExpiry = user.premiumExpiresAt && user.premiumExpiresAt > new Date()
        ? user.premiumExpiresAt
        : new Date();
      expiresAt = new Date(currentExpiry.getTime() + plan.duration * 24 * 60 * 60 * 1000);
    }

    // Update user
    user.isPremium = true;
    user.premiumPlan = planId;
    user.premiumExpiresAt = expiresAt;
    user.role = 'premium';
    await user.save();

    // Create notification
    await Notification.createNotification(
      req.userId,
      'system',
      'Premium Activated! 🎉',
      `Your ${plan.name} subscription is now active!`,
      { targetType: 'premium' }
    );

    logger.info(`Premium activated for user ${req.userId}: ${planId}`);

    return ApiResponse.success(res, {
      isPremium: true,
      plan: planId,
      expiresAt,
      features: plan.features
    }, 'Premium activated successfully');

  } catch (error) {
    logger.error('Activate premium error:', error);
    return ApiResponse.error(res, 'Error activating premium');
  }
};

/**
 * @desc    Cancel premium subscription
 * @route   POST /api/v1/premium/cancel
 * @access  Private
 */
const cancelPremium = async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user.isPremium) {
      return ApiResponse.badRequest(res, 'No active subscription');
    }

    // Don't immediately remove - let it expire
    // In production, cancel recurring billing

    await Notification.createNotification(
      req.userId,
      'system',
      'Subscription Cancelled',
      `Your premium subscription will expire on ${user.premiumExpiresAt?.toLocaleDateString() || 'end of billing period'}.`,
      { targetType: 'premium' }
    );

    logger.info(`Premium cancelled for user ${req.userId}`);

    return ApiResponse.success(res, {
      cancelled: true,
      expiresAt: user.premiumExpiresAt,
      message: 'Your subscription has been cancelled. You will retain premium access until the expiry date.'
    });

  } catch (error) {
    logger.error('Cancel premium error:', error);
    return ApiResponse.error(res, 'Error cancelling subscription');
  }
};

/**
 * @desc    Get app config (public - for checking if premium is enabled)
 * @route   GET /api/v1/premium/config
 * @access  Public
 */
const getAppConfig = async (req, res) => {
  try {
    const AppConfig = require('../models/AppConfig');
    const config = await AppConfig.getConfig();
    
    return ApiResponse.success(res, {
      isPremiumEnabled: config.isPremiumEnabled,
      premiumComingSoonMessage: config.premiumComingSoonMessage
    });
  } catch (error) {
    logger.error('Get app config error:', error);
    return ApiResponse.error(res, 'Error fetching app config');
  }
};

/**
 * @desc    Get premium features/benefits
 * @route   GET /api/v1/premium/features
 * @access  Public
 */
const getFeatures = async (req, res) => {
  try {
    const AppConfig = require('../models/AppConfig');
    const config = await AppConfig.getConfig();
    
    // If premium is disabled, return empty features list
    if (!config.isPremiumEnabled) {
      return ApiResponse.success(res, {
        isPremiumEnabled: false,
        features: [],
        message: config.premiumComingSoonMessage
      });
    }
    
    const features = [
      {
        id: 'profile_viewers',
        title: 'See Profile Viewers',
        description: 'Know who checked out your profile',
        icon: '👀',
        freeLimit: 0,
        premiumLimit: 'Unlimited'
      },
      {
        id: 'message_requests',
        title: 'Unlimited Requests',
        description: 'Send as many message requests as you want',
        icon: '💬',
        freeLimit: 5,
        premiumLimit: 'Unlimited'
      },
      {
        id: 'priority_requests',
        title: 'Priority Requests',
        description: 'Your requests appear at the top',
        icon: '⭐',
        freeLimit: false,
        premiumLimit: true
      },
      {
        id: 'discovery',
        title: 'Unlimited Discovery',
        description: 'No daily limits on profile browsing',
        icon: '🔍',
        freeLimit: 50,
        premiumLimit: 'Unlimited'
      },
      {
        id: 'reveal',
        title: 'Early Reveal',
        description: 'Reveal your identity anytime',
        icon: '🎭',
        freeLimit: 1,
        premiumLimit: 'Unlimited'
      }
    ];

    return ApiResponse.success(res, { 
      isPremiumEnabled: config.isPremiumEnabled,
      features: config.isPremiumEnabled ? features : [],
      message: !config.isPremiumEnabled ? config.premiumComingSoonMessage : undefined
    });

  } catch (error) {
    logger.error('Get features error:', error);
    return ApiResponse.error(res, 'Error fetching features');
  }
};

/**
 * @desc    Get premium insights (viewers, stats)
 * @route   GET /api/v1/premium/insights
 * @access  Private (Premium)
 */
const getPremiumInsights = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user.checkPremiumStatus()) {
      return ApiResponse.forbidden(res, 'Premium subscription required');
    }

    const { days = 7 } = req.query;
    const dateLimit = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    // Get profile viewers
    const viewers = await ProfileView.find({
      profileOwner: req.userId,
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
    .sort({ createdAt: -1 })
    .limit(50);

    // Get analytics
    const analytics = await ProfileView.getAnalytics(req.userId, parseInt(days));

    // Get request stats
    const [requestsSent, requestsReceived, requestsAccepted] = await Promise.all([
      MessageRequest.countDocuments({
        sender: req.userId,
        createdAt: { $gte: dateLimit }
      }),
      MessageRequest.countDocuments({
        recipient: req.userId,
        createdAt: { $gte: dateLimit }
      }),
      MessageRequest.countDocuments({
        $or: [{ sender: req.userId }, { recipient: req.userId }],
        status: 'accepted',
        createdAt: { $gte: dateLimit }
      })
    ]);

    return ApiResponse.success(res, {
      viewers,
      analytics,
      requestStats: {
        sent: requestsSent,
        received: requestsReceived,
        accepted: requestsAccepted,
        acceptanceRate: requestsSent > 0 
          ? Math.round((requestsAccepted / requestsSent) * 100) 
          : 0
      }
    });

  } catch (error) {
    logger.error('Get premium insights error:', error);
    return ApiResponse.error(res, 'Error fetching insights');
  }
};

module.exports = {
  getAppConfig,
  getPlans,
  getPremiumStatus,
  activatePremium,
  cancelPremium,
  getFeatures,
  getPremiumInsights
};

