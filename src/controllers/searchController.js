/**
 * Search Controller
 * Handles user search functionality
 */

const User = require('../models/User');
const Profile = require('../models/Profile');
const Block = require('../models/Block');
const ApiResponse = require('../utils/apiResponse');
const { getBlurredImageUrl } = require('../config/cloudinary');
const logger = require('../utils/logger');

/**
 * @desc    Search users
 * @route   GET /api/v1/search
 * @access  Private
 */
const searchUsers = async (req, res) => {
  try {
    const {
      q,
      college,
      workplace,
      city,
      ageMin,
      ageMax,
      gender,
      interests,
      page = 1,
      limit = 20
    } = req.query;

    // Get blocked user IDs
    const blockedIds = await Block.getAllBlockRelatedUserIds(req.userId);

    // Build search query
    const query = {
      user: { $ne: req.userId, $nin: blockedIds.map(id => id) },
      visibility: { $in: ['searchable', 'discoverable'] },
      isComplete: true,
      isBanned: false
    };

    // Text search on name, bio, interests
    if (q && q.length >= 2) {
      const searchRegex = new RegExp(q, 'i');
      query.$or = [
        { name: searchRegex },
        { alias: searchRegex },
        { bio: searchRegex },
        { interests: searchRegex }
      ];
    }

    // Filter by college
    if (college) {
      query['college.name'] = new RegExp(college, 'i');
    }

    // Filter by workplace
    if (workplace) {
      query['workplace.company'] = new RegExp(workplace, 'i');
    }

    // Filter by city
    if (city) {
      query['location.city'] = new RegExp(city, 'i');
    }

    // Filter by age range
    if (ageMin || ageMax) {
      query.age = {};
      if (ageMin) query.age.$gte = parseInt(ageMin);
      if (ageMax) query.age.$lte = parseInt(ageMax);
    }

    // Filter by gender
    if (gender) {
      query.gender = gender;
    }

    // Filter by interests
    if (interests) {
      const interestArray = interests.split(',').map(i => i.trim().toLowerCase());
      query.interests = { $in: interestArray };
    }

    // Execute search
    const profiles = await Profile.find(query)
      .populate({
        path: 'user',
        select: 'username',
        match: { accountStatus: 'active' }
      })
      .select('name alias photos bio interests age gender location college workplace whyOnApp lookingFor')
      .sort({ viewCount: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Filter out profiles where user is null (deleted/inactive accounts)
    const validProfiles = profiles.filter(p => p.user);

    // Format response (show blurred photos for anonymous view)
    const formattedProfiles = validProfiles.map(profile => {
      const profileObj = profile.toObject();
      
      // Ensure photos are plain objects and add blurredUrl
      const photos = (profileObj.photos || []).map(photo => {
        const photoObj = photo.toObject ? photo.toObject() : photo;
        return {
          _id: photoObj._id || photoObj.id,
          url: photoObj.url || '',
          publicId: photoObj.publicId,
          order: photoObj.order || 0,
          isMain: photoObj.isMain || false,
          uploadedAt: photoObj.uploadedAt,
          blurredUrl: photoObj.url ? getBlurredImageUrl(photoObj.url) : null
        };
      });

      return {
        ...profileObj,
        photos
      };
    });

    const total = await Profile.countDocuments(query);

    return ApiResponse.paginated(res, formattedProfiles, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });

  } catch (error) {
    logger.error('Search users error:', error);
    return ApiResponse.error(res, 'Error searching users');
  }
};

/**
 * @desc    Search by username
 * @route   GET /api/v1/search/username/:username
 * @access  Private
 */
const searchByUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({
      username: username.toLowerCase(),
      accountStatus: 'active'
    });

    if (!user) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Check if blocked
    const isBlocked = await Block.hasBlockBetween(req.userId, user._id);
    if (isBlocked) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Check if same user
    if (user._id.toString() === req.userId.toString()) {
      return ApiResponse.badRequest(res, 'This is your own profile');
    }

    const profile = await Profile.findOne({
      user: user._id,
      visibility: { $ne: 'invisible' },
      isBanned: false
    }).select('name alias photos bio interests age gender location college workplace whyOnApp lookingFor');

    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    const profileObj = profile.toObject();
    
    // Ensure photos are plain objects and add blurredUrl
    const photos = (profileObj.photos || []).map(photo => {
      const photoObj = photo.toObject ? photo.toObject() : photo;
      return {
        _id: photoObj._id || photoObj.id,
        url: photoObj.url || '',
        publicId: photoObj.publicId,
        order: photoObj.order || 0,
        isMain: photoObj.isMain || false,
        uploadedAt: photoObj.uploadedAt,
        blurredUrl: photoObj.url ? getBlurredImageUrl(photoObj.url) : null
      };
    });

    return ApiResponse.success(res, {
      profile: {
        ...profileObj,
        photos
      },
      username: user.username
    });

  } catch (error) {
    logger.error('Search by username error:', error);
    return ApiResponse.error(res, 'Error searching user');
  }
};

