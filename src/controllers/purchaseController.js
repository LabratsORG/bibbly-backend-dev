/**
 * Purchase Controller
 * Handles micro-payment purchases for users
 */

const AppConfig = require('../models/AppConfig');
const PurchasedPack = require('../models/PurchasedPack');
const User = require('../models/User');
const MessageRequest = require('../models/MessageRequest');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { createOrder, verifyPayment, getPaymentDetails } = require('../config/razorpay');

/**
 * @desc    Get available request packs for purchase
 * @route   GET /api/v1/purchase/packs
 * @access  Private
 */
const getAvailablePacks = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    
    if (!config.microPayments.isEnabled) {
      return ApiResponse.success(res, {
        isEnabled: false,
        packs: [],
        message: 'Request packs are currently not available'
      });
    }
    
    const activePacks = config.microPayments.requestPacks.filter(p => p.isActive);
    
    return ApiResponse.success(res, {
      isEnabled: true,
      packs: activePacks.map(p => ({
        packId: p.packId,
        name: p.name,
        requestCount: p.requestCount,
        price: p.priceDisplay,
        priceInPaisa: p.priceInPaisa
      }))
    });
  } catch (error) {
    logger.error('Get available packs error:', error);
    return ApiResponse.error(res, 'Error fetching packs');
  }
};

/**
 * @desc    Get user's current request balance
 * @route   GET /api/v1/purchase/balance
 * @access  Private
 */
const getRequestBalance = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    const userId = req.userId;
    
    // Get daily free limit
    const dailyFreeLimit = config.microPayments.dailyFreeRequests;
    
    // Get today's usage
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const todayUsed = await MessageRequest.countDocuments({
      sender: userId,
      createdAt: { $gte: startOfDay }
    });
    
    // Get purchased requests remaining
    const purchasedRemaining = await PurchasedPack.getTotalRemainingRequests(userId);
    
    // Calculate free remaining
    const freeRemaining = Math.max(0, dailyFreeLimit - todayUsed);
    
    // Get active packs
    const activePacks = await PurchasedPack.getActivePacks(userId);
    
    return ApiResponse.success(res, {
      dailyFreeLimit,
      dailyFreeUsed: Math.min(todayUsed, dailyFreeLimit),
      dailyFreeRemaining: freeRemaining,
      purchasedRemaining,
      totalAvailable: freeRemaining + purchasedRemaining,
      activePacks: activePacks.map(p => ({
        packId: p.packId,
        packName: p.packName,
        remaining: p.requestsRemaining,
        expiresAt: p.expiresAt
      }))
    });
  } catch (error) {
    logger.error('Get request balance error:', error);
    return ApiResponse.error(res, 'Error fetching balance');
  }
};

/**
 * @desc    Create Razorpay order for pack purchase
 * @route   POST /api/v1/purchase/packs/:packId/order
 * @access  Private
 */
const createPackOrder = async (req, res) => {
  try {
    const { packId } = req.params;
    const config = await AppConfig.getConfig();
    
    if (!config.microPayments.isEnabled) {
      return ApiResponse.badRequest(res, 'Request packs are currently not available');
    }
    
    // Find pack
    const pack = config.microPayments.requestPacks.find(p => p.packId === packId && p.isActive);
    
    if (!pack) {
      return ApiResponse.notFound(res, 'Pack not found or not available');
    }
    
    // Create Razorpay order
    const order = await createOrder(pack.priceInPaisa, 'INR', {
      packId: pack.packId,
      packName: pack.name,
      userId: req.userId.toString(),
      requestCount: pack.requestCount.toString()
    });
    
    logger.info(`Razorpay order created for user ${req.userId}, pack ${packId}, order ${order.id}`);
    
    return ApiResponse.success(res, {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      pack: {
        packId: pack.packId,
        name: pack.name,
        requestCount: pack.requestCount,
        price: pack.priceDisplay
      }
    }, 'Order created successfully');
  } catch (error) {
    logger.error('Create pack order error:', error);
    return ApiResponse.error(res, error.message || 'Error creating order');
  }
};

