/**
 * Vercel Serverless Function Handler
 * This file exports the Express app for Vercel deployment
 * 
 * NOTE: WebSocket/Socket.IO is not supported in Vercel serverless functions.
 * Real-time features will not work. Consider using polling or a different hosting solution
 * for WebSocket support (e.g., Railway, Render, or a dedicated server).
 */

require('dotenv').config();

// Set serverless mode flag
process.env.SERVERLESS_MODE = 'true';

const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const app = require('../src/app');
const logger = require('../src/utils/logger');

// Cache the connection promise to avoid multiple connection attempts
let cachedConnection = null;

async function connectToDatabase() {
  if (cachedConnection) {
    return cachedConnection;
  }

  // Check if already connected
  if (mongoose.connection.readyState === 1) {
    cachedConnection = Promise.resolve(mongoose.connection);
    return cachedConnection;
  }

  // Create new connection promise
  cachedConnection = connectDB()
    .then((conn) => {
      logger.info('Database connected successfully');
      return conn;
    })
    .catch((err) => {
      logger.error('Database connection error:', err);
      cachedConnection = null; // Reset cache on error
      throw err;
    });

  return cachedConnection;
}

// Connect to database before handling requests
module.exports = async (req, res) => {
  try {
    // Ensure database is connected before handling the request
    await connectToDatabase();
    // Call the Express app
    app(req, res);
  } catch (error) {
    logger.error('Error in serverless function:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};

