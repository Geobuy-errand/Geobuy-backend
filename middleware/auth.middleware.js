const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

/**
 * The login token, from the "Authorization: Bearer <token>" header (used by
 * the app — Safari/iOS block cross-site cookies) or the httpOnly cookie.
 */
function tokenFromRequest(req) {
  const header = req.headers?.authorization || '';
  if (/^Bearer\s+/i.test(header)) {
    const t = header.replace(/^Bearer\s+/i, '').trim();
    if (t && t !== 'null' && t !== 'undefined') return t;
  }
  return req.cookies?.token;
}

const authMiddleware = async (req, res, next) => {
  try {
    const token = tokenFromRequest(req);
    
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Older provider tokens used `id` instead of `userId` — accept both.
    const user = await User.findById(decoded.userId || decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(500).json({ message: 'Server error' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
};

// Sets req.user if a valid token cookie is present; never rejects the request.
const optionalAuth = async (req, res, next) => {
  try {
    const token = tokenFromRequest(req);
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId || decoded.id).select('-password');
      if (user && user.isActive) req.user = user;
    }
  } catch (e) {
    // ignore — treat as anonymous
  }
  next();
};

module.exports = {
  tokenFromRequest, authMiddleware, requireRole, optionalAuth };