/**
 * @desc    Verify and complete pack purchase
 * @route   POST /api/v1/purchase/packs/:packId/verify
 * @access  Private
 */
const purchasePack = async (req, res) => {
  try {
    const { packId } = req.params;
    const { orderId, paymentId, signature, paymentMethod = 'razorpay' } = req.body;
    
    if (!orderId || !paymentId || !signature) {
      return ApiResponse.badRequest(res, 'Missing payment details');
    }
    
    const config = await AppConfig.getConfig();
    
    if (!config.microPayments.isEnabled) {
      return ApiResponse.badRequest(res, 'Request packs are currently not available');
    }
    
    // Find pack
    const pack = config.microPayments.requestPacks.find(p => p.packId === packId && p.isActive);
    
    if (!pack) {
      return ApiResponse.notFound(res, 'Pack not found or not available');
    }
    
    // Verify payment signature
    const isPaymentValid = verifyPayment(orderId, paymentId, signature);
    
    if (!isPaymentValid) {
      logger.warn(`Invalid payment signature for order ${orderId} by user ${req.userId}`);
      return ApiResponse.badRequest(res, 'Payment verification failed. Please try again.');
    }
    
    // Verify payment details from Razorpay
    try {
      const paymentDetails = await getPaymentDetails(paymentId);
      
      // Check if payment is successful
      if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
        return ApiResponse.badRequest(res, 'Payment not successful');
      }
      
      // Check if amount matches
      if (paymentDetails.amount !== pack.priceInPaisa) {
        logger.warn(`Amount mismatch for order ${orderId}. Expected: ${pack.priceInPaisa}, Got: ${paymentDetails.amount}`);
        return ApiResponse.badRequest(res, 'Payment amount mismatch');
      }
      
      // Check if order already processed
      const existingPurchase = await PurchasedPack.findOne({
        user: req.userId,
        paymentId: paymentId,
        status: 'active'
      });
      
      if (existingPurchase) {
        return ApiResponse.success(res, {
          purchase: {
            id: existingPurchase._id,
            packName: existingPurchase.packName,
            requestCount: existingPurchase.requestCount,
            expiresAt: existingPurchase.expiresAt
          }
        }, 'Pack already purchased with this payment');
      }
      
      // Create purchased pack
      const purchasedPack = await PurchasedPack.create({
        user: req.userId,
        packId: pack.packId,
        packName: pack.name,
        requestCount: pack.requestCount,
        requestsRemaining: pack.requestCount,
        pricePaid: pack.priceInPaisa,
        paymentId: paymentId,
        orderId: orderId,
        paymentMethod: paymentMethod,
        status: 'active'
      });
      
      // Create notification
      await Notification.createNotification(
        req.userId,
        'system',
        'Pack Purchased! 🎉',
        `You now have ${pack.requestCount} extra message requests!`,
        { targetType: 'settings' }
      );
      
      logger.info(`User ${req.userId} successfully purchased pack ${packId} with payment ${paymentId}`);
      
      return ApiResponse.success(res, {
        purchase: {
          id: purchasedPack._id,
          packName: purchasedPack.packName,
          requestCount: purchasedPack.requestCount,
          expiresAt: purchasedPack.expiresAt
        }
      }, 'Pack purchased successfully!');
      
    } catch (paymentError) {
      logger.error('Payment verification error:', paymentError);
      return ApiResponse.error(res, 'Error verifying payment. Please contact support.');
    }
  } catch (error) {
    logger.error('Purchase pack error:', error);
    return ApiResponse.error(res, 'Error purchasing pack');
  }
};

/**
 * @desc    Get purchase history
 * @route   GET /api/v1/purchase/history
 * @access  Private
 */
const getPurchaseHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const purchases = await PurchasedPack.find({ user: req.userId })
      .sort({ purchasedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await PurchasedPack.countDocuments({ user: req.userId });
    
    // Calculate total spent
    const totalSpent = await PurchasedPack.aggregate([
      { $match: { user: req.userId } },
      { $group: { _id: null, total: { $sum: '$pricePaid' } } }
    ]);
    
    return ApiResponse.paginated(res, purchases, {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalSpent: totalSpent[0]?.total || 0,
      totalSpentDisplay: `₹${((totalSpent[0]?.total || 0) / 100).toFixed(2)}`
    });
  } catch (error) {
    logger.error('Get purchase history error:', error);
    return ApiResponse.error(res, 'Error fetching purchase history');
  }
};

/**
 * @desc    Check if user can send request (checks limits)
 * @route   GET /api/v1/purchase/can-send-request
 * @access  Private
 */
const canSendRequest = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    const userId = req.userId;
    const user = await User.findById(userId);
    
    // Check if premium and premium is enabled
    if (config.isPremiumEnabled && user.checkPremiumStatus()) {
      return ApiResponse.success(res, {
        canSend: true,
        reason: 'premium',
        message: 'You have unlimited requests as a premium user'
      });
    }
    
    // Get daily free limit
    const dailyFreeLimit = config.microPayments.dailyFreeRequests;
    
    // Get today's usage
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const todayUsed = await MessageRequest.countDocuments({
      sender: userId,
      createdAt: { $gte: startOfDay }
    });
    
    // Check if free requests available
    if (todayUsed < dailyFreeLimit) {
      return ApiResponse.success(res, {
        canSend: true,
        reason: 'free',
        remaining: dailyFreeLimit - todayUsed,
        message: `You have ${dailyFreeLimit - todayUsed} free request(s) remaining today`
      });
    }
    
    // Check purchased packs
    const purchasedRemaining = await PurchasedPack.getTotalRemainingRequests(userId);
    
    if (purchasedRemaining > 0) {
      return ApiResponse.success(res, {
        canSend: true,
        reason: 'purchased',
        remaining: purchasedRemaining,
        message: `You have ${purchasedRemaining} purchased request(s) remaining`
      });
    }
    
    // No requests available
    const packs = config.microPayments.requestPacks.filter(p => p.isActive);
    
    return ApiResponse.success(res, {
      canSend: false,
      reason: 'limit_reached',
      message: `You've used all ${dailyFreeLimit} free requests today. Purchase more to continue!`,
      availablePacks: packs.map(p => ({
        packId: p.packId,
        name: p.name,
        requestCount: p.requestCount,
        price: p.priceDisplay
      }))
    });
  } catch (error) {
    logger.error('Can send request error:', error);
    return ApiResponse.error(res, 'Error checking request limit');
  }
};

/**
 * @desc    Use a request (called internally when sending request)
 * @route   Internal use only
 */
const useRequest = async (userId) => {
  const config = await AppConfig.getConfig();
  const user = await User.findById(userId);
  
  // Premium users with premium enabled - no deduction needed
  if (config.isPremiumEnabled && user.checkPremiumStatus()) {
    return { success: true, source: 'premium' };
  }
  
  const dailyFreeLimit = config.microPayments.dailyFreeRequests;
  
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const todayUsed = await MessageRequest.countDocuments({
    sender: userId,
    createdAt: { $gte: startOfDay }
  });
  
  // Use free request if available
  if (todayUsed < dailyFreeLimit) {
    return { success: true, source: 'free', remaining: dailyFreeLimit - todayUsed - 1 };
  }
  
  // Try to use from purchased packs
  const purchasedRemaining = await PurchasedPack.getTotalRemainingRequests(userId);
  
  if (purchasedRemaining > 0) {
    await PurchasedPack.useFromPacks(userId, 1);
    return { success: true, source: 'purchased', remaining: purchasedRemaining - 1 };
  }
  
  return { success: false, reason: 'no_requests_available' };
};

// ==================== UNREVEALED CHAT MESSAGE PAYMENT ====================

/**
 * @desc    Get unrevealed chat message payment settings
 * @route   GET /api/v1/purchase/message-payment-settings
 * @access  Private
 */
