/**
 * Profile Controller
 * Handles profile creation, update, photos, and sharing
 */

const Profile = require('../models/Profile');
const User = require('../models/User');
const ProfileView = require('../models/ProfileView');
const Block = require('../models/Block');
const Conversation = require('../models/Conversation');
const ApiResponse = require('../utils/apiResponse');
const { 
  generateProfileLink, 
  generateQRCode, 
  generateDeepLink 
} = require('../utils/helpers');
const { 
  deleteImage, 
  getPublicIdFromUrl, 
  getBlurredImageUrl,
  getThumbnailUrl
} = require('../config/cloudinary');
const { sendProfileViewNotification } = require('../config/onesignal');
const logger = require('../utils/logger');

/**
 * @desc    Create/Setup profile
 * @route   POST /api/v1/profile/setup
 * @access  Private
 */
const setupProfile = async (req, res) => {
  try {
    const userId = req.userId;

    // Check if profile already exists
    const existingProfile = await Profile.findOne({ user: userId });
    
    // If profile exists but is incomplete (validation failed before), allow update
    if (existingProfile) {
      if (existingProfile.isComplete) {
      return ApiResponse.conflict(res, 'Profile already exists. Use update endpoint.');
      }
      // Profile exists but incomplete - update it instead
      logger.info(`Updating incomplete profile for user: ${userId}`);
    }

    const {
      name,
      alias,
      dateOfBirth,
      gender,
      interestedIn,
      relationshipIntent,
      bio,
      interests,
      whyOnApp,
      lookingFor,
      location,
      college,
      workplace,
      visibility,
      promptAnswers
    } = req.body;

    // Validate age before creating/updating profile
    if (dateOfBirth) {
      // Parse dateOfBirth - handle both ISO string and YYYY-MM-DD format
      let birthDate;
      if (typeof dateOfBirth === 'string' && dateOfBirth.includes('T')) {
        birthDate = new Date(dateOfBirth);
      } else if (typeof dateOfBirth === 'string') {
        // YYYY-MM-DD format - parse as local date to avoid timezone issues
        const [year, month, day] = dateOfBirth.split('-').map(Number);
        birthDate = new Date(year, month - 1, day); // month is 0-indexed
      } else {
        birthDate = new Date(dateOfBirth);
      }
      
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      logger.info(`Age validation: dateOfBirth=${dateOfBirth}, calculated age=${age}`);
      
      if (age < 18) {
        return ApiResponse.badRequest(res, 'You must be at least 18 years old to use bibbly');
      }
    }

    let profile;
    if (existingProfile) {
      // Update existing incomplete profile
      // Calculate age manually to ensure it's correct before saving
      let calculatedAge = null;
      if (dateOfBirth) {
        // Parse dateOfBirth - handle both ISO string and YYYY-MM-DD format
        let birthDate;
        if (typeof dateOfBirth === 'string' && dateOfBirth.includes('T')) {
          birthDate = new Date(dateOfBirth);
        } else if (typeof dateOfBirth === 'string') {
          // YYYY-MM-DD format - parse as local date to avoid timezone issues
          const [year, month, day] = dateOfBirth.split('-').map(Number);
          birthDate = new Date(year, month - 1, day); // month is 0-indexed
        } else {
          birthDate = new Date(dateOfBirth);
        }
        
        const today = new Date();
        calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        logger.info(`Updating profile: calculated age=${calculatedAge} from dateOfBirth=${dateOfBirth}`);
      }
      
      Object.assign(existingProfile, {
        name,
        alias,
        dateOfBirth,
        age: calculatedAge, // Set age manually to avoid validation issues
        gender,
        interestedIn: interestedIn || existingProfile.interestedIn || ['everyone'],
        relationshipIntent,
        bio,
        interests: interests || [],
        whyOnApp,
        lookingFor,
        location: location || existingProfile.location || {},
        college: college || existingProfile.college || {},
        workplace: workplace || existingProfile.workplace || {},
        visibility: visibility || existingProfile.visibility || 'discoverable',
        promptAnswers: promptAnswers || [],
      });
      profile = existingProfile;
      // Save profile - pre-save middleware will check completion
      await profile.save();
    } else {
      // Calculate age manually before creating profile
      let calculatedAge = null;
      if (dateOfBirth) {
        // Parse dateOfBirth - handle both ISO string and YYYY-MM-DD format
        let birthDate;
        if (typeof dateOfBirth === 'string' && dateOfBirth.includes('T')) {
          birthDate = new Date(dateOfBirth);
        } else if (typeof dateOfBirth === 'string') {
          // YYYY-MM-DD format - parse as local date to avoid timezone issues
          const [year, month, day] = dateOfBirth.split('-').map(Number);
          birthDate = new Date(year, month - 1, day); // month is 0-indexed
        } else {
          birthDate = new Date(dateOfBirth);
        }
        
        const today = new Date();
        calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge--;
        }
        logger.info(`Creating profile: calculated age=${calculatedAge} from dateOfBirth=${dateOfBirth}`);
      }
      
      // Create new profile
      profile = await Profile.create({
      user: userId,
      name,
      alias,
      dateOfBirth,
        age: calculatedAge, // Set age manually to ensure it passes validation
      gender,
      interestedIn: interestedIn || ['everyone'],
      relationshipIntent,
      bio,
      interests: interests || [],
      whyOnApp,
      lookingFor,
      location: location || {},
      college: college || {},
      workplace: workplace || {},
      visibility: visibility || 'discoverable',
      promptAnswers: promptAnswers || [],
      photos: []
    });
    }

    // Update user account status if email is verified
    const user = await User.findById(userId);
    if (user.accountStatus !== 'active') {
      user.accountStatus = 'active';
      await user.save({ validateBeforeSave: false });
    }

    logger.info(`Profile ${existingProfile ? 'updated' : 'created'} for user: ${userId}`);
    
    // Ensure completion status is checked and saved
    if (!profile.isComplete) {
      // Force a save to trigger pre-save middleware completion check
      await profile.save();
      logger.info(`Profile completion re-checked after save. isComplete: ${profile.isComplete}`);
    }

    return ApiResponse.created(res, {
      profile,
      shareLink: generateProfileLink(user.username),
      deepLink: generateDeepLink('profile', user.username)
    }, existingProfile ? 'Profile updated successfully' : 'Profile created successfully');

  } catch (error) {
    logger.error('Profile setup error:', error);
    
    // Return more specific error messages
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(e => e.message);
      return ApiResponse.badRequest(res, `Validation failed: ${validationErrors.join(', ')}`);
    }
    
    return ApiResponse.error(res, error.message || 'Error creating profile');
  }
};

