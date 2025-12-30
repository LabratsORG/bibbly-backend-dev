/**
 * Support Controller
 * Handles help, FAQ, safety guidelines, and feedback
 */

const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const AppConfig = require('../models/AppConfig');
const Feedback = require('../models/Feedback');

/**
 * @desc    Get Help & FAQ content
 * @route   GET /api/v1/support/help-faq
 * @access  Public
 */
const getHelpFAQ = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    let content = 'Help & FAQ content will be available soon. Please contact support for assistance.';
    
    if (config.supportContent && config.supportContent.helpFAQ) {
      content = config.supportContent.helpFAQ;
    }
    
    return ApiResponse.success(res, { content });
  } catch (error) {
    logger.error('Get help FAQ error:', error);
    return ApiResponse.error(res, 'Error fetching help & FAQ');
  }
};

/**
 * @desc    Get Safety Guidelines content
 * @route   GET /api/v1/support/safety-guidelines
 * @access  Public
 */
const getSafetyGuidelines = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    let content = 'Safety guidelines will be available soon. Please stay safe and report any concerns.';
    
    if (config.supportContent && config.supportContent.safetyGuidelines) {
      content = config.supportContent.safetyGuidelines;
    }
    
    return ApiResponse.success(res, { content });
  } catch (error) {
    logger.error('Get safety guidelines error:', error);
    return ApiResponse.error(res, 'Error fetching safety guidelines');
  }
};

/**
 * @desc    Send feedback
 * @route   POST /api/v1/support/feedback
 * @access  Private
 */
const sendFeedback = async (req, res) => {
  try {
    const { type, subject, message } = req.body;

    logger.info('Feedback submission received:', {
      userId: req.userId,
      type,
      hasSubject: !!subject,
      hasMessage: !!message,
      subjectLength: subject?.length,
      messageLength: message?.length
    });

    if (!subject || !message) {
      logger.warn('Feedback validation failed: missing subject or message');
      return ApiResponse.badRequest(res, 'Subject and message are required');
    }

    // Validate subject and message length
    if (subject.length > 200) {
      return ApiResponse.badRequest(res, 'Subject cannot exceed 200 characters');
    }

    if (message.length > 2000) {
      return ApiResponse.badRequest(res, 'Message cannot exceed 2000 characters');
    }

    if (message.length < 10) {
      return ApiResponse.badRequest(res, 'Message must be at least 10 characters');
    }

    // Validate type
    const validTypes = ['general', 'bug', 'feature', 'safety', 'other'];
    const feedbackType = validTypes.includes(type) ? type : 'general';

    // Check if Feedback model is available
    if (!Feedback) {
      logger.error('Feedback model is not available');
      return ApiResponse.error(res, 'Feedback system is not available. Please contact support.');
    }

    // Save feedback to database
    const feedback = await Feedback.create({
      user: req.userId,
      type: feedbackType,
      subject: subject.trim(),
      message: message.trim()
    });

    logger.info(`Feedback saved successfully: ${feedback._id}`, {
      feedbackId: feedback._id,
      userId: req.userId,
      type: feedback.type,
      subject: feedback.subject.substring(0, 50)
    });
    
    return ApiResponse.success(res, { feedbackId: feedback._id }, 'Thank you for your feedback!');
  } catch (error) {
    logger.error('Send feedback error:', {
      error: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    // Provide more specific error messages
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((e) => e.message);
      return ApiResponse.badRequest(res, errors.join(', '));
    }
    
    if (error.code === 11000) {
      return ApiResponse.badRequest(res, 'Duplicate feedback entry');
    }

    if (error.name === 'CastError') {
      return ApiResponse.badRequest(res, 'Invalid user ID');
    }
    
    return ApiResponse.error(res, 'Error sending feedback. Please try again.');
  }
};

module.exports = {
  getHelpFAQ,
  getSafetyGuidelines,
  sendFeedback,
};

