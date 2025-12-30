/**
 * Cron Jobs
 * Scheduled tasks for maintenance and cleanup
 */

const cron = require('node-cron');
const MessageRequest = require('../models/MessageRequest');
const User = require('../models/User');
const Notification = require('../models/Notification');
const PurchasedPack = require('../models/PurchasedPack');
const logger = require('../utils/logger');

/**
 * Initialize all cron jobs
 */
const initializeCronJobs = () => {
  // Expire old message requests - every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await MessageRequest.expireOldRequests();
      if (result.modifiedCount > 0) {
        logger.info(`Expired ${result.modifiedCount} message requests`);
      }
    } catch (error) {
      logger.error('Expire requests job error:', error);
    }
  });

  // Expire old purchased packs - every hour
  cron.schedule('30 * * * *', async () => {
    try {
      const result = await PurchasedPack.expireOldPacks();
      if (result.modifiedCount > 0) {
        logger.info(`Expired ${result.modifiedCount} purchased packs`);
      }
    } catch (error) {
      logger.error('Expire purchased packs job error:', error);
    }
  });

  // Check premium expirations - daily at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      // Find users whose premium expires today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Notify users expiring in 3 days
      const expiringIn3Days = new Date(today);
      expiringIn3Days.setDate(expiringIn3Days.getDate() + 3);

      const usersExpiringIn3Days = await User.find({
        isPremium: true,
        premiumPlan: { $ne: 'lifetime' },
        premiumExpiresAt: {
          $gte: expiringIn3Days,
          $lt: new Date(expiringIn3Days.getTime() + 24 * 60 * 60 * 1000)
        }
      });

      for (const user of usersExpiringIn3Days) {
        await Notification.createNotification(
          user._id,
          'premium_expiring',
          'Premium Expiring Soon ⏰',
          'Your premium subscription expires in 3 days. Renew now to keep your benefits!',
          { targetType: 'premium' }
        );
      }

      // Expire premium for users past expiry
      const expiredUsers = await User.updateMany(
        {
          isPremium: true,
          premiumPlan: { $ne: 'lifetime' },
          premiumExpiresAt: { $lt: today }
        },
        {
          $set: {
            isPremium: false,
            role: 'user'
          }
        }
      );

      if (expiredUsers.modifiedCount > 0) {
        logger.info(`Expired premium for ${expiredUsers.modifiedCount} users`);

        // Notify expired users
        const justExpired = await User.find({
          isPremium: false,
          premiumPlan: { $ne: null },
          premiumExpiresAt: {
            $gte: new Date(today.getTime() - 24 * 60 * 60 * 1000),
            $lt: today
          }
        });

        for (const user of justExpired) {
          await Notification.createNotification(
            user._id,
            'premium_expired',
            'Premium Expired 😢',
            'Your premium subscription has expired. Renew to continue enjoying premium features.',
            { targetType: 'premium' }
          );
        }
      }

    } catch (error) {
      logger.error('Premium expiration job error:', error);
    }
  });

  // Clean up old notifications - weekly on Sunday at 3am
  cron.schedule('0 3 * * 0', async () => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const result = await Notification.deleteMany({
        createdAt: { $lt: thirtyDaysAgo },
        isRead: true
      });

      if (result.deletedCount > 0) {
        logger.info(`Cleaned up ${result.deletedCount} old notifications`);
      }
    } catch (error) {
      logger.error('Notification cleanup job error:', error);
    }
  });

  // Update user activity status - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      // This can be used for analytics or to update "last seen" displays
      // Currently just logging active users count
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const activeUsers = await User.countDocuments({
        lastActiveAt: { $gte: fiveMinutesAgo }
      });

      if (process.env.NODE_ENV !== 'production') {
        logger.debug(`Active users in last 5 minutes: ${activeUsers}`);
      }
    } catch (error) {
      logger.error('Activity status job error:', error);
    }
  });

  // Daily stats logging - every day at 6am
  cron.schedule('0 6 * * *', async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [newUsers, newRequests, acceptedRequests] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: yesterday, $lt: today } }),
        MessageRequest.countDocuments({ createdAt: { $gte: yesterday, $lt: today } }),
        MessageRequest.countDocuments({ 
          status: 'accepted',
          acceptedAt: { $gte: yesterday, $lt: today }
        })
      ]);

      logger.info(`Daily Stats - New Users: ${newUsers}, Requests: ${newRequests}, Accepted: ${acceptedRequests}`);

    } catch (error) {
      logger.error('Daily stats job error:', error);
    }
  });

  logger.info('✅ All cron jobs scheduled');
};

module.exports = { initializeCronJobs };