/**
 * @desc    Get own profile
 * @route   GET /api/v1/profile
 * @access  Private
 */
const getMyProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.userId });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found. Please complete profile setup.');
    }

    const user = await User.findById(req.userId);

    // Generate QR code
    const profileLink = generateProfileLink(user.username);
    const qrCode = await generateQRCode(profileLink);

    return ApiResponse.success(res, {
      profile,
      shareLink: profileLink,
      deepLink: generateDeepLink('profile', user.username),
      qrCode
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    return ApiResponse.error(res, 'Error fetching profile');
  }
};

/**
 * @desc    Update profile
 * @route   PUT /api/v1/profile
 * @access  Private
 */
const updateProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.userId });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    const allowedUpdates = [
      'name', 'alias', 'bio', 'interests', 'whyOnApp', 'lookingFor',
      'location', 'college', 'workplace', 'visibility', 'showInFeed',
      'allowAnonymousMessages', 'photoBlurForAnonymous', 'interestedIn',
      'relationshipIntent', 'promptAnswers', 'socialHandles'
    ];

    // Filter allowed fields
    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    // Update profile
    Object.assign(profile, updates);
    profile.updatedAt = new Date();
    await profile.save();

    return ApiResponse.success(res, { profile }, 'Profile updated successfully');

  } catch (error) {
    logger.error('Update profile error:', error);
    return ApiResponse.error(res, 'Error updating profile');
  }
};

/**
 * @desc    Upload profile photo
 * @route   POST /api/v1/profile/photos
 * @access  Private
 */