/**
 * @desc    Get search suggestions (autocomplete)
 * @route   GET /api/v1/search/suggestions
 * @access  Private
 */
const getSearchSuggestions = async (req, res) => {
  try {
    const { q, type = 'all' } = req.query;

    if (!q || q.length < 2) {
      return ApiResponse.success(res, { suggestions: [] });
    }

    const searchRegex = new RegExp(`^${q}`, 'i');
    const suggestions = {
      users: [],
      colleges: [],
      companies: [],
      interests: []
    };

    // Get blocked IDs
    const blockedIds = await Block.getAllBlockRelatedUserIds(req.userId);

    if (type === 'all' || type === 'users') {
      // Search users
      const users = await User.find({
        username: searchRegex,
        accountStatus: 'active',
        _id: { $ne: req.userId, $nin: blockedIds }
      })
      .select('username')
      .limit(5);

      suggestions.users = users.map(u => u.username);
    }

    if (type === 'all' || type === 'colleges') {
      // Get college suggestions
      const colleges = await Profile.distinct('college.name', {
        'college.name': searchRegex,
        user: { $ne: req.userId }
      });
      suggestions.colleges = colleges.slice(0, 5);
    }

    if (type === 'all' || type === 'companies') {
      // Get company suggestions
      const companies = await Profile.distinct('workplace.company', {
        'workplace.company': searchRegex,
        user: { $ne: req.userId }
      });
      suggestions.companies = companies.slice(0, 5);
    }

    if (type === 'all' || type === 'interests') {
      // Get interest suggestions
      const interests = await Profile.distinct('interests', {
        interests: searchRegex,
        user: { $ne: req.userId }
      });
      suggestions.interests = interests.slice(0, 5);
    }

    return ApiResponse.success(res, { suggestions });

  } catch (error) {
    logger.error('Get suggestions error:', error);
    return ApiResponse.error(res, 'Error fetching suggestions');
  }
};

/**
 * @desc    Get popular searches
 * @route   GET /api/v1/search/popular
 * @access  Private
 */
const getPopularSearches = async (req, res) => {
  try {
    // Get popular colleges
    const popularColleges = await Profile.aggregate([
      { $match: { 'college.name': { $exists: true, $ne: '' } } },
      { $group: { _id: '$college.name', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Get popular companies
    const popularCompanies = await Profile.aggregate([
      { $match: { 'workplace.company': { $exists: true, $ne: '' } } },
      { $group: { _id: '$workplace.company', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Get popular interests
    const popularInterests = await Profile.aggregate([
      { $unwind: '$interests' },
      { $group: { _id: '$interests', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    return ApiResponse.success(res, {
      colleges: popularColleges.map(c => c._id),
      companies: popularCompanies.map(c => c._id),
      interests: popularInterests.map(i => i._id)
    });

  } catch (error) {
    logger.error('Get popular searches error:', error);
    return ApiResponse.error(res, 'Error fetching popular searches');
  }
};

module.exports = {
  searchUsers,
  searchByUsername,
  getSearchSuggestions,
  getPopularSearches
};

