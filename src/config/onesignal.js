/**
 * OneSignal Push Notification Configuration
 */

const OneSignal = require('onesignal-node');

// Validate environment variables
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID?.trim();
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY?.trim();

// Debug logging (without exposing full API key)
const debugLog = () => {
  console.log('🔍 OneSignal Configuration Check:');
  console.log('   ONESIGNAL_APP_ID:', ONESIGNAL_APP_ID ? `✅ Set (${ONESIGNAL_APP_ID.substring(0, 8)}...)` : '❌ Missing');
  console.log('   ONESIGNAL_API_KEY:', ONESIGNAL_API_KEY ? `✅ Set (${ONESIGNAL_API_KEY.substring(0, 8)}...)` : '❌ Missing');
  if (ONESIGNAL_API_KEY) {
    console.log('   API Key length:', ONESIGNAL_API_KEY.length, 'characters');
  }
};

if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) {
  console.warn('⚠️  OneSignal configuration missing!');
  debugLog();
  console.warn('   Push notifications will not work until these are configured.');
  console.warn('   Please set these in your .env file:');
  console.warn('   - ONESIGNAL_APP_ID: Your OneSignal App ID (found in Settings > Keys & IDs)');
  console.warn('   - ONESIGNAL_API_KEY: Your OneSignal REST API Key (found in Settings > Keys & IDs)');
  console.warn('   ⚠️  Make sure to restart your server after updating .env file!');
} else {
  debugLog();
}

// Initialize OneSignal client (will be null if credentials are missing)
let client = null;
if (ONESIGNAL_APP_ID && ONESIGNAL_API_KEY) {
  try {
    // Validate API key format
    // Organization API keys start with "os_v2_org_" - these won't work!
    if (ONESIGNAL_API_KEY.startsWith('os_v2_org_')) {
      console.error('❌ ERROR: You are using an Organization API Key, but you need an App REST API Key!');
      console.error('   Organization API Keys (starting with "os_v2_org_") are for managing apps, not sending notifications.');
      console.error('   You need to get the App REST API Key instead:');
      console.error('   1. Go to your OneSignal Dashboard');
      console.error('   2. Select your App');
      console.error('   3. Go to Settings > Keys & IDs');
      console.error('   4. Under "REST API Keys" section, click "Add Key" or use an existing App API Key');
      console.error('   5. Copy the App REST API Key (should NOT start with "os_v2_org_")');
      console.error('   6. Update ONESIGNAL_API_KEY in your .env file');
      console.error('   7. Restart your server');
    } else if (ONESIGNAL_API_KEY.length < 20) {
      console.error('❌ OneSignal API Key appears to be too short. Please verify it is the correct REST API Key.');
      console.error('   Expected: A long alphanumeric string (usually 40+ characters)');
      console.error('   Found:', ONESIGNAL_API_KEY.length, 'characters');
    } else {
      client = new OneSignal.Client(ONESIGNAL_APP_ID, ONESIGNAL_API_KEY);
      console.log('✅ OneSignal client initialized successfully');
    }
  } catch (error) {
    console.error('❌ Failed to initialize OneSignal client:', error.message);
  }
}

/**
 * Send push notification to specific users
 * @param {Array} playerIds - Array of OneSignal player IDs
 * @param {Object} notification - Notification content
 */
