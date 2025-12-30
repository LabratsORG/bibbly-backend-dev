/**
 * Discovery Controller
 * Handles discovery feed (Tinder-style cards)
 */

const Profile = require('../models/Profile');
const User = require('../models/User');
const AppConfig = require('../models/AppConfig');
const Block = require('../models/Block');
const Skip = require('../models/Skip');
const MessageRequest = require('../models/MessageRequest');
const ProfileView = require('../models/ProfileView');
const ApiResponse = require('../utils/apiResponse');
const { getBlurredImageUrl } = require('../config/cloudinary');
const logger = require('../utils/logger');

/**
 * Helper function to format profile with photos
 */
const formatProfile = (profile, score = 0, connectionType = null) => {
  const profileObj = profile.toObject ? profile.toObject() : profile;

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
    photos,
    matchScore: Math.min(Math.round(score), 100),
    connectionType // 'workplace', 'college', 'location', or null
  };
};

/**
 * Helper function to get excluded user IDs
 */
const getExcludedIds = async (userId) => {
  const [blockedIds, skippedUserIds, requestedUserIds] = await Promise.all([
    Block.getAllBlockRelatedUserIds(userId),
    Skip.getSkippedUserIds(userId),
    MessageRequest.find({
      $or: [
        { sender: userId },
        { recipient: userId }
      ],
      status: { $in: ['pending', 'accepted'] }
    }).distinct('sender').then(senders => 
      MessageRequest.find({
        $or: [
          { sender: userId },
          { recipient: userId }
        ],
        status: { $in: ['pending', 'accepted'] }
      }).distinct('recipient').then(recipients => 
        [...new Set([...senders.map(s => s.toString()), ...recipients.map(r => r.toString())])]
      )
    )
  ]);

  return [
    ...blockedIds,
    ...skippedUserIds.map(id => id.toString()),
    ...requestedUserIds,
    userId.toString()
  ];
};

/**
 * Helper function to build base query with gender filter
 */
const buildBaseQuery = (excludedIds, myProfile, genderFilter) => {
  const query = {
    user: { $nin: excludedIds },
    visibility: 'discoverable',
    showInFeed: true,
    isComplete: true,
    isBanned: false
  };

  // Apply gender filter
  if (genderFilter && genderFilter !== 'everyone') {
    query.gender = genderFilter;
  } else if (!genderFilter && myProfile.interestedIn && !myProfile.interestedIn.includes('everyone') && myProfile.interestedIn.length > 0) {
    query.gender = { $in: myProfile.interestedIn };
  }

  return query;
};

/**
 * @desc    Get smart discovery feed with prioritized sections
 * @route   GET /api/v1/discover/smart-feed
 * @access  Private
 */
