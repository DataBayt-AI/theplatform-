/**
 * Wraps a route handler (sync or async) so any thrown error is forwarded
 * to Express's next(err) instead of crashing or hanging.
 *
 * Usage:
 *   app.get('/api/foo', asyncHandler(async (req, res) => {
 *     // throw or return — errors go to errorHandler automatically
 *   }));
 */
export const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
