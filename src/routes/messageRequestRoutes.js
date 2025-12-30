/**
 * Message Request Routes
 */

const express = require('express');
const router = express.Router();
const {
  sendRequest,
  getPendingRequests,
  getSentRequests,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  markAsRead,
  getRequestStats
} = require('../controllers/messageRequestController');
const { protect, requireCompleteProfile } = require('../middleware/auth');
const { validateMessageRequest, validateId } = require('../middleware/validators');

router.use(protect);
router.use(requireCompleteProfile);

// Request management
router.post('/', validateMessageRequest, sendRequest);
router.get('/pending', getPendingRequests);
router.get('/sent', getSentRequests);
router.get('/stats', getRequestStats);

// Request actions
router.post('/:id/accept', validateId, acceptRequest);
router.post('/:id/reject', validateId, rejectRequest);
router.delete('/:id', validateId, cancelRequest);
router.post('/:id/read', validateId, markAsRead);

module.exports = router;

