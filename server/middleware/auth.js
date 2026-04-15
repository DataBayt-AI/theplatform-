import jwt from 'jsonwebtoken';
import { getDatabase } from '../services/database.js';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('\n  FATAL: JWT_SECRET is not set in environment variables.');
    console.error('  Set JWT_SECRET to a random string of at least 32 characters.\n');
    process.exit(1);
  }
  return secret;
}

export const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, username: user.username, roles: user.roles },
    getSecret(),
    { expiresIn: '8h' }
  );
};

export const attachUser = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, getSecret());
      const db = getDatabase();
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
      if (user) {
        req.user = {
          ...user,
          roles: JSON.parse(user.roles)
        };
      }
    } catch (error) {
      // Invalid or expired token — req.user stays undefined
    }
  }

  next();
};

export const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

export const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const hasRole = req.user.roles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};

export const loadProject = (req, res, next) => {
  if (!req.project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  next();
};

export const requireProjectRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.user.roles.includes('admin')) {
      return next();
    }
    if (!req.project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { roles, id } = req.user;
    const isManager = roles.includes('manager') && req.project.managerId === id;
    const isAnnotator = roles.includes('annotator') && (req.project.annotatorIds || []).includes(id);

    if (allowedRoles.includes('manager') && isManager) return next();
    if (allowedRoles.includes('annotator') && isAnnotator) return next();

    return res.status(403).json({ error: 'Forbidden' });
  };
};
