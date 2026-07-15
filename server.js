require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

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

const app = express();

app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/services', serviceRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'GEOBUY Errands API is running' });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their room`);
  });

  socket.on('join-booking', (bookingId) => {
    socket.join(`booking_${bookingId}`);
    console.log(`Socket joined booking ${bookingId}`);
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
    console.log('Client disconnected:', socket.id);
  });
});

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
    console.log('Connected to MongoDB');
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });