/**
 * Legal Controller
 * Handles terms of service, privacy policy, and community guidelines
 */

const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const AppConfig = require('../models/AppConfig');

/**
 * @desc    Get Terms of Service
 * @route   GET /api/v1/legal/terms
 * @access  Public
 */
const getTermsOfService = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    let content = 'Terms of Service will be available soon.';
    
    if (config.legalContent && config.legalContent.termsOfService) {
      content = config.legalContent.termsOfService;
    }
    
    return ApiResponse.success(res, { content });
  } catch (error) {
    logger.error('Get terms of service error:', error);
    return ApiResponse.error(res, 'Error fetching terms of service');
  }
};

/**
 * @desc    Get Privacy Policy
 * @route   GET /api/v1/legal/privacy
 * @access  Public
 */
const getPrivacyPolicy = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    let content = 'Privacy Policy will be available soon.';
    
    if (config.legalContent && config.legalContent.privacyPolicy) {
      content = config.legalContent.privacyPolicy;
    }
    
    return ApiResponse.success(res, { content });
  } catch (error) {
    logger.error('Get privacy policy error:', error);
    return ApiResponse.error(res, 'Error fetching privacy policy');
  }
};

/**
 * @desc    Get Community Guidelines
 * @route   GET /api/v1/legal/guidelines
 * @access  Public
 */
const getCommunityGuidelines = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    let content = 'Community Guidelines will be available soon.';
    
    if (config.legalContent && config.legalContent.communityGuidelines) {
      content = config.legalContent.communityGuidelines;
    }
    
    return ApiResponse.success(res, { content });
  } catch (error) {
    logger.error('Get community guidelines error:', error);
    return ApiResponse.error(res, 'Error fetching community guidelines');
  }
};

module.exports = {
  getTermsOfService,
  getPrivacyPolicy,
  getCommunityGuidelines,
};

