/**
 * Delete Admin User Script
 * Usage: node src/utils/deleteAdmin.js <email> [--demote|--delete]
 * 
 * Options:
 *   --demote    Demote admin to regular user (default)
 *   --delete    Delete the user account completely
 * 
 * Examples:
 *   node src/utils/deleteAdmin.js admin@bibbly.app
 *   node src/utils/deleteAdmin.js admin@bibbly.app --demote
 *   node src/utils/deleteAdmin.js admin@bibbly.app --delete
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const logger = require('./logger');

const deleteAdmin = async () => {
  try {
    // Get arguments
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
      console.log('Usage: node src/utils/deleteAdmin.js <email> [--demote|--delete]');
      console.log('\nOptions:');
      console.log('  --demote    Demote admin to regular user (default)');
      console.log('  --delete    Delete the user account completely');
      console.log('\nExamples:');
      console.log('  node src/utils/deleteAdmin.js admin@bibbly.app');
      console.log('  node src/utils/deleteAdmin.js admin@bibbly.app --demote');
      console.log('  node src/utils/deleteAdmin.js admin@bibbly.app --delete');
      process.exit(1);
    }

    const email = args[0];
    const action = args[1] || '--demote';

    // Validate email
    if (!email || !email.includes('@')) {
      console.error('❌ Invalid email address');
      process.exit(1);
    }

    // Validate action
    if (action !== '--demote' && action !== '--delete') {
      console.error('❌ Invalid action. Use --demote or --delete');
      process.exit(1);
    }

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URI_PROD || 'mongodb://localhost:27017/bibbly_dating';
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      await mongoose.connection.close();
      process.exit(1);
    }

    // Check if user is admin
    if (user.role !== 'admin') {
      console.log(`⚠️  User ${email} is not an admin (current role: ${user.role})`);
      console.log('   No action taken.');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Count remaining admins
    const adminCount = await User.countDocuments({ role: 'admin', accountStatus: 'active' });

    if (adminCount <= 1 && action === '--delete') {
      console.error('❌ Cannot delete the last admin user!');
      console.error('   Please create another admin first or use --demote instead.');
      await mongoose.connection.close();
      process.exit(1);
    }

    // Perform action
    if (action === '--demote') {
      // Demote to regular user
      user.role = 'user';
      await user.save();
      
      console.log('✅ Admin user demoted successfully!');
      console.log(`   Email: ${user.email}`);
      console.log(`   Username: ${user.username}`);
      console.log(`   New Role: ${user.role}`);
      console.log(`   Status: ${user.accountStatus}`);
    } else if (action === '--delete') {
      // Delete user account
      user.accountStatus = 'deleted';
      user.deletedAt = new Date();
      user.role = 'user'; // Demote before deleting
      await user.save();
      
      console.log('✅ Admin user deleted successfully!');
      console.log(`   Email: ${user.email}`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Account Status: ${user.accountStatus}`);
      console.log(`   Deleted At: ${user.deletedAt}`);
    }

    // Show remaining admin count
    const remainingAdmins = await User.countDocuments({ role: 'admin', accountStatus: 'active' });
    console.log(`\n📊 Remaining active admins: ${remainingAdmins}`);

    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error processing admin user:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
};

// Run the script
deleteAdmin();

