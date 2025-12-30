/**
 * bibbly Dating App - Main Server Entry Point
 * "Talk to people you already know of, but never had the courage to text."
 */

require('dotenv').config();

const http = require('http');
const app = require('./app');
const { initializeSocket } = require('./socket');
const connectDB = require('./config/database');
const logger = require('./utils/logger');
const { initializeCronJobs } = require('./jobs/cronJobs');

const PORT = process.env.PORT || 5001;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
initializeSocket(server);

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    logger.info('📦 MongoDB connected successfully');

    // Initialize cron jobs
    initializeCronJobs();
    logger.info('⏰ Cron jobs initialized');

    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 bibbly Server running on port ${PORT}`);
      logger.info(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 API URL: http://localhost:${PORT}/api/${process.env.API_VERSION || 'v1'}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! Shutting down...');
  logger.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...');
  logger.error(err.name, err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM received. Shutting down gracefully');
  server.close(() => {
    logger.info('💤 Process terminated!');
  });
});

startServer();

