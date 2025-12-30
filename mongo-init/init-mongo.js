// ============================================
// MongoDB Initialization Script
// bibbly Dating App
// ============================================

// Create the application database
db = db.getSiblingDB('bibbly_dating');

// Create application user with read/write permissions
db.createUser({
  user: 'bibbly_app',
  pwd: 'bibbly_app_password',
  roles: [
    {
      role: 'readWrite',
      db: 'bibbly_dating'
    }
  ]
});

// Create indexes for better performance
// Users collection
db.createCollection('users');
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ googleId: 1 }, { sparse: true });
db.users.createIndex({ accountStatus: 1 });
db.users.createIndex({ createdAt: -1 });

// Profiles collection
db.createCollection('profiles');
db.profiles.createIndex({ user: 1 }, { unique: true });
db.profiles.createIndex({ 'location.city': 1 });
db.profiles.createIndex({ 'college.name': 1 });
db.profiles.createIndex({ 'workplace.company': 1 });
db.profiles.createIndex({ interests: 1 });
db.profiles.createIndex({ visibility: 1, showInFeed: 1, isComplete: 1, isBanned: 1 });
db.profiles.createIndex({ age: 1, gender: 1 });

// Conversations collection
db.createCollection('conversations');
db.conversations.createIndex({ participants: 1 });
db.conversations.createIndex({ lastMessage: -1 });
db.conversations.createIndex({ updatedAt: -1 });

// Messages collection
db.createCollection('messages');
db.messages.createIndex({ conversation: 1, createdAt: -1 });
db.messages.createIndex({ sender: 1, createdAt: -1 });

// Message Requests collection
db.createCollection('messagerequests');
db.messagerequests.createIndex({ sender: 1, recipient: 1 });
db.messagerequests.createIndex({ recipient: 1, status: 1 });
db.messagerequests.createIndex({ createdAt: -1 });

// Notifications collection
db.createCollection('notifications');
db.notifications.createIndex({ recipient: 1, createdAt: -1 });
db.notifications.createIndex({ recipient: 1, isRead: 1 });

// Blocks collection
db.createCollection('blocks');
db.blocks.createIndex({ blocker: 1, blocked: 1 }, { unique: true });

// Reports collection
db.createCollection('reports');
db.reports.createIndex({ reporter: 1, createdAt: -1 });
db.reports.createIndex({ status: 1, createdAt: -1 });

// Profile Views collection
db.createCollection('profileviews');
db.profileviews.createIndex({ profile: 1, viewer: 1, createdAt: -1 });
db.profileviews.createIndex({ viewer: 1, createdAt: -1 });

// Skips collection
db.createCollection('skips');
db.skips.createIndex({ user: 1, skippedUser: 1 }, { unique: true });
db.skips.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 }); // 24h TTL

// Activity Logs collection
db.createCollection('activitylogs');
db.activitylogs.createIndex({ user: 1, createdAt: -1 });
db.activitylogs.createIndex({ action: 1, createdAt: -1 });

// App Config collection
db.createCollection('appconfigs');

print('✅ bibbly MongoDB initialized successfully!');
print('📊 Created indexes for all collections');

