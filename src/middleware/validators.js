/**
 * Request Validation Middleware using express-validator
 */

const { body, param, query, validationResult } = require('express-validator');
const ApiResponse = require('../utils/apiResponse');

// Handle validation result
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path,
      message: err.msg
    }));
    return ApiResponse.badRequest(res, 'Validation failed', errorMessages);
  }
  next();
};

// Auth validators
const validateSignup = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('name')
    .optional({ nullable: true, checkFalsy: true }) // Name is optional during signup, will be collected in profile setup
    .if((value) => value && value.trim().length > 0) // Only validate if provided and not empty
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('username')
    .trim()
    .isLength({ min: 6, max: 30 })
    .withMessage('Username must be between 6 and 30 characters')
    .matches(/^[a-z0-9_]+$/)
    .withMessage('Username can only contain lowercase letters, numbers, and underscores'),
  handleValidation
];

const validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidation
];

const validateGoogleAuth = [
  body('idToken')
    .notEmpty()
    .withMessage('Google ID token is required'),
  handleValidation
];

// Profile validators
const validateProfileSetup = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('dateOfBirth')
    .isISO8601()
    .withMessage('Please provide a valid date of birth')
    .custom((value) => {
      const birthDate = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < 18) {
        throw new Error('You must be at least 18 years old');
      }
      return true;
    }),
  body('gender')
    .isIn(['male', 'female', 'non-binary', 'other', 'prefer_not_to_say'])
    .withMessage('Please select a valid gender'),
  body('relationshipIntent')
    .isIn(['casual', 'serious', 'friendship', 'networking', 'not_sure'])
    .withMessage('Please select a valid relationship intent'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  body('interests')
    .optional()
    .isArray({ min: 1, max: 10 })
    .withMessage('Please provide between 1 and 10 interests'),
  handleValidation
];

const validateProfileUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  body('interests')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Maximum 10 interests allowed'),
  body('visibility')
    .optional()
    .isIn(['invisible', 'searchable', 'discoverable'])
    .withMessage('Invalid visibility setting'),
  handleValidation
];

// Message validators
const validateMessageRequest = [
  body('recipientId')
    .isMongoId()
    .withMessage('Invalid recipient ID'),
  body('message')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Message must be between 1 and 500 characters'),
  body('source')
    .isIn(['profile_link', 'search', 'discovery_feed', 'qr_code'])
    .withMessage('Invalid source'),
  handleValidation
];

const validateMessage = [
  body('content')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be between 1 and 2000 characters'),
  handleValidation
];

// Search validators
const validateSearch = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Search query must be at least 2 characters'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  handleValidation
];

// Report validator
const validateReport = [
  body('reportedUserId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  body('reason')
    .isIn([
      'harassment', 'hate_speech', 'inappropriate_content', 'spam',
      'fake_profile', 'underage', 'scam', 'violence', 'self_harm',
      'impersonation', 'other'
    ])
    .withMessage('Invalid report reason'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  handleValidation
];

// Block validator
const validateBlock = [
  body('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  body('reason')
    .optional()
    .isIn(['harassment', 'spam', 'inappropriate', 'fake_profile', 'other', 'not_specified'])
    .withMessage('Invalid block reason'),
  handleValidation
];

// ID param validator
const validateId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID'),
  handleValidation
];

// Username param validator
const validateUsername = [
  param('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Invalid username')
    .matches(/^[a-z0-9_]+$/)
    .withMessage('Username can only contain lowercase letters, numbers, and underscores'),
  handleValidation
];

module.exports = {
  handleValidation,
  validateSignup,
  validateLogin,
  validateGoogleAuth,
  validateProfileSetup,
  validateProfileUpdate,
  validateMessageRequest,
  validateMessage,
  validateSearch,
  validateReport,
  validateBlock,
  validateId,
  validateUsername
};

