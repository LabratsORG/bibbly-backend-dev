/**
 * Helper Utilities
 */

const crypto = require('crypto');
const QRCode = require('qrcode');

/**
 * Generate unique username from name
 * Ensures minimum 6 characters as required by User model
 */
const generateUsername = (name) => {
  const baseUsername = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 15);
  // Generate random suffix to ensure uniqueness and minimum length
  // Use 4 bytes (8 hex chars) to ensure we always meet 6 char minimum
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const username = `${baseUsername}${randomSuffix}`;
  
  // Ensure minimum 6 characters (if base is too short, use more random chars)
  if (username.length < 6) {
    const additionalChars = crypto.randomBytes(2).toString('hex');
    return `${baseUsername}${randomSuffix}${additionalChars}`.substring(0, 30);
  }
  
  return username.substring(0, 30); // Ensure max length
};

/**
 * Generate profile share link
 */
const generateProfileLink = (username) => {
  const baseUrl = process.env.APP_URL || 'https://bibbly.app';
  return `${baseUrl}/${username}`;
};

/**
 * Generate deep link for mobile app
 */
const generateDeepLink = (type, id) => {
  const deepLinkBase = process.env.APP_DEEP_LINK || 'bibbly://';
  return `${deepLinkBase}${type}/${id}`;
};

/**
 * Generate QR code for profile
 */
const generateQRCode = async (data) => {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(data, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrCodeDataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
};

/**
 * Calculate age from date of birth
 */
const calculateAge = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

/**
 * Sanitize user object for response (remove sensitive data)
 */
const sanitizeUser = (user) => {
  const sanitized = user.toObject ? user.toObject() : { ...user };
  delete sanitized.password;
  delete sanitized.refreshTokens;
  delete sanitized.passwordResetToken;
  delete sanitized.passwordResetExpires;
  return sanitized;
};

/**
 * Generate random token
 */
const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Mask email for privacy
 */
const maskEmail = (email) => {
  const [localPart, domain] = email.split('@');
  const maskedLocal = localPart.charAt(0) + 
    '*'.repeat(Math.max(localPart.length - 2, 1)) + 
    localPart.charAt(localPart.length - 1);
  return `${maskedLocal}@${domain}`;
};

/**
 * Format message preview for notifications
 */
const formatMessagePreview = (message, maxLength = 50) => {
  if (!message) return '';
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength) + '...';
};

/**
 * Check if date is within last N days
 */
const isWithinDays = (date, days) => {
  const now = new Date();
  const checkDate = new Date(date);
  const diffTime = now - checkDate;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays <= days;
};

/**
 * Get start of today (UTC)
 */
const getStartOfToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/**
 * Paginate array
 */
const paginateArray = (array, page = 1, limit = 20) => {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  return {
    data: array.slice(startIndex, endIndex),
    pagination: {
      page,
      limit,
      total: array.length
    }
  };
};

module.exports = {
  generateUsername,
  generateProfileLink,
  generateDeepLink,
  generateQRCode,
  calculateAge,
  sanitizeUser,
  generateToken,
  maskEmail,
  formatMessagePreview,
  isWithinDays,
  getStartOfToday,
  paginateArray
};

