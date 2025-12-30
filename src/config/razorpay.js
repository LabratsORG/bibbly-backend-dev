/**
 * Razorpay Configuration
 * Payment gateway integration
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Initialize Razorpay instance
let razorpayInstance = null;

const initializeRazorpay = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    logger.warn('Razorpay credentials not configured. Payment features will be disabled.');
    return null;
  }

  try {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
    logger.info('Razorpay initialized successfully');
    return razorpayInstance;
  } catch (error) {
    logger.error('Razorpay initialization error:', error);
    return null;
  }
};

// Get Razorpay instance
const getRazorpayInstance = () => {
  if (!razorpayInstance) {
    return initializeRazorpay();
  }
  return razorpayInstance;
};

/**
 * Create a Razorpay order
 * @param {Number} amount - Amount in paisa
 * @param {String} currency - Currency code (default: INR)
 * @param {Object} notes - Additional notes/metadata
 * @returns {Promise<Object>} Razorpay order object
 */
const createOrder = async (amount, currency = 'INR', notes = {}) => {
  try {
    const razorpay = getRazorpayInstance();
    
    if (!razorpay) {
      throw new Error('Razorpay not initialized');
    }

    const options = {
      amount: amount, // Amount in paisa
      currency: currency,
      receipt: `receipt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      notes: notes
    };

    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    logger.error('Create Razorpay order error:', error);
    throw error;
  }
};

/**
 * Verify Razorpay payment signature
 * @param {String} orderId - Razorpay order ID
 * @param {String} paymentId - Razorpay payment ID
 * @param {String} signature - Payment signature from Razorpay
 * @returns {Boolean} True if signature is valid
 */
const verifyPayment = (orderId, paymentId, signature) => {
  try {
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
    
    if (!razorpaySecret) {
      logger.error('Razorpay secret not configured');
      return false;
    }

    // Create expected signature
    const text = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', razorpaySecret)
      .update(text)
      .digest('hex');

    // Compare signatures
    const isValid = expectedSignature === signature;
    
    if (!isValid) {
      logger.warn(`Invalid payment signature for order ${orderId}`);
    }
    
    return isValid;
  } catch (error) {
    logger.error('Verify payment error:', error);
    return false;
  }
};

/**
 * Verify Razorpay webhook signature
 * @param {String} payload - Webhook payload (JSON string)
 * @param {String} signature - Webhook signature
 * @returns {Boolean} True if signature is valid
 */
const verifyWebhookSignature = (payload, signature) => {
  try {
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
    
    if (!razorpaySecret) {
      logger.error('Razorpay secret not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', razorpaySecret)
      .update(payload)
      .digest('hex');

    return expectedSignature === signature;
  } catch (error) {
    logger.error('Verify webhook signature error:', error);
    return false;
  }
};

/**
 * Fetch payment details from Razorpay
 * @param {String} paymentId - Razorpay payment ID
 * @returns {Promise<Object>} Payment details
 */
const getPaymentDetails = async (paymentId) => {
  try {
    const razorpay = getRazorpayInstance();
    
    if (!razorpay) {
      throw new Error('Razorpay not initialized');
    }

    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    logger.error('Get payment details error:', error);
    throw error;
  }
};

/**
 * Refund a payment
 * @param {String} paymentId - Razorpay payment ID
 * @param {Number} amount - Amount to refund in paisa (optional, full refund if not provided)
 * @param {String} notes - Refund notes
 * @returns {Promise<Object>} Refund details
 */
const refundPayment = async (paymentId, amount = null, notes = {}) => {
  try {
    const razorpay = getRazorpayInstance();
    
    if (!razorpay) {
      throw new Error('Razorpay not initialized');
    }

    const options = {
      notes: notes
    };

    if (amount) {
      options.amount = amount;
    }

    const refund = await razorpay.payments.refund(paymentId, options);
    return refund;
  } catch (error) {
    logger.error('Refund payment error:', error);
    throw error;
  }
};

// Initialize on module load
initializeRazorpay();

module.exports = {
  getRazorpayInstance,
  createOrder,
  verifyPayment,
  verifyWebhookSignature,
  getPaymentDetails,
  refundPayment
};

