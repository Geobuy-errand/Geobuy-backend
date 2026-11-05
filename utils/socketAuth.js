// ============================================================
// Socket.IO authentication & room authorisation
// Every socket must present the same JWT the REST API uses (httpOnly
// "token" cookie, or `auth.token` in the handshake). Users can only join
// rooms that belong to them.
// ============================================================

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User.model');

function parseCookies(header = '') {
  return header.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return acc;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      acc[key] = decodeURIComponent(val);
    } catch (e) {
      acc[key] = val;
    }
    return acc;
  }, {});
}

/** io.use() middleware */
async function authenticateSocket(socket, next) {
  try {
    const cookies = parseCookies(socket.handshake.headers?.cookie || '');
    const token = socket.handshake.auth?.token || cookies.token;
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId).select('_id role fullName isActive country').lean();
    if (!user || !user.isActive) return next(new Error('Authentication failed'));

    socket.user = { id: String(user._id), role: user.role, fullName: user.fullName, country: user.country || 'GB' };
    return next();
  } catch (err) {
    return next(new Error('Authentication failed'));
  }
}

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const same = (a, b) => a && b && String(a?._id || a) === String(b?._id || b);

/** Can this socket's user see errand / service request / booking `id`? */
async function canAccessJob(user, id) {
  if (!isId(id)) return false;
  if (user.role === 'admin') return true;

  const Errand = mongoose.models.Errand;
  const ServiceRequest = mongoose.models.ServiceRequest;
  const Booking = mongoose.models.Booking;

  if (Errand) {
    const e = await Errand.findById(id).select('customerId providerId').lean();
    if (e) return same(e.customerId, user.id) || same(e.providerId, user.id);
  }
  if (ServiceRequest) {
    const r = await ServiceRequest.findById(id).select('customerId selectedProviderId invitedProviders.providerId').lean();
    if (r) {
      return (
        same(r.customerId, user.id) ||
        same(r.selectedProviderId, user.id) ||
        (r.invitedProviders || []).some((p) => same(p.providerId, user.id))
      );
    }
  }
  if (Booking) {
    const b = await Booking.findById(id).select('customerId providerId').lean();
    if (b) return same(b.customerId, user.id) || same(b.providerId, user.id);
  }
  return false;
}

async function canAccessChat(user, chatId) {
  if (!isId(chatId)) return false;
  if (user.role === 'admin') return true;
  const Chat = mongoose.models.Chat;
  if (!Chat) return false;
  const chat = await Chat.findById(chatId).lean();
  if (!chat) return false;
  const participants = (chat.participants || []).map((p) => String(p?.userId || p?.user || p?._id || p));
  return participants.includes(user.id);
}

/** Register all room / relay handlers for one authenticated socket. */
function registerSocketHandlers(io, socket) {
  const user = socket.user;
  const ownRoom = `user_${user.id}`;

  // Every user is always in their own room.
  socket.join(ownRoom);
  if (user.role === 'provider') socket.join(`provider_${user.id}`);
  if (user.role === 'customer') socket.join(`customer_${user.id}`);
  if (user.role === 'admin') socket.join('admin_room');

  // Legacy join events — only allowed for the user's own id.
  socket.on('join-room', (userId) => same(userId, user.id) && socket.join(ownRoom));
  socket.on('provider-join', (id) => same(id, user.id) && socket.join(`provider_${user.id}`));
  socket.on('customer-join', (id) => same(id, user.id) && socket.join(`customer_${user.id}`));
  socket.on('admin-join', () => user.role === 'admin' && socket.join('admin_room'));

  socket.on('join-errand', async (errandId) => {
    if (await canAccessJob(user, errandId)) socket.join(`errand_${errandId}`);
  });
  socket.on('join-booking', async (bookingId) => {
    if (await canAccessJob(user, bookingId)) socket.join(`booking_${bookingId}`);
  });
  socket.on('join-chat', async (chatId) => {
    if (await canAccessChat(user, chatId)) socket.join(`chat_${chatId}`);
  });

  // Client relays: only into rooms the sender is actually in.
  socket.on('send-message', (data = {}) => {
    const room = `booking_${data.bookingId}`;
    if (!socket.rooms.has(room)) return;
    const payload = { ...data, senderId: user.id };
    io.to(room).emit('new-message', payload);
    if (data.receiverId) io.to(`user_${data.receiverId}`).emit('new-message-notification', payload);
  });

  socket.on('booking-update', (data = {}) => {
    const room = `booking_${data.bookingId}`;
    if (!socket.rooms.has(room)) return;
    io.to(room).emit('booking-updated', { ...data, updatedBy: user.id });
  });

  socket.on('provider-availability', (data = {}) => {
    io.to(ownRoom).emit('availability-updated', { ...data, providerId: user.id });
  });

  socket.on('typing', (data = {}) => {
    if (!data.userId) return;
    socket.to(`user_${data.userId}`).emit('typing', { ...data, fromUserId: user.id });
  });

  // Runner live location for an errand they are assigned to
  socket.on('runner-location', async (data = {}) => {
    const room = `errand_${data.errandId}`;
    if (!socket.rooms.has(room)) return;
    const lat = Number(data.lat);
    const lng = Number(data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    io.to(room).emit('runner-location', { errandId: data.errandId, lat, lng, at: new Date() });
  });
}

module.exports = { authenticateSocket, registerSocketHandlers, canAccessJob, canAccessChat, parseCookies };
