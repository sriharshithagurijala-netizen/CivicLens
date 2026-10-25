
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authentication token required',
      });
    }

    const token = header.slice(7);
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return res.status(500).json({
        message: 'Server authentication is not configured',
      });
    }

    const decoded = jwt.verify(token, secret);

    const user = await User.findById(decoded.userId).select(
      '_id name email role'
    );

    if (!user) {
      return res.status(401).json({
        message: 'Account no longer exists',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return res.status(401).json({
        message: 'Invalid or expired token',
      });
    }

    next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Administrator access required',
    });
  }

  next();
}
