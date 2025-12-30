/**
 * Profile Model
 * User dating profile with photos, bio, interests, etc.
 */

const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  publicId: String,
  order: {
    type: Number,
    default: 0
  },
  isMain: {
    type: Boolean,
    default: false
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const promptAnswerSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  answer: {
    type: String,
    required: true,
    maxlength: [500, 'Answer cannot exceed 500 characters']
  }
}, { _id: true });

const profileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  alias: {
    type: String,
    trim: true,
    maxlength: [30, 'Alias cannot exceed 30 characters']
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  age: {
    type: Number,
    min: [18, 'You must be at least 18 years old'],
    max: [100, 'Please enter a valid age']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'],
    required: [true, 'Gender is required']
  },
  interestedIn: [{
    type: String,
    enum: ['male', 'female', 'non-binary', 'everyone']
  }],
  relationshipIntent: {
    type: String,
    enum: ['casual', 'serious', 'friendship', 'networking', 'not_sure'],
    required: true
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    trim: true
  },
  photos: {
    type: [photoSchema],
    default: [],
    validate: {
      validator: function(photos) {
        return photos.length <= 4;
      },
      message: 'Maximum 4 photos allowed'
    }
  },
  interests: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  promptAnswers: {
    type: [promptAnswerSchema],
    validate: {
      validator: function(answers) {
        return answers.length <= 5;
      },
      message: 'Maximum 5 prompt answers allowed'
    }
  },
  whyOnApp: {
    type: String,
    maxlength: [300, 'Response cannot exceed 300 characters']
  },
  lookingFor: {
    type: String,
    maxlength: [300, 'Response cannot exceed 300 characters']
  },
  
  // Location & Affiliation
  location: {
    city: String,
    state: String,
    country: String,
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    }
  },
  college: {
    name: String,
    graduationYear: Number
  },
  workplace: {
    company: String,
    position: String
  },
  
  // Social handles (optional, for reveal)
  socialHandles: {
    instagram: String,
    twitter: String,
    linkedin: String,
    snapchat: String
  },
  
  // Visibility & Privacy Settings
  visibility: {
    type: String,
    enum: ['invisible', 'searchable', 'discoverable'],
    default: 'discoverable'
  },
  showInFeed: {
    type: Boolean,
    default: true
  },
  allowAnonymousMessages: {
    type: Boolean,
    default: true
  },
  photoBlurForAnonymous: {
    type: Boolean,
    default: true
  },
  // Message Preferences - who can send messages
  messagePreferences: {
    allowFrom: {
      type: String,
      enum: ['anyone', 'restricted'],
      default: 'anyone'
    },
    // When allowFrom is 'restricted', these filters apply (OR logic - any match allows)
    sameCollege: {
      type: Boolean,
      default: false
    },
    sameWorkplace: {
      type: Boolean,
      default: false
    },
    sameLocation: {
      type: Boolean,
      default: false
    }
  },
  
  // Profile Status
  isComplete: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: Date,
  
  // Statistics
  viewCount: {
    type: Number,
    default: 0
  },
  requestsReceived: {
    type: Number,
    default: 0
  },
  requestsSent: {
    type: Number,
    default: 0
  },
  
  // Moderation
  isReported: {
    type: Boolean,
    default: false
  },
  reportCount: {
    type: Number,
    default: 0
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  bannedAt: Date,
  banReason: String,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date,
  lastActiveAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Geospatial index for location-based queries
profileSchema.index({ 'location.coordinates': '2dsphere' });
profileSchema.index({ user: 1 });
profileSchema.index({ visibility: 1, showInFeed: 1 });
profileSchema.index({ 'location.city': 1, 'location.country': 1 });
profileSchema.index({ 'college.name': 1 });
profileSchema.index({ 'workplace.company': 1 });
profileSchema.index({ interests: 1 });
profileSchema.index({ age: 1 });
profileSchema.index({ gender: 1, interestedIn: 1 });

// Pre-save middleware to calculate age
profileSchema.pre('save', function(next) {
  if (this.dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    this.age = age;
  }
  next();
});

// Pre-save middleware to check profile completion
profileSchema.pre('save', function(next) {
  const logger = require('../utils/logger');
  
  // Profile is complete if all required fields are filled
  const hasName = !!this.name;
  const hasBio = this.bio && this.bio.trim().length >= 50;
  const hasPhotos = this.photos && this.photos.length >= 1;
  const hasInterests = this.interests && this.interests.length >= 3;
  const hasWhyOnApp = !!this.whyOnApp && this.whyOnApp.trim().length > 0;
  const hasLookingFor = !!this.lookingFor && this.lookingFor.trim().length > 0;
  const hasRelationshipIntent = !!this.relationshipIntent;
  const hasInterestedIn = this.interestedIn && this.interestedIn.length > 0;
  const hasCity = this.location?.city && this.location.city.trim().length > 0;
  
  this.isComplete = hasName && hasBio && hasPhotos && hasInterests && 
                    hasWhyOnApp && hasLookingFor && hasRelationshipIntent && 
                    hasInterestedIn && hasCity;
  
  // Detailed logging for debugging
  if (!this.isComplete) {
    logger.info(`Profile completion check for user ${this.user}:`, {
      hasName,
      hasBio: hasBio ? `yes (${this.bio?.trim().length || 0} chars)` : 'no',
      hasPhotos: hasPhotos ? `yes (${this.photos?.length || 0} photos)` : 'no',
      hasInterests: hasInterests ? `yes (${this.interests?.length || 0} interests)` : 'no',
      hasWhyOnApp,
      hasLookingFor,
      hasRelationshipIntent,
      hasInterestedIn: hasInterestedIn ? `yes (${this.interestedIn?.length || 0})` : 'no',
      hasCity: hasCity ? `yes (${this.location?.city})` : 'no',
      isComplete: this.isComplete
    });
  } else {
  logger.info(`Profile completion check for user ${this.user} (isComplete: ${this.isComplete}, photos: ${this.photos?.length || 0})`);
  }
  
  next();
});

// Virtual for main photo
profileSchema.virtual('mainPhoto').get(function() {
  if (!this.photos || this.photos.length === 0) return null;
  const mainPhoto = this.photos.find(p => p.isMain);
  return mainPhoto ? mainPhoto.url : this.photos[0].url;
});

// Method to get public profile (for sharing)
profileSchema.methods.getPublicProfile = function(isAnonymous = false) {
  const profile = this.toObject();
  
  // Remove sensitive data
  delete profile.socialHandles;
  delete profile.isReported;
  delete profile.reportCount;
  
  if (isAnonymous && this.photoBlurForAnonymous) {
    // Return blurred photo URLs
    profile.photos = profile.photos.map(photo => ({
      ...photo,
      url: photo.url.replace('/upload/', '/upload/e_blur:1000/')
    }));
  }
  
  return profile;
};

// Method to increment view count
profileSchema.methods.incrementViewCount = async function() {
  this.viewCount += 1;
  await this.save({ validateBeforeSave: false });
};

// Static method to find discoverable profiles
profileSchema.statics.findDiscoverable = function(excludeUserId, filters = {}) {
  const query = {
    user: { $ne: excludeUserId },
    visibility: 'discoverable',
    showInFeed: true,
    isComplete: true,
    isBanned: false
  };
  
  if (filters.ageMin) query.age = { $gte: filters.ageMin };
  if (filters.ageMax) query.age = { ...query.age, $lte: filters.ageMax };
  if (filters.gender) query.gender = filters.gender;
  if (filters.city) query['location.city'] = new RegExp(filters.city, 'i');
  if (filters.college) query['college.name'] = new RegExp(filters.college, 'i');
  if (filters.interests && filters.interests.length > 0) {
    query.interests = { $in: filters.interests };
  }
  
  return this.find(query);
};

const Profile = mongoose.model('Profile', profileSchema);

module.exports = Profile;