const getSmartFeed = async (req, res) => {
  try {
    const { limit = 20, ageMin, ageMax, gender } = req.query;

    // Get user's profile for matching
    const myProfile = await Profile.findOne({ user: req.userId });
    if (!myProfile) {
      return ApiResponse.badRequest(res, 'Please complete your profile first');
    }

    const excludedIds = await getExcludedIds(req.userId);
    const baseQuery = buildBaseQuery(excludedIds, myProfile, gender);

    // Apply age filter
    if (ageMin || ageMax) {
      baseQuery.age = {};
      if (ageMin) baseQuery.age.$gte = parseInt(ageMin);
      if (ageMax) baseQuery.age.$lte = parseInt(ageMax);
    }

    // Track all fetched profile IDs to avoid duplicates
    const fetchedProfileIds = new Set();
    const smartFeed = [];

    // PRIORITY 1: Same Workplace
    if (myProfile.workplace?.company) {
      const workplaceProfiles = await Profile.find({
        ...baseQuery,
        'workplace.company': { $regex: new RegExp(myProfile.workplace.company, 'i') }
      })
      .populate({ path: 'user', select: 'username accountStatus' })
      .select('name alias photos bio interests age gender location college workplace promptAnswers whyOnApp lookingFor')
      .limit(10);

      for (const profile of workplaceProfiles) {
        if (profile.user?.accountStatus === 'active' && !fetchedProfileIds.has(profile._id.toString())) {
          fetchedProfileIds.add(profile._id.toString());
          // Score: workplace match (50) + shared interests
          let score = 50;
          if (myProfile.interests && profile.interests) {
            const sharedInterests = profile.interests.filter(i => myProfile.interests.includes(i));
            score += sharedInterests.length * 5;
          }
          smartFeed.push({ profile, score, connectionType: 'workplace' });
        }
      }
    }

    // PRIORITY 2: Same College
    if (myProfile.college?.name) {
      const collegeProfiles = await Profile.find({
        ...baseQuery,
        'college.name': { $regex: new RegExp(myProfile.college.name, 'i') }
      })
      .populate({ path: 'user', select: 'username accountStatus' })
      .select('name alias photos bio interests age gender location college workplace promptAnswers whyOnApp lookingFor')
      .limit(10);

      for (const profile of collegeProfiles) {
        if (profile.user?.accountStatus === 'active' && !fetchedProfileIds.has(profile._id.toString())) {
          fetchedProfileIds.add(profile._id.toString());
          // Score: college match (40) + shared interests
          let score = 40;
          if (myProfile.interests && profile.interests) {
            const sharedInterests = profile.interests.filter(i => myProfile.interests.includes(i));
            score += sharedInterests.length * 5;
          }
          smartFeed.push({ profile, score, connectionType: 'college' });
        }
      }
    }

    // PRIORITY 3: Same Location (City)
    if (myProfile.location?.city) {
      const locationProfiles = await Profile.find({
        ...baseQuery,
        'location.city': { $regex: new RegExp(myProfile.location.city, 'i') }
      })
      .populate({ path: 'user', select: 'username accountStatus' })
      .select('name alias photos bio interests age gender location college workplace promptAnswers whyOnApp lookingFor')
      .limit(15);

      for (const profile of locationProfiles) {
        if (profile.user?.accountStatus === 'active' && !fetchedProfileIds.has(profile._id.toString())) {
          fetchedProfileIds.add(profile._id.toString());
          // Score: location match (30) + shared interests
          let score = 30;
          if (myProfile.interests && profile.interests) {
            const sharedInterests = profile.interests.filter(i => myProfile.interests.includes(i));
            score += sharedInterests.length * 5;
          }
          smartFeed.push({ profile, score, connectionType: 'location' });
        }
      }
    }

    // PRIORITY 4: Random/Other Profiles
    const remainingLimit = Math.max(parseInt(limit) - smartFeed.length, 5);
    const randomProfiles = await Profile.aggregate([
      { $match: { 
        ...baseQuery,
        _id: { $nin: [...fetchedProfileIds].map(id => require('mongoose').Types.ObjectId.createFromHexString(id)) }
      }},
      { $sample: { size: remainingLimit } }
    ]);

    // Populate user for random profiles
    const populatedRandomProfiles = await Profile.populate(randomProfiles, {
      path: 'user',
      select: 'username accountStatus'
    });

    for (const profile of populatedRandomProfiles) {
      if (profile.user?.accountStatus === 'active') {
        // Score: based on shared interests only
        let score = 10;
        if (myProfile.interests && profile.interests) {
          const sharedInterests = profile.interests.filter(i => myProfile.interests.includes(i));
          score += sharedInterests.length * 5;
        }
        smartFeed.push({ profile, score, connectionType: null });
      }
    }

    // Sort by score (workplace > college > location > random) and limit
    smartFeed.sort((a, b) => b.score - a.score);
    const finalFeed = smartFeed.slice(0, parseInt(limit));

    // Format profiles
    const formattedProfiles = finalFeed.map(({ profile, score, connectionType }) => 
      formatProfile(profile, score, connectionType)
    );

    // Log views
    for (const { profile } of finalFeed) {
      await ProfileView.logView(
        profile._id,
        profile.user._id,
        req.userId,
        'discovery_feed',
        true
      );
    }

    return ApiResponse.success(res, {
      profiles: formattedProfiles,
      meta: {
        workplaceCount: finalFeed.filter(f => f.connectionType === 'workplace').length,
        collegeCount: finalFeed.filter(f => f.connectionType === 'college').length,
        locationCount: finalFeed.filter(f => f.connectionType === 'location').length,
        otherCount: finalFeed.filter(f => f.connectionType === null).length
      }
    });

  } catch (error) {
    logger.error('Get smart feed error:', error);
    return ApiResponse.error(res, 'Error fetching smart feed');
  }
};

