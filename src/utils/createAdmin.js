/**
 * Create Admin User Script
 * Usage: node src/utils/createAdmin.js <email> <password> [name]
 * 
 * Example:
 * node src/utils/createAdmin.js admin@bibbly.app Admin@12345 "Admin User"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const logger = require('./logger');

const createAdmin = async () => {
  try {
    // Get arguments
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.log('Usage: node src/utils/createAdmin.js <email> <password> [name]');
      console.log('Example: node src/utils/createAdmin.js admin@bibbly.app Admin@12345 "Admin User"');
      process.exit(1);
    }

    const email = args[0];
    const password = args[1];
    const name = args[2] || 'Admin User';

    // Validate email
    if (!email || !email.includes('@')) {
      console.error('❌ Invalid email address');
      process.exit(1);
    }

    // Validate password
    if (!password || password.length < 8) {
      console.error('❌ Password must be at least 8 characters long');
      process.exit(1);
    }

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URI_PROD || 'mongodb://localhost:27017/bibbly_dating';
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check if user already exists
    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // Update existing user to admin
      console.log(`📝 User ${email} already exists. Updating to admin...`);
      
      // Set password as plain text - pre-save hook will hash it
      if (password) {
        user.password = password; // Set as plain text, model will hash it
        user.markModified('password'); // Ensure it's treated as modified
      }
      
      user.role = 'admin';
      user.accountStatus = 'active';
      user.isEmailVerified = true;
      await user.save();
      
      console.log('✅ User updated to admin successfully!');
      console.log(`   Email: ${user.email}`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Status: ${user.accountStatus}`);
    } else {
      // Create new admin user
      console.log(`👤 Creating new admin user...`);
      
      // Generate username from email
      const usernameBase = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const randomSuffix = Math.random().toString(36).substr(2, 6);
      const username = `${usernameBase}${randomSuffix}`;

      // Create user - set password as plain text, pre-save hook will hash it
      user = await User.create({
        email: email.toLowerCase(),
        password: password, // Set as plain text, model will hash it
        username: username,
        role: 'admin',
        accountStatus: 'active',
        isEmailVerified: true,
      });

      console.log('✅ Admin user created successfully!');
      console.log(`   Email: ${user.email}`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   User ID: ${user._id}`);
    }

    console.log('\n🎉 Admin user is ready!');
    console.log('   You can now login to the admin panel with:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${password}`);

    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    if (error.code === 11000) {
      console.error('   User with this email or username already exists');
    }
    process.exit(1);
  }
};

// Run the script
createAdmin();

