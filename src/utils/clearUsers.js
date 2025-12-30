/**
 * Script to clear all non-admin users and their related data from MongoDB
 * 
 * Usage: node src/utils/clearUsers.js [--dry-run] [--confirm]
 * 
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting
 *   --confirm    Skip confirmation prompt (use with caution!)
 * 
 * Example:
 *   node src/utils/clearUsers.js --dry-run
 *   node src/utils/clearUsers.js --confirm
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const User = require('../models/User');
const Profile = require('../models/Profile');
const ProfileView = require('../models/ProfileView');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const MessageRequest = require('../models/MessageRequest');
const Block = require('../models/Block');
const Notification = require('../models/Notification');
const Skip = require('../models/Skip');
const Report = require('../models/Report');
const PurchasedPack = require('../models/PurchasedPack');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const skipConfirm = args.includes('--confirm');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function connectDB() {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGODB_URI_PROD;
    if (!mongoURI) {
      log('❌ MONGODB_URI not found in environment variables', 'red');
      process.exit(1);
    }

    await mongoose.connect(mongoURI);
    log('✅ Connected to MongoDB', 'green');
  } catch (error) {
    log(`❌ MongoDB connection error: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function getNonAdminUsers() {
  const users = await User.find({ role: { $ne: 'admin' } }).select('_id email username role');
  return users;
}

async function countRelatedData(userIds) {
  const counts = {
    profiles: await Profile.countDocuments({ user: { $in: userIds } }),
    profileViews: await ProfileView.countDocuments({ 
      $or: [
        { viewer: { $in: userIds } },
        { profileOwner: { $in: userIds } }
      ]
    }),
    conversations: await Conversation.countDocuments({
      $or: [
        { participant1: { $in: userIds } },
        { participant2: { $in: userIds } }
      ]
    }),
    messages: await Message.countDocuments({ sender: { $in: userIds } }),
    messageRequests: await MessageRequest.countDocuments({
      $or: [
        { sender: { $in: userIds } },
        { recipient: { $in: userIds } }
      ]
    }),
    blocks: await Block.countDocuments({
      $or: [
        { blocker: { $in: userIds } },
        { blocked: { $in: userIds } }
      ]
    }),
    notifications: await Notification.countDocuments({ user: { $in: userIds } }),
    skips: await Skip.countDocuments({
      $or: [
        { user: { $in: userIds } },
        { skippedUser: { $in: userIds } }
      ]
    }),
    reports: await Report.countDocuments({
      $or: [
        { reporter: { $in: userIds } },
        { reportedUser: { $in: userIds } }
      ]
    }),
    purchasedPacks: await PurchasedPack.countDocuments({ user: { $in: userIds } }),
  };
  return counts;
}

async function deleteRelatedData(userIds) {
  log('\n🗑️  Deleting related data...', 'yellow');
  
  const results = {
    profiles: 0,
    profileViews: 0,
    conversations: 0,
    messages: 0,
    messageRequests: 0,
    blocks: 0,
    notifications: 0,
    skips: 0,
    reports: 0,
    purchasedPacks: 0,
  };

  if (!isDryRun) {
    // Delete profiles
    const profileResult = await Profile.deleteMany({ user: { $in: userIds } });
    results.profiles = profileResult.deletedCount;
    
    // Delete profile views
    const profileViewResult = await ProfileView.deleteMany({
      $or: [
        { viewer: { $in: userIds } },
        { profileOwner: { $in: userIds } }
      ]
    });
    results.profileViews = profileViewResult.deletedCount;
    
    // Delete conversations
    const conversationResult = await Conversation.deleteMany({
      $or: [
        { participant1: { $in: userIds } },
        { participant2: { $in: userIds } }
      ]
    });
    results.conversations = conversationResult.deletedCount;
    
    // Delete messages
    const messageResult = await Message.deleteMany({ sender: { $in: userIds } });
    results.messages = messageResult.deletedCount;
    
    // Delete message requests
    const messageRequestResult = await MessageRequest.deleteMany({
      $or: [
        { sender: { $in: userIds } },
        { recipient: { $in: userIds } }
      ]
    });
    results.messageRequests = messageRequestResult.deletedCount;
    
    // Delete blocks
    const blockResult = await Block.deleteMany({
      $or: [
        { blocker: { $in: userIds } },
        { blocked: { $in: userIds } }
      ]
    });
    results.blocks = blockResult.deletedCount;
    
    // Delete notifications
    const notificationResult = await Notification.deleteMany({ user: { $in: userIds } });
    results.notifications = notificationResult.deletedCount;
    
    // Delete skips
    const skipResult = await Skip.deleteMany({
      $or: [
        { user: { $in: userIds } },
        { skippedUser: { $in: userIds } }
      ]
    });
    results.skips = skipResult.deletedCount;
    
    // Delete reports
    const reportResult = await Report.deleteMany({
      $or: [
        { reporter: { $in: userIds } },
        { reportedUser: { $in: userIds } }
      ]
    });
    results.reports = reportResult.deletedCount;
    
    // Delete purchased packs
    const purchasedPackResult = await PurchasedPack.deleteMany({ user: { $in: userIds } });
    results.purchasedPacks = purchasedPackResult.deletedCount;
  } else {
    // Dry run - just count
    const counts = await countRelatedData(userIds);
    results.profiles = counts.profiles;
    results.profileViews = counts.profileViews;
    results.conversations = counts.conversations;
    results.messages = counts.messages;
    results.messageRequests = counts.messageRequests;
    results.blocks = counts.blocks;
    results.notifications = counts.notifications;
    results.skips = counts.skips;
    results.reports = counts.reports;
    results.purchasedPacks = counts.purchasedPacks;
  }

  return results;
}

async function deleteUsers(userIds) {
  log('\n🗑️  Deleting users...', 'yellow');
  
  if (!isDryRun) {
    const result = await User.deleteMany({ _id: { $in: userIds } });
    return result.deletedCount;
  } else {
    return userIds.length;
  }
}

async function main() {
  try {
    log('\n🚀 Starting user data cleanup script...', 'cyan');
    
    if (isDryRun) {
      log('⚠️  DRY RUN MODE - No data will be deleted', 'yellow');
    }

    // Connect to database
    await connectDB();

    // Get non-admin users
    log('\n📊 Finding non-admin users...', 'blue');
    const users = await getNonAdminUsers();
    const userIds = users.map(u => u._id);

    if (users.length === 0) {
      log('✅ No non-admin users found. Nothing to delete.', 'green');
      await mongoose.connection.close();
      process.exit(0);
    }

    log(`\n📋 Found ${users.length} non-admin user(s):`, 'blue');
    users.forEach((user, index) => {
      log(`   ${index + 1}. ${user.email} (${user.username}) - Role: ${user.role}`, 'cyan');
    });

    // Count related data
    log('\n📊 Counting related data...', 'blue');
    const counts = await countRelatedData(userIds);
    
    log('\n📈 Data to be deleted:', 'yellow');
    log(`   - Users: ${users.length}`, 'cyan');
    log(`   - Profiles: ${counts.profiles}`, 'cyan');
    log(`   - Profile Views: ${counts.profileViews}`, 'cyan');
    log(`   - Conversations: ${counts.conversations}`, 'cyan');
    log(`   - Messages: ${counts.messages}`, 'cyan');
    log(`   - Message Requests: ${counts.messageRequests}`, 'cyan');
    log(`   - Blocks: ${counts.blocks}`, 'cyan');
    log(`   - Notifications: ${counts.notifications}`, 'cyan');
    log(`   - Skips: ${counts.skips}`, 'cyan');
    log(`   - Reports: ${counts.reports}`, 'cyan');
    log(`   - Purchased Packs: ${counts.purchasedPacks}`, 'cyan');

    // Confirmation
    if (!skipConfirm && !isDryRun) {
      log('\n⚠️  WARNING: This will permanently delete all non-admin users and their data!', 'red');
      log('   This action cannot be undone!', 'red');
      log('\n   To proceed, run with --confirm flag:', 'yellow');
      log('   node src/utils/clearUsers.js --confirm', 'yellow');
      log('\n   Or use --dry-run to see what would be deleted:', 'yellow');
      log('   node src/utils/clearUsers.js --dry-run', 'yellow');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Delete related data
    const deletedData = await deleteRelatedData(userIds);
    
    log('\n✅ Deleted related data:', 'green');
    log(`   - Profiles: ${deletedData.profiles}`, 'green');
    log(`   - Profile Views: ${deletedData.profileViews}`, 'green');
    log(`   - Conversations: ${deletedData.conversations}`, 'green');
    log(`   - Messages: ${deletedData.messages}`, 'green');
    log(`   - Message Requests: ${deletedData.messageRequests}`, 'green');
    log(`   - Blocks: ${deletedData.blocks}`, 'green');
    log(`   - Notifications: ${deletedData.notifications}`, 'green');
    log(`   - Skips: ${deletedData.skips}`, 'green');
    log(`   - Reports: ${deletedData.reports}`, 'green');
    log(`   - Purchased Packs: ${deletedData.purchasedPacks}`, 'green');

    // Delete users
    const deletedUsers = await deleteUsers(userIds);
    log(`\n✅ Deleted ${deletedUsers} user(s)`, 'green');

    // Summary
    log('\n📊 Summary:', 'cyan');
    log(`   Total users deleted: ${deletedUsers}`, 'cyan');
    log(`   Total related records deleted: ${
      deletedData.profiles +
      deletedData.profileViews +
      deletedData.conversations +
      deletedData.messages +
      deletedData.messageRequests +
      deletedData.blocks +
      deletedData.notifications +
      deletedData.skips +
      deletedData.reports +
      deletedData.purchasedPacks
    }`, 'cyan');

    log('\n✅ Cleanup completed successfully!', 'green');
    
    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
main();