const uploadPhoto = async (req, res) => {
  try {
    logger.info(`Photo upload request from user ${req.userId}`);
    logger.info(`Request headers: ${JSON.stringify(req.headers['content-type'])}`);
    logger.info(`Request file: ${req.file ? 'present' : 'missing'}`);
    
    let profile = await Profile.findOne({ user: req.userId });

    // Create profile if it doesn't exist (for cases where photos are uploaded before profile setup)
    if (!profile) {
      const user = await User.findById(req.userId);
      if (!user) {
        return ApiResponse.notFound(res, 'User not found');
      }
      
      // Create a minimal profile without validation (will be completed later)
      profile = new Profile({
        user: req.userId,
        name: user.username,
        photos: [],
        visibility: 'discoverable',
        isComplete: false
      });
      await profile.save({ validateBeforeSave: false });
      logger.info(`Auto-created profile for user ${req.userId} during photo upload`);
    }

    if (!req.file) {
      logger.warn(`No file received in upload request from user ${req.userId}`);
      // Check if multer error occurred
      if (req.fileValidationError) {
        return ApiResponse.badRequest(res, req.fileValidationError);
      }
      return ApiResponse.badRequest(res, 'Please upload an image file');
    }

    // Check photo limit
    if (profile.photos.length >= 4) {
      return ApiResponse.badRequest(res, 'Maximum 4 photos allowed');
    }

    // Log file details
    logger.info(`File received: ${req.file.originalname}, size: ${req.file.size}, mimetype: ${req.file.mimetype}`);
    logger.info(`File object keys: ${Object.keys(req.file).join(', ')}`);
    
    // CloudinaryStorage provides path (URL) and filename (public_id)
    const fileUrl = req.file.path || req.file.url || req.file.secure_url;
    const filePublicId = req.file.filename || req.file.public_id;
    
    logger.info(`File URL: ${fileUrl}, Public ID: ${filePublicId}`);
    
    if (!fileUrl) {
      logger.error('File URL is missing from req.file');
      return ApiResponse.badRequest(res, 'File upload failed: URL not available');
    }
    
    if (!filePublicId) {
      logger.error('File public ID is missing from req.file');
      return ApiResponse.badRequest(res, 'File upload failed: Public ID not available');
    }

    // Check photo limit
    if (profile.photos.length >= 4) {
      return ApiResponse.badRequest(res, 'Maximum 4 photos allowed');
    }

    // Add photo
    const isMain = profile.photos.length === 0;
    profile.photos.push({
      url: fileUrl,
      publicId: filePublicId,
      order: profile.photos.length,
      isMain
    });

    logger.info(`Attempting to save profile with ${profile.photos.length} photos`);

    // Save profile - pre-save middleware will check completion
    // Only skip validation if truly incomplete (missing core fields)
    const isIncomplete = !profile.dateOfBirth || !profile.gender || !profile.relationshipIntent;
    logger.info(`Profile incomplete: ${isIncomplete}, skipping validation: ${isIncomplete}`);
    
    try {
      await profile.save({ validateBeforeSave: !isIncomplete });
      logger.info(`Profile saved successfully. isComplete: ${profile.isComplete}`);
    } catch (saveError) {
      logger.error(`Profile save error: ${saveError.message}`);
      logger.error(`Save error details: ${JSON.stringify(saveError)}`);
      if (saveError.name === 'ValidationError') {
        const validationErrors = Object.values(saveError.errors).map(e => e.message);
        return ApiResponse.badRequest(res, `Profile validation failed: ${validationErrors.join(', ')}`);
      }
      throw saveError;
    }

    return ApiResponse.success(res, {
      photos: profile.photos,
      uploadedPhoto: profile.photos[profile.photos.length - 1]
    }, 'Photo uploaded successfully');

  } catch (error) {
    logger.error('Upload photo error:', error);
    logger.error('Error stack:', error.stack);
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(e => e.message);
      return ApiResponse.badRequest(res, `Validation failed: ${validationErrors.join(', ')}`);
    }
    return ApiResponse.error(res, error.message || 'Error uploading photo');
  }
};

/**
 * @desc    Delete profile photo
 * @route   DELETE /api/v1/profile/photos/:photoId
 * @access  Private
 */
const deletePhoto = async (req, res) => {
  try {
    const { photoId } = req.params;
    const profile = await Profile.findOne({ user: req.userId });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    const photoIndex = profile.photos.findIndex(p => p._id.toString() === photoId);
    
    if (photoIndex === -1) {
      return ApiResponse.notFound(res, 'Photo not found');
    }

    // Prevent deleting last photo
    if (profile.photos.length === 1) {
      return ApiResponse.badRequest(res, 'You must have at least one photo');
    }

    // Delete from Cloudinary
    const photo = profile.photos[photoIndex];
    if (photo.publicId) {
      await deleteImage(photo.publicId);
    }

    // Remove from profile
    const wasMain = photo.isMain;
    profile.photos.splice(photoIndex, 1);

    // If deleted main photo, set first photo as main
    if (wasMain && profile.photos.length > 0) {
      profile.photos[0].isMain = true;
    }

    // Reorder
    profile.photos.forEach((p, i) => {
      p.order = i;
    });

    await profile.save();

    return ApiResponse.success(res, { photos: profile.photos }, 'Photo deleted successfully');

  } catch (error) {
    logger.error('Delete photo error:', error);
    return ApiResponse.error(res, 'Error deleting photo');
  }
};

/**
 * @desc    Reorder photos
 * @route   PUT /api/v1/profile/photos/reorder
 * @access  Private
 */
const reorderPhotos = async (req, res) => {
  try {
    const { photoOrder } = req.body; // Array of photo IDs in new order
    const profile = await Profile.findOne({ user: req.userId });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    // Validate photo IDs
    const photoIds = profile.photos.map(p => p._id.toString());
    const allValid = photoOrder.every(id => photoIds.includes(id));
    
    if (!allValid || photoOrder.length !== profile.photos.length) {
      return ApiResponse.badRequest(res, 'Invalid photo order');
    }

    // Reorder photos
    const reorderedPhotos = photoOrder.map((id, index) => {
      const photo = profile.photos.find(p => p._id.toString() === id);
      photo.order = index;
      photo.isMain = index === 0;
      return photo;
    });

    profile.photos = reorderedPhotos;
    await profile.save();

    return ApiResponse.success(res, { photos: profile.photos }, 'Photos reordered successfully');

  } catch (error) {
    logger.error('Reorder photos error:', error);
    return ApiResponse.error(res, 'Error reordering photos');
  }
};

/**
 * @desc    Set main photo
 * @route   PUT /api/v1/profile/photos/:photoId/main
 * @access  Private
 */
const setMainPhoto = async (req, res) => {
  try {
    const { photoId } = req.params;
    const profile = await Profile.findOne({ user: req.userId });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    const photo = profile.photos.find(p => p._id.toString() === photoId);
    
    if (!photo) {
      return ApiResponse.notFound(res, 'Photo not found');
    }

    // Update main status
    profile.photos.forEach(p => {
      p.isMain = p._id.toString() === photoId;
    });

    await profile.save();

    return ApiResponse.success(res, { photos: profile.photos }, 'Main photo updated');

  } catch (error) {
    logger.error('Set main photo error:', error);
    return ApiResponse.error(res, 'Error setting main photo');
  }
};

/**
 * @desc    Get profile by username (public)
 * @route   GET /api/v1/profile/user/:username
 * @access  Public (with optional auth)
 */
const getProfileByUsername = async (req, res) => {
  try {
    const { username } = req.params;

    logger.info(`Fetching profile for username: ${username}`);

    const user = await User.findOne({ username, accountStatus: 'active' });

    if (!user) {
      logger.warn(`User not found with username: ${username}`);
      return ApiResponse.notFound(res, 'User not found');
    }

    const profile = await Profile.findOne({ user: user._id, isBanned: false });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    // Check if viewer is blocked
    if (req.userId) {
      const isBlocked = await Block.hasBlockBetween(req.userId, user._id);
      if (isBlocked) {
        return ApiResponse.notFound(res, 'Profile not found');
      }
    }

    // Check visibility
    if (profile.visibility === 'invisible' && !req.userId) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    // Log profile view if viewer is logged in
    if (req.userId && req.userId.toString() !== user._id.toString()) {
      await ProfileView.logView(
        profile._id,
        user._id,
        req.userId,
        'profile_link',
        true // Anonymous view
      );

      // Increment view count
      await profile.incrementViewCount();

    }

    // Determine what to show based on viewer
    const isOwnProfile = req.userId && req.userId.toString() === user._id.toString();
    
    // Check if there's a conversation and if the user is revealed
    let shouldBlur = true;
    if (req.userId && !isOwnProfile) {
      const conversation = await Conversation.findBetweenUsers(req.userId, user._id);
      
      if (conversation) {
        // Check if the profile owner is revealed in this conversation
        const isProfileOwnerRevealed = conversation.isUserRevealed(user._id);
        if (isProfileOwnerRevealed) {
          shouldBlur = false; // Don't blur if user is revealed in conversation
          logger.info(`Profile owner ${user._id} is revealed in conversation, showing unblurred images`);
        }
      }
      
      // If no conversation or not revealed, use default blur logic
      if (shouldBlur) {
        shouldBlur = profile.photoBlurForAnonymous;
      }
    } else if (!req.userId) {
      shouldBlur = true; // Always blur for non-authenticated users
    } else {
      shouldBlur = false; // Own profile, no blur
    }
    
    const profileData = isOwnProfile 
      ? profile 
      : profile.getPublicProfile(shouldBlur);

    return ApiResponse.success(res, {
      profile: profileData,
      username: user.username,
      canMessage: !isOwnProfile,
      isAnonymous: shouldBlur && !isOwnProfile
    });

  } catch (error) {
    logger.error('Get profile by username error:', error);
    return ApiResponse.error(res, 'Error fetching profile');
  }
};

