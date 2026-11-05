// ============================================================
// Seed / reset protection
//
// Seed routes delete and recreate data, so they must never be public.
// Access is granted to:
//   - a logged-in admin, OR
//   - a request with header `x-seed-secret: <SEED_SECRET>` (for first-time
//     setup before any admin exists). Leave SEED_SECRET unset in production
//     once your admin account exists.
// Destructive routes (full reset / reseed) additionally require
// ALLOW_DB_RESET=true in the environment.
// ============================================================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function requireSeedAccess({ destructive = false } = {}) {
  return async (req, res, next) => {
    if (destructive && process.env.ALLOW_DB_RESET !== 'true') {
      return res.status(403).json({ message: 'Database reset is disabled. Set ALLOW_DB_RESET=true to enable it.' });
    }

    const secret = process.env.SEED_SECRET;
    if (secret && safeEqual(req.headers['x-seed-secret'], secret)) return next();

    try {
      const token = req.cookies?.token;
      if (!token) return res.status(401).json({ message: 'Authentication required' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId || decoded.id).select('role isActive');
      if (!user || !user.isActive || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }
      req.user = user;
      return next();
    } catch (e) {
      return res.status(401).json({ message: 'Authentication required' });
    }
  };
}

module.exports = { requireSeedAccess };