/**
 * @desc    Get feed sections (categorized profiles)
 * @route   GET /api/v1/discover/sections
 * @access  Private
 */
const getFeedSections = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const myProfile = await Profile.findOne({ user: req.userId });
    if (!myProfile) {
      return ApiResponse.badRequest(res, 'Please complete your profile first');
    }

    const excludedIds = await getExcludedIds(req.userId);
    const baseQuery = buildBaseQuery(excludedIds, myProfile, null);

    const sections = [];
    const fetchedProfileIds = new Set();

    // Section 1: From Your Workplace
    if (myProfile.workplace?.company) {
      const workplaceProfiles = await Profile.find({
        ...baseQuery,
        'workplace.company': { $regex: new RegExp(myProfile.workplace.company, 'i') }
      })
      .populate({ path: 'user', select: 'username accountStatus' })
      .select('name alias photos bio interests age gender workplace')
      .limit(parseInt(limit));

      const validWorkplaceProfiles = workplaceProfiles
        .filter(p => p.user?.accountStatus === 'active')
        .map(p => {
          fetchedProfileIds.add(p._id.toString());
          return formatProfile(p, 50, 'workplace');
        });

      if (validWorkplaceProfiles.length > 0) {
        sections.push({
          id: 'workplace',
          title: `From ${myProfile.workplace.company}`,
          subtitle: 'People from your workplace',
          icon: 'work',
          profiles: validWorkplaceProfiles,
          count: validWorkplaceProfiles.length
        });
      }
    }

    // Section 2: From Your College
    if (myProfile.college?.name) {
      const collegeProfiles = await Profile.find({
        ...baseQuery,
        'college.name': { $regex: new RegExp(myProfile.college.name, 'i') },
        _id: { $nin: [...fetchedProfileIds] }
      })
      .populate({ path: 'user', select: 'username accountStatus' })
      .select('name alias photos bio interests age gender college')
      .limit(parseInt(limit));

      const validCollegeProfiles = collegeProfiles
        .filter(p => p.user?.accountStatus === 'active')
        .map(p => {
          fetchedProfileIds.add(p._id.toString());
          return formatProfile(p, 40, 'college');
        });

      if (validCollegeProfiles.length > 0) {
        sections.push({
          id: 'college',
          title: `From ${myProfile.college.name}`,
          subtitle: 'Alumni and students',
          icon: 'school',
          profiles: validCollegeProfiles,
          count: validCollegeProfiles.length
        });
      }
    }

    // Section 3: In Your City
    if (myProfile.location?.city) {
      const locationProfiles = await Profile.find({
        ...baseQuery,
        'location.city': { $regex: new RegExp(myProfile.location.city, 'i') },
        _id: { $nin: [...fetchedProfileIds] }
      })
      .populate({ path: 'user', select: 'username accountStatus' })
      .select('name alias photos bio interests age gender location')
      .limit(parseInt(limit));

      const validLocationProfiles = locationProfiles
        .filter(p => p.user?.accountStatus === 'active')
        .map(p => {
          fetchedProfileIds.add(p._id.toString());
          return formatProfile(p, 30, 'location');
        });

      if (validLocationProfiles.length > 0) {
        sections.push({
          id: 'location',
          title: `In ${myProfile.location.city}`,
          subtitle: 'People nearby',
          icon: 'location_on',
          profiles: validLocationProfiles,
          count: validLocationProfiles.length
        });
      }
    }

    // Section 4: Shared Interests
    if (myProfile.interests && myProfile.interests.length > 0) {
      const interestProfiles = await Profile.find({
        ...baseQuery,
        interests: { $in: myProfile.interests },
        _id: { $nin: [...fetchedProfileIds] }
      })
      .populate({ path: 'user', select: 'username accountStatus' })
      .select('name alias photos bio interests age gender')
      .limit(parseInt(limit));

      const validInterestProfiles = interestProfiles
        .filter(p => p.user?.accountStatus === 'active')
        .map(p => {
          const sharedInterests = p.interests.filter(i => myProfile.interests.includes(i));
          fetchedProfileIds.add(p._id.toString());
          return {
            ...formatProfile(p, 20 + sharedInterests.length * 5, 'interests'),
            sharedInterests
          };
        });

      if (validInterestProfiles.length > 0) {
        sections.push({
          id: 'interests',
          title: 'Shared Interests',
          subtitle: 'You have things in common',
          icon: 'favorite',
          profiles: validInterestProfiles,
          count: validInterestProfiles.length
        });
      }
    }

    // Section 5: Discover More
    const discoverProfiles = await Profile.aggregate([
      { $match: { 
        ...baseQuery,
        _id: { $nin: [...fetchedProfileIds].map(id => require('mongoose').Types.ObjectId.createFromHexString(id)) }
      }},
      { $sample: { size: parseInt(limit) } }
    ]);

    const populatedDiscoverProfiles = await Profile.populate(discoverProfiles, {
      path: 'user',
      select: 'username accountStatus'
    });

    const validDiscoverProfiles = populatedDiscoverProfiles
      .filter(p => p.user?.accountStatus === 'active')
      .map(p => formatProfile(p, 10, null));

    if (validDiscoverProfiles.length > 0) {
      sections.push({
        id: 'discover',
        title: 'Discover More',
        subtitle: 'Expand your circle',
        icon: 'explore',
        profiles: validDiscoverProfiles,
        count: validDiscoverProfiles.length
      });
    }

    return ApiResponse.success(res, {
      sections,
      totalProfiles: [...fetchedProfileIds].length + validDiscoverProfiles.length
    });

  } catch (error) {
    logger.error('Get feed sections error:', error);
    return ApiResponse.error(res, 'Error fetching feed sections');
  }
};

