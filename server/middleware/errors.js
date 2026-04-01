/**
 * Centralized HTTP error handling.
 *
 * Usage in route handlers:
 *   throw new HttpError(404, 'Project not found');
 *
 * The errorHandler middleware (registered last in index.js) catches these
 * and all other unhandled errors from asyncHandler-wrapped routes.
 */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) console.error(`[${req.method} ${req.path}]`, err);
  res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
}
