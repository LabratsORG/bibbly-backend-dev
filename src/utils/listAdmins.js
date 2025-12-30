/**
 * List Admin Users Script
 * Usage: node src/utils/listAdmins.js
 * 
 * Lists all admin users in the system
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const logger = require('./logger');

const listAdmins = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URI_PROD || 'mongodb://localhost:27017/bibbly_dating';
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find all admin users
    const admins = await User.find({ role: 'admin' })
      .select('email username role accountStatus createdAt lastLoginAt')
      .sort({ createdAt: -1 });

    if (admins.length === 0) {
      console.log('📭 No admin users found in the system.');
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log(`📋 Found ${admins.length} admin user(s):\n`);
    console.log('─'.repeat(80));

    admins.forEach((admin, index) => {
      console.log(`\n${index + 1}. Admin User`);
      console.log(`   Email:        ${admin.email}`);
      console.log(`   Username:     ${admin.username}`);
      console.log(`   Role:         ${admin.role}`);
      console.log(`   Status:       ${admin.accountStatus}`);
      console.log(`   Created:      ${admin.createdAt.toLocaleString()}`);
      if (admin.lastLoginAt) {
        console.log(`   Last Login:   ${admin.lastLoginAt.toLocaleString()}`);
      } else {
        console.log(`   Last Login:   Never`);
      }
      console.log(`   User ID:      ${admin._id}`);
    });

    console.log('\n' + '─'.repeat(80));

    // Count by status
    const activeCount = admins.filter(a => a.accountStatus === 'active').length;
    const suspendedCount = admins.filter(a => a.accountStatus === 'suspended').length;
    const deletedCount = admins.filter(a => a.accountStatus === 'deleted').length;

    console.log(`\n📊 Summary:`);
    console.log(`   Active:    ${activeCount}`);
    console.log(`   Suspended: ${suspendedCount}`);
    console.log(`   Deleted:   ${deletedCount}`);

    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error listing admin users:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
};

// Run the script
listAdmins();