/**
 * @desc    Get discovery feed
 * @route   GET /api/v1/discover
 * @access  Private
 */
const getDiscoveryFeed = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      ageMin,
      ageMax,
      gender,
      city,
      college,
      workplace,
      interests
    } = req.query;
    
    logger.info(`Discovery request params: gender=${gender}, ageMin=${ageMin}, ageMax=${ageMax}`);

    // Load config for premium flags and limits
    const appConfig = await AppConfig.getConfig();

    // Get user's profile for matching
    const myProfile = await Profile.findOne({ user: req.userId });
    if (!myProfile) {
      return ApiResponse.badRequest(res, 'Please complete your profile first');
    }

    // Check daily discovery limit
    const dailyLimit = appConfig.microPayment?.dailyFreeDiscovery || parseInt(process.env.DAILY_DISCOVERY_LIMIT) || 50;

    // Get today's view count
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const todayViews = await ProfileView.countDocuments({
      viewer: req.userId,
      source: 'discovery_feed',
      createdAt: { $gte: startOfDay }
    });

    if (todayViews >= dailyLimit) {
      return ApiResponse.tooManyRequests(res, 'Daily discovery limit reached.');
    }

    const excludedIds = await getExcludedIds(req.userId);
    const query = buildBaseQuery(excludedIds, myProfile, gender);
    
    logger.info(`Discovery query for user ${req.userId}:`, JSON.stringify(query));

    // Apply filters
    if (ageMin || ageMax) {
      query.age = {};
      if (ageMin) query.age.$gte = parseInt(ageMin);
      if (ageMax) query.age.$lte = parseInt(ageMax);
    }

    // Location matching (only filter if explicitly requested)
    if (city) {
      query['location.city'] = new RegExp(city, 'i');
    }

    // College matching (only filter if explicitly requested)
    if (college) {
      query['college.name'] = new RegExp(college, 'i');
    }

    // Workplace matching (only filter if explicitly requested)
    if (workplace) {
      query['workplace.company'] = new RegExp(workplace, 'i');
    }

    // Interest matching (only filter if explicitly requested)
    if (interests) {
      const interestArray = interests.split(',').map(i => i.trim().toLowerCase());
      query.interests = { $in: interestArray };
    }

    // Get profiles with smart scoring
    let profiles = await Profile.find(query)
      .populate({
        path: 'user',
        select: 'username accountStatus'
      })
      .select('name alias photos bio interests age gender location college workplace promptAnswers whyOnApp lookingFor visibility showInFeed isComplete isBanned')
      .limit(parseInt(limit) * 3);
    
    // Filter out profiles where user is null or accountStatus is not active
    profiles = profiles.filter(p => p.user?.accountStatus === 'active');
    
    logger.info(`Found ${profiles.length} valid profiles`);
    
    // Score profiles with priority: workplace > college > location > interests
    profiles = profiles.map(profile => {
        let score = 0;
        let connectionType = null;

        // Score based on same workplace (highest priority)
        if (myProfile.workplace?.company && profile.workplace?.company) {
          if (profile.workplace.company.toLowerCase() === myProfile.workplace.company.toLowerCase()) {
            score += 50;
            connectionType = 'workplace';
          }
        }

        // Score based on same college
        if (myProfile.college?.name && profile.college?.name) {
          if (profile.college.name.toLowerCase() === myProfile.college.name.toLowerCase()) {
            score += 40;
            if (!connectionType) connectionType = 'college';
          }
        }

        // Score based on same location
        if (myProfile.location?.city && profile.location?.city) {
          if (profile.location.city.toLowerCase() === myProfile.location.city.toLowerCase()) {
            score += 30;
            if (!connectionType) connectionType = 'location';
          }
        }
        
        // Score based on shared interests
        if (myProfile.interests && profile.interests) {
          const sharedInterests = profile.interests.filter(i => 
            myProfile.interests.map(mi => mi.toLowerCase()).includes(i.toLowerCase())
          );
          score += sharedInterests.length * 5;
        }

        return {
          profile,
          score,
          connectionType
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, parseInt(limit));

    // Format response
    const formattedProfiles = profiles.map(({ profile, score, connectionType }) => 
      formatProfile(profile, score, connectionType)
    );

    // Log views
    for (const { profile } of profiles) {
      await ProfileView.logView(
        profile._id,
        profile.user._id,
        req.userId,
        'discovery_feed',
        true
      );
    }

    return ApiResponse.success(res, {
      profiles: formattedProfiles
    });

  } catch (error) {
    logger.error('Get discovery feed error:', error);
    return ApiResponse.error(res, 'Error fetching discovery feed');
  }
};