const getMessagePaymentSettings = async (req, res) => {
  try {
    const config = await AppConfig.getConfig();
    const unrevealedPayment = config.microPayments?.unrevealedChatPayment;
    
    if (!unrevealedPayment?.isEnabled) {
      return ApiResponse.success(res, {
        isEnabled: false,
        message: 'Unrevealed chat payment is not enabled'
      });
    }
    
    return ApiResponse.success(res, {
      isEnabled: true,
      freeMessageLimit: unrevealedPayment.freeMessageLimit,
      priceInPaisa: unrevealedPayment.pricePerMessageInPaisa,
      priceDisplay: unrevealedPayment.priceDisplay
    });
  } catch (error) {
    logger.error('Get message payment settings error:', error);
    return ApiResponse.error(res, 'Error fetching settings');
  }
};

/**
 * @desc    Get message payment status for a conversation
 * @route   GET /api/v1/purchase/conversations/:conversationId/message-status
 * @access  Private
 */
const getMessagePaymentStatus = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': userId,
      status: 'active'
    });
    
    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }
    
    // Check if user is initiator
    const isInitiator = conversation.initiator && 
                        conversation.initiator.toString() === userId.toString();
    
    if (!isInitiator) {
      return ApiResponse.success(res, {
        isInitiator: false,
        needsToPay: false,
        message: 'Only the initiator needs to pay for messages'
      });
    }
    
    const config = await AppConfig.getConfig();
    const unrevealedPayment = config.microPayments?.unrevealedChatPayment;
    
    if (!unrevealedPayment?.isEnabled) {
      return ApiResponse.success(res, {
        isEnabled: false,
        needsToPay: false,
        message: 'Unrevealed chat payment is not enabled'
      });
    }
    
    const freeMessageLimit = unrevealedPayment.freeMessageLimit || 100;
    const stats = conversation.getInitiatorMessageStats(freeMessageLimit);
    
    return ApiResponse.success(res, {
      isEnabled: true,
      isInitiator: true,
      isRevealed: stats.isRevealed,
      needsToPay: stats.needsToPay,
      currentCount: stats.currentCount,
      freeMessageLimit: stats.limitPerCycle,
      paidCycles: stats.paidCycles,
      messagesUntilPayment: stats.messagesUntilPayment,
      priceInPaisa: unrevealedPayment.pricePerMessageInPaisa,
      priceDisplay: unrevealedPayment.priceDisplay
    });
  } catch (error) {
    logger.error('Get message payment status error:', error);
    return ApiResponse.error(res, 'Error fetching status');
  }
};

/**
 * @desc    Create Razorpay order for message payment
 * @route   POST /api/v1/purchase/conversations/:conversationId/message-order
 * @access  Private
 */
const createMessageOrder = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.userId;
    
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': userId,
      status: 'active'
    });
    
    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }
    
    // Check if user is initiator
    const isInitiator = conversation.initiator && 
                        conversation.initiator.toString() === userId.toString();
    
    if (!isInitiator) {
      return ApiResponse.forbidden(res, 'Only the initiator can pay for messages');
    }
    
    const config = await AppConfig.getConfig();
    const unrevealedPayment = config.microPayments?.unrevealedChatPayment;
    
    if (!unrevealedPayment?.isEnabled) {
      return ApiResponse.badRequest(res, 'Unrevealed chat payment is not enabled');
    }
    
    const freeMessageLimit = unrevealedPayment.freeMessageLimit || 100;
    
    // Verify payment is actually needed
    if (!conversation.initiatorNeedsToPay(freeMessageLimit)) {
      return ApiResponse.badRequest(res, 'Payment is not required at this time');
    }
    
    // Create Razorpay order
    const order = await createOrder(unrevealedPayment.pricePerMessageInPaisa, 'INR', {
      type: 'message_payment',
      conversationId: conversationId.toString(),
      userId: userId.toString(),
      freeMessageLimit: freeMessageLimit.toString(),
      cycle: ((conversation.initiatorPaidCycles || 0) + 1).toString()
    });
    
    logger.info(`Razorpay message order created for user ${userId}, conversation ${conversationId}, order ${order.id}`);
    
    return ApiResponse.success(res, {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      conversationId,
      priceDisplay: unrevealedPayment.priceDisplay,
      freeMessageLimit
    }, 'Order created successfully');
  } catch (error) {
    logger.error('Create message order error:', error);
    return ApiResponse.error(res, error.message || 'Error creating order');
  }
};

