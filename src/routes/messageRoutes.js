/**
 * Message Routes
 */

const express = require('express');
const router = express.Router();
const {
  getConversations,
  getConversation,
  getMessages,
  sendMessage,
  addReaction,
  removeReaction,
  deleteMessage,
  muteConversation,
  unmuteConversation,
  archiveConversation,
  unarchiveConversation,
  requestReveal,
  revealIdentity,
  getUnreadCount,
  reportScreenshot
} = require('../controllers/messageController');
const { protect, requireCompleteProfile } = require('../middleware/auth');
const { validateMessage, validateId } = require('../middleware/validators');

router.use(protect);
router.use(requireCompleteProfile);

// Conversations
router.get('/conversations', getConversations);
router.get('/conversations/:conversationId', getConversation);
router.get('/conversations/:conversationId/messages', getMessages);
router.post('/conversations/:conversationId/messages', validateMessage, sendMessage);

// Conversation actions
router.post('/conversations/:conversationId/mute', muteConversation);
router.post('/conversations/:conversationId/unmute', unmuteConversation);
router.post('/conversations/:conversationId/archive', archiveConversation);
router.post('/conversations/:conversationId/unarchive', unarchiveConversation);
router.post('/conversations/:conversationId/request-reveal', requestReveal);
router.post('/conversations/:conversationId/reveal', revealIdentity);

// Message actions
router.post('/:messageId/reactions', addReaction);
router.delete('/:messageId/reactions', removeReaction);
router.delete('/:messageId', deleteMessage);
router.post('/:messageId/screenshot', reportScreenshot);

// Utilities
router.get('/unread-count', getUnreadCount);

module.exports = router;

