/**
 * Profile Routes
 */

const express = require('express');
const router = express.Router();
const {
  setupProfile,
  getMyProfile,
  updateProfile,
  uploadPhoto,
  deletePhoto,
  reorderPhotos,
  setMainPhoto,
  getProfileByUsername,
  getProfileByUserId,
  getShareInfo
} = require('../controllers/profileController');
const { protect, optionalAuth } = require('../middleware/auth');
const { uploadProfilePhoto } = require('../config/cloudinary');
const { validateProfileSetup, validateProfileUpdate, validateUsername } = require('../middleware/validators');

// Public routes (with optional auth)
router.get('/user/:username', optionalAuth, validateUsername, getProfileByUsername);

// Protected routes
router.use(protect);

router.post('/setup', validateProfileSetup, setupProfile);
router.get('/', getMyProfile);
router.put('/', validateProfileUpdate, updateProfile);
router.get('/share', getShareInfo);
router.get('/user-id/:userId', getProfileByUserId);

// Photo management - with error handling for multer
router.post('/photos', (req, res, next) => {
  const logger = require('../utils/logger');
  logger.info(`Multer middleware - Content-Type: ${req.headers['content-type']}`);
  logger.info(`Multer middleware - Content-Length: ${req.headers['content-length']}`);
  
  uploadProfilePhoto.single('photo')(req, res, (err) => {
    if (err) {
      logger.error(`Multer error: ${err.name}, code: ${err.code}, message: ${err.message}`);
      logger.error(`Multer error stack: ${err.stack}`);
      
      // Handle multer errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 5MB'
        });
      }
      if (err.message === 'Only image files are allowed') {
        return res.status(400).json({
          success: false,
          message: 'Only image files are allowed (jpg, jpeg, png, webp)'
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'Error uploading file'
      });
    }
    
    logger.info(`Multer success - file: ${req.file ? 'present' : 'missing'}`);
    if (req.file) {
      logger.info(`Multer file - fieldname: ${req.file.fieldname}, originalname: ${req.file.originalname}`);
    }
    
    next();
  });
}, uploadPhoto);
router.delete('/photos/:photoId', deletePhoto);
router.put('/photos/reorder', reorderPhotos);
router.put('/photos/:photoId/main', setMainPhoto);


module.exports = router;

