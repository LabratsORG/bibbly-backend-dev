/**
 * Socket.IO WebSocket Handler
 * Real-time messaging and notifications
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const logger = require('../utils/logger');

let io = null;

/**
 * Initialize Socket.IO
 */
const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? [process.env.FRONTEND_URL, process.env.APP_URL]
        : '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user || user.accountStatus !== 'active') {
        return next(new Error('User not found or inactive'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket auth error:', error.message);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const userId = socket.userId;
    logger.info(`User connected: ${userId}`);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Update user's online status
    updateUserStatus(userId, true);

    // Join conversation rooms
    joinUserConversations(socket, userId);

    // Handle joining a conversation room
    socket.on('join_conversation', async (conversationId) => {
      try {
        // Verify user is participant
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.user': userId
        });

        if (conversation) {
          socket.join(`conversation:${conversationId}`);
          logger.debug(`User ${userId} joined conversation ${conversationId}`);
        }
      } catch (error) {
        logger.error('Join conversation error:', error);
      }
    });

    // Handle leaving a conversation room
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      logger.debug(`User ${userId} left conversation ${conversationId}`);
    });

    // Handle new message
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, content, type = 'text', replyTo } = data;

        // Verify user is participant
        const conversation = await Conversation.findOne({
          _id: conversationId,
          'participants.user': userId,
          status: 'active'
        });

        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        // Get recipient
        const otherParticipant = conversation.participants.find(
          p => p.user.toString() !== userId
        );
        const recipientId = otherParticipant.user;

        // Create message
        const message = await Message.create({
          conversation: conversationId,
          sender: userId,
          recipient: recipientId,
          content,
          type,
          replyTo
        });

        await message.populate('sender', 'username');

        // Update conversation
        await conversation.updateLastMessage(content, userId, type);

        // Emit to conversation room
        io.to(`conversation:${conversationId}`).emit('new_message', {
          message,
          conversationId
        });

        // Emit to recipient's user room for notifications
        io.to(`user:${recipientId}`).emit('message_notification', {
          conversationId,
          senderId: userId,
          preview: content.substring(0, 50)
        });

      } catch (error) {
        logger.error('Send message socket error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicator
    socket.on('typing_start', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        userId,
        conversationId
      });
    });

    socket.on('typing_stop', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
        userId,
        conversationId
      });
    });

    // Handle message read
    socket.on('mark_read', async (data) => {
      try {
        const { conversationId, messageIds } = data;

        // Update messages as read
        await Message.updateMany(
          {
            _id: { $in: messageIds },
            recipient: userId
          },
          {
            $set: {
              isRead: true,
              readAt: new Date(),
              deliveryStatus: 'read'
            }
          }
        );

        // Update conversation unread count
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          await conversation.markAsRead(userId);
        }

        // Notify sender
        socket.to(`conversation:${conversationId}`).emit('messages_read', {
          conversationId,
          messageIds,
          readBy: userId
        });

      } catch (error) {
        logger.error('Mark read socket error:', error);
      }
    });

    // Handle message delivered
    socket.on('mark_delivered', async (messageIds) => {
      try {
        const messages = await Message.updateMany(
          {
            _id: { $in: messageIds },
            recipient: userId,
            deliveryStatus: 'sent'
          },
          {
            $set: {
              deliveryStatus: 'delivered',
              deliveredAt: new Date()
            }
          }
        );

        // Get conversation IDs and notify senders
        const updatedMessages = await Message.find({ _id: { $in: messageIds } });
        const conversationIds = [...new Set(updatedMessages.map(m => m.conversation.toString()))];
        
        conversationIds.forEach(convId => {
          socket.to(`conversation:${convId}`).emit('messages_delivered', {
            conversationId: convId,
            messageIds
          });
        });

      } catch (error) {
        logger.error('Mark delivered socket error:', error);
      }
    });

    // Handle reaction
    socket.on('add_reaction', async (data) => {
      try {
        const { messageId, emoji } = data;

        const message = await Message.findById(messageId);
        if (message) {
          await message.addReaction(userId, emoji);

          io.to(`conversation:${message.conversation}`).emit('message_reaction', {
            messageId,
            userId,
            emoji
          });
        }
      } catch (error) {
        logger.error('Add reaction socket error:', error);
      }
    });

    // Handle online status requests
    socket.on('get_online_status', async (userIds) => {
      const onlineUsers = {};
      
      for (const id of userIds) {
        const userSockets = await io.in(`user:${id}`).fetchSockets();
        onlineUsers[id] = userSockets.length > 0;
      }

      socket.emit('online_status_update', onlineUsers);
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      logger.info(`User disconnected: ${userId}`);
      
      // Check if user has other active connections
      const userSockets = await io.in(`user:${userId}`).fetchSockets();
      
      if (userSockets.length === 0) {
        // User is fully offline
        updateUserStatus(userId, false);
        
        // Broadcast offline status to user's conversations
        const conversations = await Conversation.find({
          'participants.user': userId,
          status: 'active'
        });

        conversations.forEach(conv => {
          socket.to(`conversation:${conv._id}`).emit('user_offline', { userId });
        });
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error:', error);
    });
  });

  logger.info('🔌 Socket.IO initialized');
  return io;
};

/**
 * Update user's online status
 */
const updateUserStatus = async (userId, isOnline) => {
  try {
    await User.findByIdAndUpdate(userId, {
      lastActiveAt: new Date()
    });
  } catch (error) {
    logger.error('Update user status error:', error);
  }
};

/**
 * Join user to their conversation rooms
 */
const joinUserConversations = async (socket, userId) => {
  try {
    const conversations = await Conversation.find({
      'participants.user': userId,
      status: 'active'
    }).select('_id');

    conversations.forEach(conv => {
      socket.join(`conversation:${conv._id}`);
    });

    logger.debug(`User ${userId} joined ${conversations.length} conversation rooms`);
  } catch (error) {
    logger.error('Join user conversations error:', error);
  }
};

/**
 * Get Socket.IO instance
 */
const getSocketIO = () => io;

/**
 * Emit event to specific user
 */
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

/**
 * Emit event to conversation
 */
const emitToConversation = (conversationId, event, data) => {
  if (io) {
    io.to(`conversation:${conversationId}`).emit(event, data);
  }
};

/**
 * Check if user is online
 */
const isUserOnline = async (userId) => {
  if (!io) return false;
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  return sockets.length > 0;
};

module.exports = {
  initializeSocket,
  getSocketIO,
  emitToUser,
  emitToConversation,
  isUserOnline
};

