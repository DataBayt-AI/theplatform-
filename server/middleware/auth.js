import { getDatabase } from '../services/database.js';

export const attachUser = (req, _res, next) => {
  const userId = req.header('x-user-id');

  if (userId) {
    try {
      const db = getDatabase();
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (user) {
        req.user = {
          ...user,
          roles: JSON.parse(user.roles)
        };
      }
    } catch (error) {
      console.error('Auth middleware error:', error);
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
