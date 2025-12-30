/**
 * Block Routes
 */

const express = require('express');
const router = express.Router();
const {
  blockUser,
  unblockUser,
  getBlockedUsers,
  checkBlocked,
  panicBlock
} = require('../controllers/blockController');
const { protect } = require('../middleware/auth');
const { validateBlock, validateId } = require('../middleware/validators');

router.use(protect);

router.post('/', validateBlock, blockUser);
router.delete('/:userId', unblockUser);
router.get('/', getBlockedUsers);
router.get('/check/:userId', checkBlocked);
router.post('/panic', panicBlock);

module.exports = router;

