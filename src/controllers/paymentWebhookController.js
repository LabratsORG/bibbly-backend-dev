/**
 * Payment Webhook Controller
 * Handles Razorpay webhook events
 */

const { verifyWebhookSignature, getPaymentDetails } = require('../config/razorpay');
const PurchasedPack = require('../models/PurchasedPack');
const AppConfig = require('../models/AppConfig');
const Notification = require('../models/Notification');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * @desc    Handle Razorpay webhook events
 * @route   POST /api/v1/payments/webhook
 * @access  Public (verified by signature)
 */
const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET;
    
    if (!webhookSignature) {
      logger.warn('Razorpay webhook received without signature');
      return res.status(400).json({ error: 'Missing signature' });
    }
    
    // Get raw body for signature verification
    // Use rawBody from middleware if available, otherwise reconstruct from body
    const rawBody = req.rawBody || JSON.stringify(req.body);
    
    // Verify webhook signature
    const isValid = verifyWebhookSignature(rawBody, webhookSignature);
    
    if (!isValid) {
      logger.warn('Invalid Razorpay webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }
    
    const event = req.body.event;
    const payload = req.body.payload;
    
    logger.info(`Razorpay webhook received: ${event}`);
    
    // Handle different webhook events
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload.payment.entity);
        break;
        
      case 'payment.failed':
        await handlePaymentFailed(payload.payment.entity);
        break;
        
      case 'order.paid':
        await handleOrderPaid(payload.order.entity);
        break;
        
      case 'refund.created':
        await handleRefundCreated(payload.refund.entity);
        break;
        
      default:
        logger.info(`Unhandled webhook event: ${event}`);
    }
    
    // Always return 200 to acknowledge webhook receipt
    return res.status(200).json({ received: true });
    
  } catch (error) {
    logger.error('Razorpay webhook error:', error);
    // Still return 200 to prevent Razorpay from retrying
    return res.status(200).json({ received: true, error: 'Processing failed' });
  }
};

/**
 * Handle payment captured event
 */
const handlePaymentCaptured = async (payment) => {
  try {
    const paymentId = payment.id;
    const orderId = payment.order_id;
    const amount = payment.amount;
    
    logger.info(`Payment captured: ${paymentId} for order ${orderId}`);
    
    // Find purchase by payment ID
    const purchase = await PurchasedPack.findOne({
      paymentId: paymentId,
      status: { $ne: 'active' }
    });
    
    if (!purchase) {
      // Check if purchase exists but is already active
      const existingPurchase = await PurchasedPack.findOne({
        paymentId: paymentId,
        status: 'active'
      });
      
      if (existingPurchase) {
        logger.info(`Purchase ${existingPurchase._id} already active for payment ${paymentId}`);
        return;
      }
      
      // Try to find by order ID
      const purchaseByOrder = await PurchasedPack.findOne({
        orderId: orderId
      });
      
      if (purchaseByOrder) {
        // Update purchase status
        purchaseByOrder.status = 'active';
        purchaseByOrder.paymentId = paymentId;
        await purchaseByOrder.save();
        
        // Send notification
        await Notification.createNotification(
          purchaseByOrder.user,
          'system',
          'Payment Successful! 🎉',
          'Your pack purchase has been confirmed.',
          { targetType: 'settings' }
        );
        
        logger.info(`Purchase ${purchaseByOrder._id} activated via webhook`);
        return;
      }
      
      logger.warn(`No purchase found for payment ${paymentId}`);
      return;
    }
    
    // Get pack details from notes or config
    const config = await AppConfig.getConfig();
    const pack = config.microPayments.requestPacks.find(
      p => p.packId === purchase.packId
    );
    
    if (!pack || pack.priceInPaisa !== amount) {
      logger.warn(`Amount mismatch for purchase ${purchase._id}. Expected: ${pack?.priceInPaisa}, Got: ${amount}`);
      purchase.status = 'failed';
      purchase.failureReason = 'Amount mismatch';
      await purchase.save();
      return;
    }
    
    // Activate purchase
    purchase.status = 'active';
    purchase.requestsRemaining = purchase.requestCount;
    await purchase.save();
    
    // Send notification
    await Notification.createNotification(
      purchase.user,
      'system',
      'Pack Purchased! 🎉',
      `You now have ${purchase.requestCount} extra message requests!`,
      { targetType: 'settings' }
    );
    
    logger.info(`Purchase ${purchase._id} activated via webhook`);
    
  } catch (error) {
    logger.error('Handle payment captured error:', error);
  }
};

/**
 * Handle payment failed event
 */
const handlePaymentFailed = async (payment) => {
  try {
    const paymentId = payment.id;
    const orderId = payment.order_id;
    
    logger.info(`Payment failed: ${paymentId} for order ${orderId}`);
    
    // Find purchase and mark as failed
    const purchase = await PurchasedPack.findOne({
      $or: [
        { paymentId: paymentId },
        { orderId: orderId }
      ]
    });
    
    if (purchase && purchase.status !== 'active') {
      purchase.status = 'failed';
      purchase.failureReason = payment.error_description || 'Payment failed';
      await purchase.save();
      
      // Send notification
      await Notification.createNotification(
        purchase.user,
        'system',
        'Payment Failed',
        'Your payment could not be processed. Please try again.',
        { targetType: 'settings' }
      );
      
      logger.info(`Purchase ${purchase._id} marked as failed via webhook`);
    }
    
  } catch (error) {
    logger.error('Handle payment failed error:', error);
  }
};

/**
 * Handle order paid event
 */
const handleOrderPaid = async (order) => {
  try {
    const orderId = order.id;
    
    logger.info(`Order paid: ${orderId}`);
    
    // This is usually handled by payment.captured, but we log it
    const purchase = await PurchasedPack.findOne({ orderId: orderId });
    
    if (purchase && purchase.status !== 'active') {
      // Try to get payment details
      const paymentId = order.notes?.paymentId;
      
      if (paymentId) {
        await handlePaymentCaptured({ id: paymentId, order_id: orderId, amount: order.amount });
      }
    }
    
  } catch (error) {
    logger.error('Handle order paid error:', error);
  }
};

/**
 * Handle refund created event
 */
const handleRefundCreated = async (refund) => {
  try {
    const paymentId = refund.payment_id;
    const refundId = refund.id;
    const amount = refund.amount;
    
    logger.info(`Refund created: ${refundId} for payment ${paymentId}, amount: ${amount}`);
    
    // Find purchase and mark as refunded
    const purchase = await PurchasedPack.findOne({
      paymentId: paymentId,
      status: 'active'
    });
    
    if (purchase) {
      // Deduct refunded amount from remaining requests proportionally
      const refundPercentage = amount / purchase.pricePaid;
      const requestsToDeduct = Math.floor(purchase.requestsRemaining * refundPercentage);
      
      purchase.requestsRemaining = Math.max(0, purchase.requestsRemaining - requestsToDeduct);
      
      if (purchase.requestsRemaining === 0) {
        purchase.status = 'refunded';
      }
      
      purchase.refundId = refundId;
      purchase.refundAmount = amount;
      await purchase.save();
      
      // Send notification
      await Notification.createNotification(
        purchase.user,
        'system',
        'Refund Processed',
        `A refund of ₹${(amount / 100).toFixed(2)} has been processed for your purchase.`,
        { targetType: 'settings' }
      );
      
      logger.info(`Purchase ${purchase._id} refunded via webhook`);
    }
    
  } catch (error) {
    logger.error('Handle refund created error:', error);
  }
};

module.exports = {
  handleRazorpayWebhook
};

