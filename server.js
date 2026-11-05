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
const paystackWebhookController = require('./controllers/paystackWebhook.controller');
const routes = require('./routes');
const seedDatabase = require('./seed');
const { requireSeedAccess } = require('./middleware/seedGuard');
const { authenticateSocket, registerSocketHandlers } = require('./utils/socketAuth');
const { startScheduledJobs } = require('./services/scheduler');

const app = express();
app.set('trust proxy', 1);

const server = http.createServer(app);

// FRONTEND_URL may be a comma-separated list (e.g. UK and Nigeria domains).
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const originCheck = (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
  return callback(new Error(`Origin ${origin} not allowed by CORS`));
};

const io = new Server(server, {
  cors: {
    origin: originCheck,
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
  origin: originCheck,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
};

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(cookieParser());

// ------------------------------------------------------------
// Webhooks need the RAW body for signature checks — mount before express.json
// ------------------------------------------------------------
app.post('/api/subscription/webhook', express.raw({ type: 'application/json' }), webhookController.handleWebhook);
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), webhookController.handleWebhook);
app.post('/api/webhooks/paystack', express.raw({ type: '*/*' }), paystackWebhookController.handleWebhook);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => res.send('Welcome to GEOBUY Errands API'));

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'GEOBUY Errands API is running' });
});

app.use('/api', limiter);

// Seeding wipes data — admin (or SEED_SECRET) only. See middleware/seedGuard.js
app.get('/api/seed', requireSeedAccess({ destructive: true }), async (req, res) => {
  try {
    await seedDatabase();
    res.status(200).json({ status: 'success', message: 'Database seeded successfully!' });
  } catch (error) {
    console.error('Seed route failed:', error);
    res.status(500).json({ status: 'error', message: 'Seeding failed' });
  }
});

app.use('/api', routes);

// ------------------------------------------------------------
// Socket.io — authenticated with the same JWT cookie as the API
// ------------------------------------------------------------
io.use(authenticateSocket);
io.on('connection', (socket) => {
  registerSocketHandlers(io, socket);
});

const emitSystemEvent = (event, data, rooms = []) => {
  if (rooms.length === 0) {
    io.to('admin_room').emit(event, data);
  } else {
    rooms.forEach((room) => io.to(room).emit(event, data));
  }
};
app.set('emitSystemEvent', emitSystemEvent);

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    console.log('Connected to MongoDB');
    startScheduledJobs(app);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
