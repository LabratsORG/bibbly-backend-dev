/**
 * Payment Webhook Routes
 * Handles payment gateway webhooks (Razorpay)
 */

const express = require('express');
const router = express.Router();
const { handleRazorpayWebhook } = require('../controllers/paymentWebhookController');

// Razorpay webhook endpoint
// Note: This route should be added before the general JSON body parser in app.js
// For now, we'll parse JSON here and reconstruct raw body in controller
router.post('/razorpay', express.json({ verify: (req, res, buf) => {
  req.rawBody = buf.toString('utf8');
}}), handleRazorpayWebhook);

module.exports = router;