/**
 * @desc    Get profile by user ID (for internal use)
 * @route   GET /api/v1/profile/user-id/:userId
 * @access  Private
 */
const getProfileByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    logger.info(`Fetching profile for user ID: ${userId}`);

    const user = await User.findOne({ _id: userId, accountStatus: 'active' });

    if (!user) {
      logger.warn(`User not found with ID: ${userId}`);
      return ApiResponse.notFound(res, 'User not found');
    }

    const profile = await Profile.findOne({ user: user._id, isBanned: false });

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    // Check if viewer is blocked
    if (req.userId) {
      const isBlocked = await Block.hasBlockBetween(req.userId, user._id);
      if (isBlocked) {
        return ApiResponse.notFound(res, 'Profile not found');
      }
    }

    // Check visibility
    if (profile.visibility === 'invisible' && !req.userId) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    // Log profile view if viewer is logged in
    if (req.userId && req.userId.toString() !== user._id.toString()) {
      await ProfileView.logView(
        profile._id,
        user._id,
        req.userId,
        'profile_link',
        true // Anonymous view
      );

      // Increment view count
      await profile.incrementViewCount();
    }

    // Determine what to show based on viewer
    const isOwnProfile = req.userId && req.userId.toString() === user._id.toString();
    
    // Check if there's a conversation and if the user is revealed
    let shouldBlur = true;
    if (req.userId && !isOwnProfile) {
      const conversation = await Conversation.findBetweenUsers(req.userId, user._id);
      
      if (conversation) {
        // Check if the profile owner is revealed in this conversation
        const isProfileOwnerRevealed = conversation.isUserRevealed(user._id);
        if (isProfileOwnerRevealed) {
          shouldBlur = false; // Don't blur if user is revealed in conversation
          logger.info(`Profile owner ${user._id} is revealed in conversation, showing unblurred images`);
        }
      }
      
      // If no conversation or not revealed, use default blur logic
      if (shouldBlur) {
        shouldBlur = profile.photoBlurForAnonymous;
      }
    } else if (!req.userId) {
      shouldBlur = true; // Always blur for non-authenticated users
    } else {
      shouldBlur = false; // Own profile, no blur
    }
    
    const profileData = isOwnProfile 
      ? profile 
      : profile.getPublicProfile(shouldBlur);

    return ApiResponse.success(res, {
      profile: profileData,
      username: user.username,
      canMessage: !isOwnProfile,
      isAnonymous: shouldBlur && !isOwnProfile
    });

  } catch (error) {
    logger.error('Get profile by user ID error:', error);
    return ApiResponse.error(res, 'Error fetching profile');
  }
};


/**
 * @desc    Get share link and QR code
 * @route   GET /api/v1/profile/share
 * @access  Private
 */
const getShareInfo = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const profileLink = generateProfileLink(user.username);
    const deepLink = generateDeepLink('profile', user.username);
    const qrCode = await generateQRCode(profileLink);

    return ApiResponse.success(res, {
      shareLink: profileLink,
      deepLink,
      qrCode,
      shareText: `Check out my profile on bibbly! ${profileLink}`
    });

  } catch (error) {
    logger.error('Get share info error:', error);
    return ApiResponse.error(res, 'Error generating share info');
  }
};

module.exports = {
  setupProfile,
  getMyProfile,
  updateProfile,
  uploadPhoto,
  deletePhoto,
  reorderPhotos,
  setMainPhoto,
  getProfileByUsername,
  getProfileByUserId,
  getShareInfo
};