/**
 * @desc    Skip a profile
 * @route   POST /api/v1/discover/skip/:profileId
 * @access  Private
 */
const skipProfile = async (req, res) => {
  try {
    const { profileId } = req.params;

    const profile = await Profile.findById(profileId);
    if (!profile) {
      return ApiResponse.notFound(res, 'Profile not found');
    }

    // Check if already skipped
    const existing = await Skip.findOne({
      user: req.userId,
      skippedProfile: profileId
    });

    if (!existing) {
      await Skip.create({
        user: req.userId,
        skippedProfile: profileId,
        skippedUser: profile.user
      });
    }

    return ApiResponse.success(res, null, 'Profile skipped');

  } catch (error) {
    logger.error('Skip profile error:', error);
    return ApiResponse.error(res, 'Error skipping profile');
  }
};

/**
 * @desc    Get filter options
 * @route   GET /api/v1/discover/filters
 * @access  Private
 */
const getFilterOptions = async (req, res) => {
  try {
    // Get user's profile for defaults
    const myProfile = await Profile.findOne({ user: req.userId });

    // Get available cities
    const cities = await Profile.distinct('location.city', {
      'location.city': { $exists: true, $ne: '' },
      visibility: 'discoverable'
    });

    // Get available colleges
    const colleges = await Profile.distinct('college.name', {
      'college.name': { $exists: true, $ne: '' },
      visibility: 'discoverable'
    });

    // Get available companies
    const companies = await Profile.distinct('workplace.company', {
      'workplace.company': { $exists: true, $ne: '' },
      visibility: 'discoverable'
    });

    // Get popular interests
    const popularInterests = await Profile.aggregate([
      { $match: { visibility: 'discoverable' } },
      { $unwind: '$interests' },
      { $group: { _id: '$interests', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    return ApiResponse.success(res, {
      cities: cities.filter(c => c).slice(0, 50),
      colleges: colleges.filter(c => c).slice(0, 50),
      companies: companies.filter(c => c).slice(0, 50),
      interests: popularInterests.map(i => i._id),
      genders: ['male', 'female', 'non-binary', 'other'],
      ageRange: { min: 18, max: 60 },
      defaults: {
        city: myProfile?.location?.city,
        college: myProfile?.college?.name,
        workplace: myProfile?.workplace?.company,
        interestedIn: myProfile?.interestedIn || ['everyone']
      }
    });

  } catch (error) {
    logger.error('Get filter options error:', error);
    return ApiResponse.error(res, 'Error fetching filter options');
  }
};

/**
 * @desc    Get profiles from same college
 * @route   GET /api/v1/discover/college
 * @access  Private
 */
const getCollegeProfiles = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const myProfile = await Profile.findOne({ user: req.userId });
    
    if (!myProfile?.college?.name) {
      return ApiResponse.success(res, { profiles: [], total: 0 });
    }

    const blockedIds = await Block.getAllBlockRelatedUserIds(req.userId);

    const profiles = await Profile.find({
      user: { $ne: req.userId, $nin: blockedIds },
      'college.name': myProfile.college.name,
      visibility: 'discoverable',
      isComplete: true,
      isBanned: false
    })
    .populate({
      path: 'user',
      select: 'username',
      match: { accountStatus: 'active' }
    })
    .select('name photos bio interests age gender college whyOnApp lookingFor')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

    const validProfiles = profiles.filter(p => p.user);

    // Format profiles with properly serialized photos
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

    const total = await Profile.countDocuments({
      user: { $ne: req.userId, $nin: blockedIds },
      'college.name': myProfile.college.name,
      visibility: 'discoverable',
      isComplete: true,
      isBanned: false
    });

    return ApiResponse.paginated(res, formattedProfiles, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });

  } catch (error) {
    logger.error('Get college profiles error:', error);
    return ApiResponse.error(res, 'Error fetching college profiles');
  }
};

/**
 * @desc    Get profiles from same workplace
 * @route   GET /api/v1/discover/workplace
 * @access  Private
 */
const getWorkplaceProfiles = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const myProfile = await Profile.findOne({ user: req.userId });
    
    if (!myProfile?.workplace?.company) {
      return ApiResponse.success(res, { profiles: [], total: 0 });
    }

    const blockedIds = await Block.getAllBlockRelatedUserIds(req.userId);

    const profiles = await Profile.find({
      user: { $ne: req.userId, $nin: blockedIds },
      'workplace.company': myProfile.workplace.company,
      visibility: 'discoverable',
      isComplete: true,
      isBanned: false
    })
    .populate({
      path: 'user',
      select: 'username',
      match: { accountStatus: 'active' }
    })
    .select('name photos bio interests age gender workplace whyOnApp lookingFor')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

    const validProfiles = profiles.filter(p => p.user);

    // Format profiles with properly serialized photos
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

    const total = await Profile.countDocuments({
      user: { $ne: req.userId, $nin: blockedIds },
      'workplace.company': myProfile.workplace.company,
      visibility: 'discoverable',
      isComplete: true,
      isBanned: false
    });

    return ApiResponse.paginated(res, formattedProfiles, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });

  } catch (error) {
    logger.error('Get workplace profiles error:', error);
    return ApiResponse.error(res, 'Error fetching workplace profiles');
  }
};

module.exports = {
  getDiscoveryFeed,
  getSmartFeed,
  getFeedSections,
  skipProfile,
  getFilterOptions,
  getCollegeProfiles,
  getWorkplaceProfiles
};

