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
