/**
 * Purchase Routes
 * For users to purchase request packs and message payments
 */

const express = require('express');
const router = express.Router();
const {
  getAvailablePacks,
  getRequestBalance,
  createPackOrder,
  purchasePack,
  getPurchaseHistory,
  canSendRequest,
  // Message payment
  getMessagePaymentSettings,
  getMessagePaymentStatus,
  createMessageOrder,
  verifyMessagePayment
} = require('../controllers/purchaseController');
const { protect, requireCompleteProfile } = require('../middleware/auth');

router.use(protect);
router.use(requireCompleteProfile);

// Get available packs to purchase
router.get('/packs', getAvailablePacks);

// Get current request balance
router.get('/balance', getRequestBalance);

// Check if can send request
router.get('/can-send-request', canSendRequest);

// Create Razorpay order for pack
router.post('/packs/:packId/order', createPackOrder);

// Verify and complete pack purchase
router.post('/packs/:packId/verify', purchasePack);

// Get purchase history
router.get('/history', getPurchaseHistory);

// ========== UNREVEALED CHAT MESSAGE PAYMENT ==========

// Get message payment settings
router.get('/message-payment-settings', getMessagePaymentSettings);

// Get message payment status for a conversation
router.get('/conversations/:conversationId/message-status', getMessagePaymentStatus);

// Create Razorpay order for message payment
router.post('/conversations/:conversationId/message-order', createMessageOrder);

// Verify and complete message payment
router.post('/conversations/:conversationId/message-verify', verifyMessagePayment);

module.exports = router;

