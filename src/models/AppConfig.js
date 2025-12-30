/**
 * App Configuration Model
 * Global settings for the app - managed by admin
 */

const mongoose = require('mongoose');

const premiumFeatureSchema = new mongoose.Schema({
  featureId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  isEnabled: {
    type: Boolean,
    default: false
  },
  freeLimit: {
    type: Number,
    default: 0
  },
  premiumLimit: {
    type: Number,
    default: -1 // -1 means unlimited
  },
  category: {
    type: String,
    enum: ['messaging', 'discovery', 'profile', 'privacy', 'analytics'],
    default: 'messaging'
  }
}, { _id: false });

const microPaymentSchema = new mongoose.Schema({
  isEnabled: {
    type: Boolean,
    default: true
  },
  // Request packs configuration
  requestPacks: [{
    packId: {
      type: String,
      required: true
    },
    name: String,
    requestCount: {
      type: Number,
      required: true
    },
    priceInPaisa: {
      type: Number,
      required: true
    },
    priceDisplay: String, // "₹2"
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  // Daily free limits
  dailyFreeRequests: {
    type: Number,
    default: 2
  },
  dailyFreeDiscovery: {
    type: Number,
    default: 50
  },
  dailyFreeReveals: {
    type: Number,
    default: 1
  },
  // Unrevealed chat message payment settings
  // When a user hasn't revealed their identity, they need to pay after X free messages
  unrevealedChatPayment: {
    isEnabled: {
      type: Boolean,
      default: true
    },
    // Number of free messages before payment required
    freeMessageLimit: {
      type: Number,
      default: 100
    },
    // Price per message after limit (in paisa)
    pricePerMessageInPaisa: {
      type: Number,
      default: 200 // ₹2
    },
    // Display price
    priceDisplay: {
      type: String,
      default: '₹2'
    }
  }
}, { _id: false });

const premiumPlanSchema = new mongoose.Schema({
  planId: {
    type: String,
    required: true
  },
  name: String,
  priceInPaisa: Number,
  priceDisplay: String,
  durationDays: Number,
  features: [String],
  isActive: {
    type: Boolean,
    default: false
  },
  savings: String
}, { _id: false });

const appConfigSchema = new mongoose.Schema({
  // Singleton identifier
  configId: {
    type: String,
    default: 'main',
    unique: true
  },
  
  // App Info
  appName: {
    type: String,
    default: 'bibbly'
  },
  appVersion: {
    type: String,
    default: '1.0.0'
  },
  maintenanceMode: {
    type: Boolean,
    default: false
  },
  maintenanceMessage: {
    type: String,
    default: 'App is under maintenance. Please try again later.'
  },
  
  // ========== PREMIUM MASTER SWITCH ==========
  isPremiumEnabled: {
    type: Boolean,
    default: false // Currently FREE - no premium features
  },
  premiumComingSoonMessage: {
    type: String,
    default: 'Premium features coming soon! Stay tuned.'
  },
  
  // ========== PREMIUM FEATURES LIST ==========
  premiumFeatures: {
    type: [premiumFeatureSchema],
    default: [
      {
        featureId: 'profile_viewers',
        name: 'See Profile Viewers',
        description: 'See who viewed your profile',
        isEnabled: false,
        freeLimit: 0,
        premiumLimit: -1,
        category: 'analytics'
      },
      {
        featureId: 'unlimited_requests',
        name: 'Unlimited Message Requests',
        description: 'Send unlimited message requests per day',
        isEnabled: false,
        freeLimit: 2,
        premiumLimit: -1,
        category: 'messaging'
      },
      {
        featureId: 'priority_requests',
        name: 'Priority Requests',
        description: 'Your requests appear at the top',
        isEnabled: false,
        freeLimit: 0,
        premiumLimit: -1,
        category: 'messaging'
      },
      {
        featureId: 'unlimited_discovery',
        name: 'Unlimited Discovery',
        description: 'No daily limits on profile browsing',
        isEnabled: false,
        freeLimit: 50,
        premiumLimit: -1,
        category: 'discovery'
      },
      {
        featureId: 'early_reveal',
        name: 'Early Identity Reveal',
        description: 'Reveal your identity anytime',
        isEnabled: false,
        freeLimit: 1,
        premiumLimit: -1,
        category: 'privacy'
      },
      {
        featureId: 'advanced_filters',
        name: 'Advanced Search Filters',
        description: 'More filter options in search',
        isEnabled: false,
        freeLimit: 0,
        premiumLimit: 1,
        category: 'discovery'
      },
      {
        featureId: 'read_receipts',
        name: 'Read Receipts',
        description: 'See when messages are read',
        isEnabled: false,
        freeLimit: 0,
        premiumLimit: 1,
        category: 'messaging'
      },
      {
        featureId: 'profile_boost',
        name: 'Profile Boost',
        description: 'Get more visibility in discovery',
        isEnabled: false,
        freeLimit: 0,
        premiumLimit: 1,
        category: 'profile'
      }
    ]
  },
  
  // ========== PREMIUM PLANS (for future) ==========
  premiumPlans: {
    type: [premiumPlanSchema],
    default: [
      {
        planId: 'monthly',
        name: 'Premium Monthly',
        priceInPaisa: 29900, // ₹299
        priceDisplay: '₹299',
        durationDays: 30,
        features: ['profile_viewers', 'unlimited_requests', 'priority_requests', 'unlimited_discovery', 'early_reveal'],
        isActive: false
      },
      {
        planId: 'yearly',
        name: 'Premium Yearly',
        priceInPaisa: 199900, // ₹1999
        priceDisplay: '₹1,999',
        durationDays: 365,
        features: ['profile_viewers', 'unlimited_requests', 'priority_requests', 'unlimited_discovery', 'early_reveal', 'advanced_filters', 'read_receipts'],
        isActive: false,
        savings: '44% off'
      },
      {
        planId: 'lifetime',
        name: 'Premium Lifetime',
        priceInPaisa: 499900, // ₹4999
        priceDisplay: '₹4,999',
        durationDays: null,
        features: ['profile_viewers', 'unlimited_requests', 'priority_requests', 'unlimited_discovery', 'early_reveal', 'advanced_filters', 'read_receipts', 'profile_boost'],
        isActive: false
      }
    ]
  },
  
  // ========== MICRO-PAYMENTS (Pay per use) ==========
  microPayments: {
    type: microPaymentSchema,
    default: {
      isEnabled: true, // This is enabled even when premium is off
      requestPacks: [
        {
          packId: 'pack_10',
          name: '10 Extra Requests',
          requestCount: 10,
          priceInPaisa: 200, // ₹2
          priceDisplay: '₹2',
          isActive: true
        },
        {
          packId: 'pack_25',
          name: '25 Extra Requests',
          requestCount: 25,
          priceInPaisa: 400, // ₹4
          priceDisplay: '₹4',
          isActive: true
        },
        {
          packId: 'pack_50',
          name: '50 Extra Requests',
          requestCount: 50,
          priceInPaisa: 700, // ₹7
          priceDisplay: '₹7',
          isActive: true
        }
      ],
      dailyFreeRequests: 2,
      dailyFreeDiscovery: 50,
      dailyFreeReveals: 1,
      // Unrevealed chat message payment
      unrevealedChatPayment: {
        isEnabled: true,
        freeMessageLimit: 100, // Free messages before payment required
        pricePerMessageInPaisa: 200, // ₹2 per message
        priceDisplay: '₹2'
      }
    }
  },
  
  // ========== GENERAL LIMITS ==========
  limits: {
    maxPhotos: {
      type: Number,
      default: 4
    },
    maxBioLength: {
      type: Number,
      default: 500
    },
    maxMessageLength: {
      type: Number,
      default: 2000
    },
    requestExpiryDays: {
      type: Number,
      default: 7
    },
    maxInterests: {
      type: Number,
      default: 10
    }
  },
  
  // ========== CONTENT MODERATION ==========
  moderation: {
    autoSuspendReportCount: {
      type: Number,
      default: 5
    },
    enableAIModeration: {
      type: Boolean,
      default: false
    },
    bannedWords: [{
      type: String
    }]
  },
  
  // ========== SUPPORT CONTENT ==========
  supportContent: {
    helpFAQ: {
      type: String,
      default: 'Help & FAQ content will be available soon. Please contact support for assistance.'
    },
    safetyGuidelines: {
      type: String,
      default: 'Safety guidelines will be available soon. Please stay safe and report any concerns.'
    }
  },
  
  // ========== LEGAL CONTENT ==========
  legalContent: {
    termsOfService: {
      type: String,
      default: 'Terms of Service will be available soon.'
    },
    privacyPolicy: {
      type: String,
      default: 'Privacy Policy will be available soon.'
    },
    communityGuidelines: {
      type: String,
      default: 'Community Guidelines will be available soon.'
    }
  },
  
  // ========== FEATURE FLAGS ==========
  featureFlags: {
    enableGoogleAuth: {
      type: Boolean,
      default: true
    },
    enableAnonymousMessaging: {
      type: Boolean,
      default: true
    },
    enableIdentityReveal: {
      type: Boolean,
      default: true
    },
    enableSearch: {
      type: Boolean,
      default: true
    },
    enableDiscovery: {
      type: Boolean,
      default: true
    },
    enableNotifications: {
      type: Boolean,
      default: true
    },
    enableProfileSharing: {
      type: Boolean,
      default: true
    },
    enableEmailSending: {
      type: Boolean,
      default: true
    }
  },
  
  // Metadata
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure only one config document exists
appConfigSchema.index({ configId: 1 }, { unique: true });

// Static method to get config (creates default if not exists)
appConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne({ configId: 'main' });
  let needsSave = false;
  
  if (!config) {
    config = await this.create({ configId: 'main' });
  }
  
  // Ensure supportContent and legalContent exist
  if (!config.supportContent) {
    config.supportContent = {
      helpFAQ: 'Help & FAQ content will be available soon. Please contact support for assistance.',
      safetyGuidelines: 'Safety guidelines will be available soon. Please stay safe and report any concerns.'
    };
    needsSave = true;
  }
  
  if (!config.legalContent) {
    config.legalContent = {
      termsOfService: 'Terms of Service will be available soon.',
      privacyPolicy: 'Privacy Policy will be available soon.',
      communityGuidelines: 'Community Guidelines will be available soon.'
    };
    needsSave = true;
  }
  
  // Ensure microPayments exists with defaults
  if (!config.microPayments) {
    config.microPayments = {
      isEnabled: true,
      requestPacks: [],
      dailyFreeRequests: 2,
      dailyFreeDiscovery: 50,
      dailyFreeReveals: 1,
      unrevealedChatPayment: {
        isEnabled: true,
        freeMessageLimit: 100,
        pricePerMessageInPaisa: 200,
        priceDisplay: '₹2'
      }
    };
    needsSave = true;
  }
  
  // Ensure unrevealedChatPayment exists within microPayments
  if (!config.microPayments.unrevealedChatPayment) {
    config.microPayments.unrevealedChatPayment = {
      isEnabled: true,
      freeMessageLimit: 100,
      pricePerMessageInPaisa: 200,
      priceDisplay: '₹2'
    };
    needsSave = true;
  }
  
  // Save if we added missing fields
  if (needsSave && !config.isNew) {
    await config.save();
  }
  
  return config;
};

// Static method to update config
appConfigSchema.statics.updateConfig = async function(updates, adminId) {
  const config = await this.findOneAndUpdate(
    { configId: 'main' },
    { 
      ...updates, 
      lastUpdatedBy: adminId,
      updatedAt: new Date()
    },
    { new: true, upsert: true }
  );
  return config;
};

// Method to check if a premium feature is enabled
appConfigSchema.methods.isFeatureEnabled = function(featureId) {
  if (!this.isPremiumEnabled) return false;
  
  const feature = this.premiumFeatures.find(f => f.featureId === featureId);
  return feature ? feature.isEnabled : false;
};

// Method to get feature limit
appConfigSchema.methods.getFeatureLimit = function(featureId, isPremiumUser = false) {
  const feature = this.premiumFeatures.find(f => f.featureId === featureId);
  
  if (!feature) return 0;
  
  // If premium is not enabled globally, return free limit
  if (!this.isPremiumEnabled) {
    return feature.freeLimit;
  }
  
  // If user is premium and feature is enabled
  if (isPremiumUser && feature.isEnabled) {
    return feature.premiumLimit; // -1 means unlimited
  }
  
  return feature.freeLimit;
};

// Method to get daily free request limit
appConfigSchema.methods.getDailyFreeRequests = function() {
  return this.microPayments?.dailyFreeRequests || 2;
};

// Method to get active request packs
appConfigSchema.methods.getActiveRequestPacks = function() {
  if (!this.microPayments?.isEnabled) return [];
  return this.microPayments.requestPacks.filter(p => p.isActive);
};

const AppConfig = mongoose.model('AppConfig', appConfigSchema);

module.exports = AppConfig;

