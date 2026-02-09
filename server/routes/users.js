import { getDatabase } from '../services/database.js';
import crypto from 'crypto';

/**
 * Users API routes
 */
export function registerUserRoutes(app) {
    const db = getDatabase();

    // Get all users (admin or manager only)
    app.get('/api/users', (req, res) => {
        try {
            const user = req.user;

            // Allow admin and manager to see user list
            if (!user || (!user.roles?.includes('admin') && !user.roles?.includes('manager'))) {
                return res.status(403).json({ error: 'Access denied' });
            }

            const users = db.prepare('SELECT id, username, roles, must_change_password, created_at, updated_at FROM users').all();

            res.json(users.map(u => ({
                id: u.id,
                username: u.username,
                roles: JSON.parse(u.roles),
                mustChangePassword: !!u.must_change_password,
                createdAt: u.created_at,
                updatedAt: u.updated_at
            })));
        } catch (error) {
            console.error('Error fetching users:', error);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    });

    // Get single user
    app.get('/api/users/:id', (req, res) => {
        try {
            const { id } = req.params;
            const user = db.prepare('SELECT id, username, roles, must_change_password, created_at, updated_at FROM users WHERE id = ?').get(id);

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                id: user.id,
                username: user.username,
                roles: JSON.parse(user.roles),
                mustChangePassword: !!user.must_change_password,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            });
        } catch (error) {
            console.error('Error fetching user:', error);
            res.status(500).json({ error: 'Failed to fetch user' });
        }
    });

    // Create user (admin only)
    app.post('/api/users', (req, res) => {
        try {
            const currentUser = req.user;
            if (!currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const { username, password, roles = ['annotator'], mustChangePassword = true } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }

            // Check if username already exists
            const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
            if (existing) {
                return res.status(409).json({ error: 'Username already exists' });
            }

            const id = crypto.randomUUID();
            const now = Date.now();

            db.prepare(`
        INSERT INTO users (id, username, password, roles, must_change_password, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, username, password, JSON.stringify(roles), mustChangePassword ? 1 : 0, now, now);

            res.status(201).json({
                id,
                username,
                roles,
                mustChangePassword,
                createdAt: now,
                updatedAt: now
            });
        } catch (error) {
            console.error('Error creating user:', error);
            res.status(500).json({ error: 'Failed to create user' });
        }
    });

    // Update user
    app.put('/api/users/:id', (req, res) => {
        try {
            const currentUser = req.user;
            const { id } = req.params;
            const { password, roles, mustChangePassword } = req.body;

            // Only admin can change roles, users can change their own password
            const isAdmin = currentUser?.roles?.includes('admin');
            const isSelf = currentUser?.id === id;

            if (!isAdmin && !isSelf) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Non-admin can only change their own password
            if (!isAdmin && roles !== undefined) {
                return res.status(403).json({ error: 'Only admin can change roles' });
            }

            const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
            if (!existing) {
                return res.status(404).json({ error: 'User not found' });
            }

            const now = Date.now();
            const updates = [];
            const values = [];

            if (password !== undefined) {
                updates.push('password = ?');
                values.push(password);
            }
            if (roles !== undefined && isAdmin) {
                updates.push('roles = ?');
                values.push(JSON.stringify(roles));
            }
            if (mustChangePassword !== undefined) {
                updates.push('must_change_password = ?');
                values.push(mustChangePassword ? 1 : 0);
            }

            if (updates.length > 0) {
                updates.push('updated_at = ?');
                values.push(now);
                values.push(id);

                db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
            }

            res.json({ success: true, updatedAt: now });
        } catch (error) {
            console.error('Error updating user:', error);
            res.status(500).json({ error: 'Failed to update user' });
        }
    });

    // Delete user (admin only)
    app.delete('/api/users/:id', (req, res) => {
        try {
            const currentUser = req.user;
            if (!currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const { id } = req.params;

            // Prevent deleting yourself
            if (currentUser.id === id) {
                return res.status(400).json({ error: 'Cannot delete your own account' });
            }

            const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    });

    // Auth routes
    app.post('/api/auth/login', (req, res) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password are required' });
            }

            const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

            if (!user || user.password !== password) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            // Return user info (in a real app, you'd set a session/JWT)
            res.json({
                id: user.id,
                username: user.username,
                roles: JSON.parse(user.roles),
                mustChangePassword: !!user.must_change_password
            });
        } catch (error) {
            console.error('Error during login:', error);
            res.status(500).json({ error: 'Login failed' });
        }
    });

    // Get current user (based on header auth for now)
    app.get('/api/auth/me', (req, res) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = db.prepare('SELECT id, username, roles, must_change_password FROM users WHERE id = ?').get(req.user.id);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            username: user.username,
            roles: JSON.parse(user.roles),
            mustChangePassword: !!user.must_change_password
        });
    });

    // ========== Invite Token Routes ==========

    // Generate invite token (admin only)
    app.post('/api/invite', (req, res) => {
        try {
            const currentUser = req.user;
            if (!currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const {
                roles = ['annotator'],
                maxUses = 0,  // 0 = unlimited
                expiresInDays = 0  // 0 = never expires
            } = req.body;

            const id = crypto.randomUUID();
            const token = crypto.randomUUID().replace(/-/g, '');  // Clean token without dashes
            const now = Date.now();
            const expiresAt = expiresInDays > 0 ? now + (expiresInDays * 24 * 60 * 60 * 1000) : null;

            db.prepare(`
                INSERT INTO invite_tokens (id, token, created_by, default_roles, max_uses, current_uses, expires_at, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?)
            `).run(id, token, currentUser.id, JSON.stringify(roles), maxUses, expiresAt, now);

            res.status(201).json({
                id,
                token,
                inviteUrl: `/signup?token=${token}`,
                roles,
                maxUses,
                expiresAt,
                createdAt: now
            });
        } catch (error) {
            console.error('Error generating invite token:', error);
            res.status(500).json({ error: 'Failed to generate invite token' });
        }
    });

    // Get all invite tokens (admin only)
    app.get('/api/invite', (req, res) => {
        try {
            const currentUser = req.user;
            if (!currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const tokens = db.prepare(`
                SELECT t.*, u.username as created_by_name 
                FROM invite_tokens t 
                LEFT JOIN users u ON t.created_by = u.id 
                ORDER BY t.created_at DESC
            `).all();

            res.json(tokens.map(t => ({
                id: t.id,
                token: t.token,
                inviteUrl: `/signup?token=${t.token}`,
                roles: JSON.parse(t.default_roles),
                maxUses: t.max_uses,
                currentUses: t.current_uses,
                expiresAt: t.expires_at,
                isActive: !!t.is_active,
                createdBy: t.created_by,
                createdByName: t.created_by_name,
                createdAt: t.created_at
            })));
        } catch (error) {
            console.error('Error fetching invite tokens:', error);
            res.status(500).json({ error: 'Failed to fetch invite tokens' });
        }
    });

    // Validate invite token (public)
    app.get('/api/invite/:token/validate', (req, res) => {
        try {
            const { token } = req.params;

            const invite = db.prepare('SELECT * FROM invite_tokens WHERE token = ?').get(token);

            if (!invite) {
                return res.status(404).json({ valid: false, error: 'Invalid invite token' });
            }

            if (!invite.is_active) {
                return res.status(410).json({ valid: false, error: 'This invite link has been deactivated' });
            }

            if (invite.expires_at && Date.now() > invite.expires_at) {
                return res.status(410).json({ valid: false, error: 'This invite link has expired' });
            }

            if (invite.max_uses > 0 && invite.current_uses >= invite.max_uses) {
                return res.status(410).json({ valid: false, error: 'This invite link has reached its maximum uses' });
            }

            res.json({
                valid: true,
                roles: JSON.parse(invite.default_roles)
            });
        } catch (error) {
            console.error('Error validating invite token:', error);
            res.status(500).json({ valid: false, error: 'Failed to validate invite token' });
        }
    });

    // Signup with invite token (public)
    app.post('/api/auth/signup', (req, res) => {
        try {
            const { username, password, token } = req.body;

            if (!username || !password || !token) {
                return res.status(400).json({ error: 'Username, password, and invite token are required' });
            }

            // Validate token
            const invite = db.prepare('SELECT * FROM invite_tokens WHERE token = ?').get(token);

            if (!invite) {
                return res.status(404).json({ error: 'Invalid invite token' });
            }

            if (!invite.is_active) {
                return res.status(410).json({ error: 'This invite link has been deactivated' });
            }

            if (invite.expires_at && Date.now() > invite.expires_at) {
                return res.status(410).json({ error: 'This invite link has expired' });
            }

            if (invite.max_uses > 0 && invite.current_uses >= invite.max_uses) {
                return res.status(410).json({ error: 'This invite link has reached its maximum uses' });
            }

            // Check if username already exists
            const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
            if (existing) {
                return res.status(409).json({ error: 'Username already exists' });
            }

            // Create user
            const userId = crypto.randomUUID();
            const now = Date.now();
            const roles = JSON.parse(invite.default_roles);

            db.prepare(`
                INSERT INTO users (id, username, password, roles, must_change_password, created_at, updated_at)
                VALUES (?, ?, ?, ?, 0, ?, ?)
            `).run(userId, username, password, invite.default_roles, now, now);

            // Increment invite usage
            db.prepare('UPDATE invite_tokens SET current_uses = current_uses + 1 WHERE id = ?').run(invite.id);

            // Return user info
            res.status(201).json({
                id: userId,
                username,
                roles,
                mustChangePassword: false
            });
        } catch (error) {
            console.error('Error during signup:', error);
            res.status(500).json({ error: 'Signup failed' });
        }
    });

    // Deactivate/reactivate invite token (admin only)
    app.patch('/api/invite/:id', (req, res) => {
        try {
            const currentUser = req.user;
            if (!currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const { id } = req.params;
            const { isActive } = req.body;

            const result = db.prepare('UPDATE invite_tokens SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Invite token not found' });
            }

            res.json({ success: true, isActive });
        } catch (error) {
            console.error('Error updating invite token:', error);
            res.status(500).json({ error: 'Failed to update invite token' });
        }
    });

    // Delete invite token (admin only)
    app.delete('/api/invite/:id', (req, res) => {
        try {
            const currentUser = req.user;
            if (!currentUser?.roles?.includes('admin')) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const { id } = req.params;
            const result = db.prepare('DELETE FROM invite_tokens WHERE id = ?').run(id);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Invite token not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting invite token:', error);
            res.status(500).json({ error: 'Failed to delete invite token' });
        }
    });
}

export default { registerUserRoutes };
