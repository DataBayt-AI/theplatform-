export const attachUser = (req, _res, next) => {
  // TODO: Replace with real auth (JWT/session) and user lookup.
  const userId = req.header('x-user-id');
  const role = req.header('x-user-role');

  if (userId && role) {
    req.user = { id: userId, role };
  } else {
    req.user = null;
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
    if (!allowedRoles.includes(req.user.role)) {
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
    if (req.user.role === 'admin') {
      return next();
    }
    if (!req.project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const { role, id } = req.user;
    const isManager = role === 'manager' && req.project.managerId === id;
    const isAnnotator = role === 'annotator' && (req.project.annotatorIds || []).includes(id);
    if (allowedRoles.includes('manager') && isManager) return next();
    if (allowedRoles.includes('annotator') && isAnnotator) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
};
