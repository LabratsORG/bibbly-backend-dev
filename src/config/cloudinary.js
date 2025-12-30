/**
 * Cloudinary Configuration for Image Upload
 */

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage configuration for profile photos
const profilePhotoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'bibbly/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [
      { width: 800, height: 800, crop: 'limit', quality: 'auto:good' }
    ],
    format: 'jpg'
  }
});

// Storage configuration for chat media
const chatMediaStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'bibbly/chat',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit', quality: 'auto:good' }
    ]
  }
});

// Multer upload instances
const uploadProfilePhoto = multer({
  storage: profilePhotoStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const uploadChatMedia = multer({
  storage: chatMediaStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    throw error;
  }
};

// Get public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  const folder = parts[parts.length - 2];
  const publicId = `${folder}/${filename.split('.')[0]}`;
  return publicId;
};

// Generate blur transformation URL
const getBlurredImageUrl = (url, blurAmount = 1000) => {
  if (!url) return null;
  return url.replace('/upload/', `/upload/e_blur:${blurAmount}/`);
};

// Generate thumbnail URL
const getThumbnailUrl = (url, width = 150, height = 150) => {
  if (!url) return null;
  return url.replace('/upload/', `/upload/w_${width},h_${height},c_fill/`);
};

module.exports = {
  cloudinary,
  uploadProfilePhoto,
  uploadChatMedia,
  deleteImage,
  getPublicIdFromUrl,
  getBlurredImageUrl,
  getThumbnailUrl
};

