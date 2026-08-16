require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');

const webhookController = require('./controllers/webhook.controller');

const authRoutes = require('./routes/auth.route');
const userRoutes = require('./routes/user.route');
const bookingRoutes = require('./routes/booking.route');
const paymentRoutes = require('./routes/payment.route');
const messageRoutes = require('./routes/message.route');
const notificationRoutes = require('./routes/notification.route');
const reviewRoutes = require('./routes/review.route');
const serviceRoutes = require('./routes/service.route');
const walletRoutes = require('./routes/wallet.route');
const adminRoutes = require('./routes/admin.route');
const uploadRoutes = require('./routes/upload.route');
const errandRoutes = require('./routes/errand.route');
const verificationRoutes = require('./routes/verification.route');
const commissionRoutes = require('./routes/commission.route');
const qrRoutes = require('./routes/qrCode.route');
const chatRoutes = require('./routes/chat.route');
const chatbotRoutes = require('./routes/chatbot.route');
const subscriptionRoutes = require('./routes/subscription.route');
const subscriptionPlanRoutes = require('./routes/subscription.plan.route');
const settingsRoutes = require('./routes/setting.route');
const seedRoutes = require('./routes/seed.route');


const seedDatabase = require('./seed');


const app = express();

app.set('trust proxy', 1);


const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  transports: ['websocket', 'polling'],
  path: '/socket.io',
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('io', io);

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(cors(corsOptions));


app.use(cookieParser());

app.post(
  '/api/subscription/webhook', 
  express.raw({ type: 'application/json' }), 
  webhookController.handleWebhook
);

app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res)=>{
  return res.send('Welcome to GEOBUY Errands API');
})
app.use('/api', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/errands', errandRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/verifications', verificationRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/subscription-plans', subscriptionPlanRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/seed', seedRoutes);




// Health check

app.get('/api/seed', async (req, res) => {
  try {
    console.log('API seed route triggered...');
    await seedDatabase();
    res.status(200).json({ status: 'success', message: 'Database seeded successfully!' });
  } catch (error) {
    console.error('Seed route failed:', error);
    res.status(500).json({ status: 'error', message: 'Seeding failed', error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'GEOBUY Errands API is running' });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('🟢 New client connected:', socket.id);
  console.log('📡 Transport:', socket.conn.transport.name);

  socket.on('admin-join', () => {
    socket.join('admin_room');
    // console.log('📢 Admin joined admin_room');
  });

  // Join provider room
  socket.on('provider-join', (providerId) => {
    socket.join(`provider_${providerId}`);
    // console.log(`📢 Provider ${providerId} joined their room`);
  });

  // Join customer room
  socket.on('customer-join', (customerId) => {
    socket.join(`customer_${customerId}`);
    // console.log(`📢 Customer ${customerId} joined their room`);
  });

  // Join errand room
  socket.on('join-errand', (errandId) => {
    socket.join(`errand_${errandId}`);
    // console.log(`📢 Socket joined errand ${errandId}`);
  });

  socket.on('join-booking', (bookingId) => {
    socket.join(`booking_${bookingId}`);
    // console.log(`📢 Socket joined booking ${bookingId}`);
  });

  socket.on('send-message', (data) => {
    io.to(`booking_${data.bookingId}`).emit('new-message', data);
    io.to(`user_${data.receiverId}`).emit('new-message-notification', data);
  });

  socket.on('booking-update', (data) => {
    io.to(`booking_${data.bookingId}`).emit('booking-updated', data);
    io.to(`user_${data.customerId}`).emit('booking-notification', data);
    if (data.providerId) {
      io.to(`user_${data.providerId}`).emit('booking-notification', data);
    }
  });

  socket.on('provider-availability', (data) => {
    io.to(`user_${data.providerId}`).emit('availability-updated', data);
  });

  socket.on('disconnect', () => {
    console.log('🔴 Client disconnected:', socket.id);
  });



  socket.on('join-room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  socket.on('typing', (data) => {
    socket.to(`user_${data.userId}`).emit('typing', data);
  });

  // Join chat room
  socket.on('join-chat', (chatId) => {
    socket.join(`chat_${chatId}`);
    console.log(`📢 Socket joined chat ${chatId}`);
  });
});

const emitSystemEvent = (event, data, rooms = []) => {
  if (rooms.length === 0) {
    io.emit(event, data);
  } else {
    rooms.forEach(room => {
      io.to(room).emit(event, data);
    });
  }
};

// Make emitSystemEvent available globally
app.set('emitSystemEvent', emitSystemEvent);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });