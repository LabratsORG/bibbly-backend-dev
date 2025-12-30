# bibbly Dating App - Backend

**"Talk to people you already know of, but never had the courage to text."**

A production-ready Node.js backend for bibbly, a unique dating app that connects you with people you already know from college, workplace, or social circles.

## 🚀 Features

### Core Features
- **Email/Password & Google OAuth** authentication
- **Profile Management** with Cloudinary image storage
- **Shareable Profile Links** with QR codes
- **Anonymous Messaging** system
- **Message Request** flow (Inbox/Requests/Sent)
- **Identity Reveal** feature
- **Real-time Messaging** via WebSockets

### Discovery & Search
- **Discovery Feed** (Tinder-style cards)
- **Search** by name, college, workplace, interests
- **Filter** by age, location, gender
- **College/Workplace matching**

### Safety & Privacy
- **Block/Unblock** users
- **Report** inappropriate content
- **Panic Block** (instant block + clear chat)
- **Screenshot warnings**
- **Visibility controls** (invisible, searchable, discoverable)

### Premium Features
- See profile viewers
- Unlimited message requests
- Priority requests
- Early identity reveal
- Profile analytics

## 🛠 Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose
- **Real-time:** Socket.IO
- **Image Storage:** Cloudinary
- **Push Notifications:** OneSignal
- **Authentication:** JWT + Google OAuth
- **Email:** Nodemailer

## 📦 Installation

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Cloudinary account
- OneSignal account (optional, for push notifications)

### Setup

1. **Clone and navigate to backend:**
```bash
cd backend
```

2. **Install dependencies:**
```bash
npm install
```

3. **Create environment file:**
```bash
cp env.example .env
```

4. **Configure environment variables in `.env`:**
```env
# Required
MONGODB_URI=mongodb://localhost:27017/bibbly_dating
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters
JWT_REFRESH_SECRET=your_refresh_token_secret_here

# Cloudinary (required for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google OAuth (required for Google sign-in)
GOOGLE_CLIENT_ID=your_google_client_id

# Optional
ONESIGNAL_APP_ID=your_onesignal_app_id
ONESIGNAL_API_KEY=your_onesignal_api_key
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

5. **Start the server:**
```bash
# Development
npm run dev

# Production
npm start
```

The server will start at `http://localhost:5001`

## 🔗 API Endpoints

Full API documentation available in [api_usage.md](./api_usage.md)

### Quick Reference

| Resource | Endpoints |
|----------|-----------|
| Auth | `/api/v1/auth/*` |
| Profile | `/api/v1/profile/*` |
| Users | `/api/v1/users/*` |
| Messages | `/api/v1/messages/*` |
| Requests | `/api/v1/requests/*` |
| Search | `/api/v1/search/*` |
| Discovery | `/api/v1/discover/*` |
| Block | `/api/v1/block/*` |
| Report | `/api/v1/report/*` |
| Notifications | `/api/v1/notifications/*` |
| Premium | `/api/v1/premium/*` |
| Insights | `/api/v1/insights/*` |
| Settings | `/api/v1/settings/*` |
| Public Profile | `/api/v1/p/:username` |

### Health Check
```
GET /health
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── app.js              # Express app configuration
│   ├── server.js           # Server entry point
│   ├── config/
│   │   ├── database.js     # MongoDB connection
│   │   ├── cloudinary.js   # Cloudinary setup
│   │   └── onesignal.js    # OneSignal setup
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── profileController.js
│   │   ├── messageController.js
│   │   ├── messageRequestController.js
│   │   ├── searchController.js
│   │   ├── discoveryController.js
│   │   └── ...
│   ├── middleware/
│   │   ├── auth.js         # JWT authentication
│   │   ├── errorHandler.js # Global error handling
│   │   └── validators.js   # Input validation
│   ├── models/
│   │   ├── User.js
│   │   ├── Profile.js
│   │   ├── Message.js
│   │   ├── MessageRequest.js
│   │   ├── Conversation.js
│   │   └── ...
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── profileRoutes.js
│   │   └── ...
│   ├── socket/
│   │   └── index.js        # WebSocket handlers
│   ├── jobs/
│   │   └── cronJobs.js     # Scheduled tasks
│   └── utils/
│       ├── apiResponse.js  # Standardized responses
│       ├── email.js        # Email templates
│       ├── helpers.js      # Utility functions
│       └── logger.js       # Logging
├── api_usage.md            # API documentation
├── env.example             # Environment template
├── package.json
└── README.md
```

## 🔌 WebSocket Connection

Connect to real-time messaging:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5001', {
  auth: {
    token: 'your_jwt_access_token'
  }
});

// Listen for new messages
socket.on('new_message', (data) => {
  console.log('New message:', data);
});

// Send a message
socket.emit('send_message', {
  conversationId: 'conv_id',
  content: 'Hello!'
});

// Typing indicators
socket.emit('typing_start', 'conv_id');
socket.emit('typing_stop', 'conv_id');
```

## 🔐 Authentication Flow

### Email/Password
1. `POST /auth/signup` - Create account
2. Verify email via link
3. `POST /auth/login` - Get tokens
4. Use `Authorization: Bearer <token>` header

### Google OAuth
1. Get Google ID token from client
2. `POST /auth/google` - Authenticate
3. Complete profile if new user

### Token Refresh
```javascript
// When access token expires
POST /auth/refresh-token
{ "refreshToken": "your_refresh_token" }
```

## 🎯 Message Request Flow

1. **User A shares profile link** or appears in search/feed
2. **User B sends message request** (can be anonymous)
3. **User A sees request** in "Requests" tab
4. **User A accepts** → Conversation created
5. **Both can chat** (anonymously or revealed)
6. **Optional:** Reveal identity anytime

## 📊 Rate Limits

| Action | Free Users | Premium Users |
|--------|------------|---------------|
| Message Requests/day | 5 | 50+ |
| Discovery Profiles/day | 50 | Unlimited |
| Identity Reveals/day | 1 | Unlimited |
| API Requests | 100/15min | 100/15min |

## 🔧 Environment Variables

See [env.example](./env.example) for all available configuration options.

### Required Variables
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for JWT signing (min 32 chars)
- `JWT_REFRESH_SECRET` - Secret for refresh tokens
- `CLOUDINARY_*` - Cloudinary credentials

### Optional Variables
- `ONESIGNAL_*` - Push notification service
- `SMTP_*` - Email service
- `GOOGLE_CLIENT_ID` - Google OAuth

## 🚀 Deployment

### Using PM2
```bash
npm install -g pm2
pm2 start src/server.js --name bibbly-api
```

### Docker (coming soon)
```bash
docker build -t bibbly-backend .
docker run -p 5001:5001 bibbly-backend
```

### Environment
Set `NODE_ENV=production` for production deployment.

## 🧪 Testing

```bash
npm test
```

## 📝 Scripts

```bash
npm run dev      # Development with nodemon
npm start        # Production
npm test         # Run tests
npm run lint     # ESLint
npm run seed     # Seed database (if needed)
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## 📄 License

ISC License

---

**Built with ❤️ for meaningful connections**