const sendToUsers = async (playerIds, notification) => {
  try {
    // Check if OneSignal is configured
    if (!client) {
      console.warn('⚠️  OneSignal not configured. Skipping notification.');
      return { success: false, message: 'OneSignal not configured' };
    }

    // Filter out null/undefined/empty player IDs
    const validPlayerIds = playerIds.filter(id => id && id.trim && id.trim().length > 0);

    if (!validPlayerIds || validPlayerIds.length === 0) {
      console.warn('⚠️  No valid player IDs provided for notification:', {
        title: notification.title,
        originalPlayerIds: playerIds,
        validPlayerIds: validPlayerIds
      });
      return { success: false, message: 'No valid player IDs provided' };
    }

    console.log('📤 Sending OneSignal notification:', {
      title: notification.title,
      message: notification.message.substring(0, 50) + '...',
      playerIdsCount: validPlayerIds.length,
      playerIds: validPlayerIds.map(id => id.substring(0, 8) + '...') // Log first 8 chars only
    });

    // Build notification payload
    const notificationPayload = {
      include_player_ids: validPlayerIds, // Use filtered valid player IDs
      contents: { en: notification.message },
      headings: { en: notification.title || 'bibbly' },
      data: notification.data || {},
      ios_badgeType: 'Increase',
      ios_badgeCount: 1
    };

    // Only include android_channel_id if provided (channels must exist in OneSignal dashboard)
    // If not provided or channel doesn't exist, OneSignal will use the default channel
    if (notification.channelId) {
      notificationPayload.android_channel_id = notification.channelId;
    }

    // Only include icons if provided
    if (notification.smallIcon) {
      notificationPayload.small_icon = notification.smallIcon;
    }
    if (notification.largeIcon) {
      notificationPayload.large_icon = notification.largeIcon;
    }

    const response = await client.createNotification(notificationPayload);

    // Log full response for debugging
    const responseData = response.body || response;
    const responseId = responseData.id || responseData.notificationId || response.id || 'N/A';
    const recipientsCount = responseData.recipients || responseData.number_of_devices || validPlayerIds.length;
    
    console.log('✅ OneSignal notification sent successfully:', {
      title: notification.title,
      recipients: recipientsCount,
      responseId: responseId,
      responseStatus: response.statusCode || response.status || 'N/A',
      responseBody: JSON.stringify(responseData).substring(0, 300) // First 300 chars
    });

    // Check if there are any errors in the response
    if (responseData.errors && responseData.errors.length > 0) {
      console.error('❌ OneSignal returned errors:', responseData.errors);
    }

    // Check if notification was actually delivered
    if (responseData.recipients === 0 || recipientsCount === 0) {
      console.warn('⚠️  WARNING: Notification sent but 0 recipients! This could mean:');
      console.warn('   1. Player IDs are invalid or not subscribed');
      console.warn('   2. Device has unsubscribed from notifications');
      console.warn('   3. App is not properly configured in OneSignal dashboard');
    }

    return { success: true, response };
  } catch (error) {
    console.error('OneSignal error:', error);
    
    // Provide more helpful error messages
    if (error.statusCode === 403 || error.body?.errors?.some(e => e.includes('Access denied'))) {
      console.error('❌ OneSignal API Key is invalid or missing.');
      console.error('   This usually means you are using the wrong type of API key.');
      console.error('   ⚠️  Make sure you are using the App REST API Key, NOT the Organization API Key!');
      console.error('   Steps to fix:');
      console.error('   1. Go to OneSignal Dashboard > Your App > Settings > Keys & IDs');
      console.error('   2. Under "REST API Keys" section, create a new App API Key or use an existing one');
      console.error('   3. The App REST API Key should be a long alphanumeric string (40+ chars)');
      console.error('   4. It should NOT start with "os_v2_org_" (that is an Organization key)');
      console.error('   5. Update ONESIGNAL_API_KEY in your .env file with the App REST API Key');
      console.error('   6. Restart your server');
      return { success: false, error: 'Invalid OneSignal API key. Please use the App REST API Key, not the Organization API Key.' };
    }
    
    if (error.statusCode === 400) {
      console.error('❌ OneSignal request error:', error.body);
      const errorMessage = error.body?.errors?.[0] || error.message;
      
      // Provide helpful guidance for Android channel errors
      if (errorMessage.includes('android_channel_id')) {
        console.error('   💡 Android notification channel not found.');
        console.error('   To fix this:');
        console.error('   1. Go to OneSignal Dashboard > Your App > Settings > Platforms > Android');
        console.error('   2. Create notification channels (e.g., "messages", "message_requests", "reveals", "profile_views")');
        console.error('   3. Or remove the channelId parameter to use the default channel');
        console.error('   For now, notifications will work without specifying a channel.');
      }
      
      return { success: false, error: errorMessage };
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * Send notification for new message request
 */
const sendMessageRequestNotification = async (playerIds, senderName, isAnonymous, requestId = null) => {
  const data = { type: 'message_request' };
  if (requestId) {
    data.targetId = requestId;
    data.targetType = 'request';
  }
  return sendToUsers(playerIds, {
    title: 'New Message Request 💬',
    message: isAnonymous 
      ? 'Someone wants to chat with you!' 
      : `${senderName} wants to chat with you!`,
    data: data
    // channelId removed - will use OneSignal default channel
    // To use custom channels, create them in OneSignal Dashboard first
  });
};

/**
 * Send notification for request accepted
 */
const sendRequestAcceptedNotification = async (playerIds, accepterName, isAnonymous, conversationId = null) => {
  const data = { type: 'request_accepted' };
  if (conversationId) {
    data.targetId = conversationId;
    data.targetType = 'conversation';
  }
  return sendToUsers(playerIds, {
    title: 'Request Accepted ✅',
    message: isAnonymous 
      ? 'Your message request was accepted!' 
      : `${accepterName} accepted your request!`,
    data: data
    // channelId removed - will use OneSignal default channel
  });
};

/**
 * Send notification for new message
 * @param {Array} playerIds - Array of OneSignal player IDs
 * @param {String} senderName - Name or username to display (already determined by caller)
 * @param {String} messagePreview - Message preview text
 * @param {Boolean} isAnonymous - Whether sender is anonymous (for data purposes)
 * @param {String} conversationId - Conversation ID
 */
const sendNewMessageNotification = async (playerIds, senderName, messagePreview, isAnonymous, conversationId = null) => {
  const data = { type: 'new_message' };
  if (conversationId) {
    data.targetId = conversationId;
    data.targetType = 'conversation';
  }
  // Use the senderName passed by caller (it's already calculated correctly - username or full name)
  // Don't override with 'Anonymous' since the caller handles the logic
  return sendToUsers(playerIds, {
    title: senderName || 'Someone',
    message: messagePreview.substring(0, 100),
    data: data
    // channelId removed - will use OneSignal default channel
  });
};

/**
 * Send notification for identity reveal
 */
const sendRevealNotification = async (playerIds, revealerName, conversationId = null) => {
  const data = { type: 'identity_reveal' };
  if (conversationId) {
    data.targetId = conversationId;
    data.targetType = 'conversation';
  }
  return sendToUsers(playerIds, {
    title: 'Identity Revealed! 🎭',
    message: `${revealerName} revealed their identity to you!`,
    data: data
    // channelId removed - will use OneSignal default channel
  });
};

/**
 * Send notification for profile view (premium feature)
 */
const sendProfileViewNotification = async (playerIds, viewerName, isAnonymous, viewerId = null) => {
  const data = { type: 'profile_view' };
  if (viewerId) {
    data.targetId = viewerId;
    data.targetType = 'profile';
  }
  return sendToUsers(playerIds, {
    title: 'Profile Viewed 👀',
    message: isAnonymous 
      ? 'Someone viewed your profile!' 
      : `${viewerName} viewed your profile!`,
    data: data
    // channelId removed - will use OneSignal default channel
  });
};

module.exports = {
  client,
  sendToUsers,
  sendMessageRequestNotification,
  sendRequestAcceptedNotification,
  sendNewMessageNotification,
  sendRevealNotification,
  sendProfileViewNotification
};