/**
 * @desc    Verify and complete message payment
 * @route   POST /api/v1/purchase/conversations/:conversationId/message-verify
 * @access  Private
 */
const verifyMessagePayment = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { orderId, paymentId, signature } = req.body;
    const userId = req.userId;
    
    if (!orderId || !paymentId || !signature) {
      return ApiResponse.badRequest(res, 'Missing payment details');
    }
    
    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': userId,
      status: 'active'
    });
    
    if (!conversation) {
      return ApiResponse.notFound(res, 'Conversation not found');
    }
    
    // Check if user is initiator
    const isInitiator = conversation.initiator && 
                        conversation.initiator.toString() === userId.toString();
    
    if (!isInitiator) {
      return ApiResponse.forbidden(res, 'Only the initiator can pay for messages');
    }
    
    const config = await AppConfig.getConfig();
    const unrevealedPayment = config.microPayments?.unrevealedChatPayment;
    
    if (!unrevealedPayment?.isEnabled) {
      return ApiResponse.badRequest(res, 'Unrevealed chat payment is not enabled');
    }
    
    // Verify payment signature
    const isPaymentValid = verifyPayment(orderId, paymentId, signature);
    
    if (!isPaymentValid) {
      logger.warn(`Invalid message payment signature for order ${orderId} by user ${userId}`);
      return ApiResponse.badRequest(res, 'Payment verification failed. Please try again.');
    }
    
    // Verify payment details from Razorpay
    try {
      const paymentDetails = await getPaymentDetails(paymentId);
      
      // Check if payment is successful
      if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
        return ApiResponse.badRequest(res, 'Payment not successful');
      }
      
      // Check if amount matches
      if (paymentDetails.amount !== unrevealedPayment.pricePerMessageInPaisa) {
        logger.warn(`Amount mismatch for message order ${orderId}. Expected: ${unrevealedPayment.pricePerMessageInPaisa}, Got: ${paymentDetails.amount}`);
        return ApiResponse.badRequest(res, 'Payment amount mismatch');
      }
      
      // Record payment and reset counter
      await conversation.recordMessagePayment(
        paymentId, 
        orderId, 
        unrevealedPayment.pricePerMessageInPaisa
      );
      
      // Create notification
      await Notification.createNotification(
        userId,
        'system',
        'Payment Successful! 💰',
        `You can now send ${unrevealedPayment.freeMessageLimit} more messages!`,
        { targetType: 'conversation', targetId: conversationId }
      );
      
      logger.info(`User ${userId} successfully paid for messages in conversation ${conversationId} with payment ${paymentId}`);
      
      const freeMessageLimit = unrevealedPayment.freeMessageLimit || 100;
      const stats = conversation.getInitiatorMessageStats(freeMessageLimit);
      
      return ApiResponse.success(res, {
        success: true,
        paidCycles: stats.paidCycles,
        messagesUntilPayment: stats.messagesUntilPayment,
        freeMessageLimit
      }, 'Payment successful! You can continue messaging.');
      
    } catch (paymentError) {
      logger.error('Message payment verification error:', paymentError);
      return ApiResponse.error(res, 'Error verifying payment. Please contact support.');
    }
  } catch (error) {
    logger.error('Verify message payment error:', error);
    return ApiResponse.error(res, 'Error verifying payment');
  }
};

module.exports = {
  getAvailablePacks,
  getRequestBalance,
  createPackOrder,
  purchasePack,
  getPurchaseHistory,
  canSendRequest,
  useRequest,
  // Message payment
  getMessagePaymentSettings,
  getMessagePaymentStatus,
  createMessageOrder,
  verifyMessagePayment
};

