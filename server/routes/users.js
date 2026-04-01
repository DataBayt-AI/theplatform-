import { getDatabase } from '../services/database.js';
import { generateToken, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { HttpError } from '../middleware/errors.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';

const ALLOWED_ROLES = ['admin', 'manager', 'annotator'];
const BCRYPT_ROUNDS = 12;

function isValidPassword(password) {
    return typeof password === 'string' && password.length >= 5;
}

function sanitizeRoles(roles) {
    if (!Array.isArray(roles)) return ['annotator'];
    return roles.filter(r => ALLOWED_ROLES.includes(r));
}

const DEMO_XML_CONFIG = `<annotation-config>
  <field id="sentiment" type="dropdown" required="true">
    <label>Sentiment</label>
    <options>
      <option value="positive">Positive</option>
      <option value="negative">Negative</option>
      <option value="neutral">Neutral</option>
    </options>
  </field>
</annotation-config>`;

const DEMO_DATA_POINTS = [
    { content: "The product quality is outstanding! It exceeded all my expectations.", original_annotation: "positive" },
    { content: "I've been waiting for 3 weeks and still no delivery. Terrible service.", original_annotation: "negative" },
    { content: "The package arrived on time. Nothing special, just standard quality.", original_annotation: "neutral" },
    { content: "Absolutely love this! Best purchase I've made this year.", original_annotation: "positive" },
    { content: "The item broke after two days of use. Very disappointing.", original_annotation: "negative" },
    { content: "It does what it says on the box. Works as expected.", original_annotation: "neutral" },
    { content: "Customer support was incredibly helpful and resolved my issue immediately.", original_annotation: "positive" },
    { content: "The instructions were confusing and the setup took way too long.", original_annotation: "negative" },
    { content: "Average product — nothing to complain about but nothing impressive either.", original_annotation: "neutral" },
    { content: "Highly recommend! Great value for money and fast shipping.", original_annotation: "positive" },
];

function createDemoProject(db, userId, username, roles) {
    try {
        const projectId = crypto.randomUUID();
        const now = Date.now();
        const isManagerOrAdmin = roles.includes('admin') || roles.includes('manager');

        db.prepare(`
            INSERT INTO projects (id, name, description, manager_id, xml_config, guidelines, is_demo, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
            projectId,
            'Practice Project — Sentiment Analysis',
            'A sample project to help you get started. Practice accepting, rejecting, and editing AI-suggested sentiment labels on product reviews.',
            isManagerOrAdmin ? userId : null,
            DEMO_XML_CONFIG,
            'Label each product review with the correct sentiment:\n- **Positive** — the customer is satisfied or happy\n- **Negative** — the customer is dissatisfied or unhappy\n- **Neutral** — the customer is neither positive nor negative\n\nYou can accept the AI suggestion, reject it, or edit it to the correct label.',
            now, now
        );

        db.prepare('INSERT INTO project_annotators (project_id, user_id) VALUES (?, ?)').run(projectId, userId);
        db.prepare('INSERT INTO project_stats (project_id) VALUES (?)').run(projectId);

        const insertPoint = db.prepare(`
            INSERT INTO data_points (id, project_id, content, type, original_annotation, status, created_at, updated_at)
            VALUES (?, ?, ?, 'text', ?, 'pending', ?, ?)
        `);
        for (const point of DEMO_DATA_POINTS) {
            insertPoint.run(crypto.randomUUID(), projectId, point.content, point.original_annotation, now, now);
        }

        console.log(`Created demo project for new user: ${username}`);
    } catch (err) {
        console.error('Failed to create demo project for user:', err);
    }
}

const signupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: { error: 'Too many signup attempts, please try again later' },
    standardHeaders: 'draft-7',
    legacyHeaders: false
});

export function registerUserRoutes(app) {
    const db = getDatabase();

    // Get all users (admin or manager only)
    app.get('/api/users', requireRole(['admin', 'manager']), asyncHandler((req, res) => {
        const users = db.prepare(
            'SELECT id, username, roles, must_change_password, created_at, updated_at FROM users'
        ).all();
        res.json(users.map(u => ({
            id: u.id,
            username: u.username,
            roles: JSON.parse(u.roles),
            mustChangePassword: !!u.must_change_password,
            createdAt: u.created_at,
            updatedAt: u.updated_at
        })));
    }));

    // Get single user
    app.get('/api/users/:id', asyncHandler((req, res) => {
        const user = db.prepare(
            'SELECT id, username, roles, must_change_password, created_at, updated_at FROM users WHERE id = ?'
        ).get(req.params.id);
        if (!user) throw new HttpError(404, 'User not found');
        res.json({
            id: user.id,
            username: user.username,
            roles: JSON.parse(user.roles),
            mustChangePassword: !!user.must_change_password,
            createdAt: user.created_at,
            updatedAt: user.updated_at
        });
    }));

    // Create user (admin only)
    app.post('/api/users', requireRole(['admin']), asyncHandler(async (req, res) => {
        const { username, password, roles = ['annotator'], mustChangePassword = true } = req.body;

        if (!username || !password) throw new HttpError(400, 'Username and password are required');
        if (!isValidPassword(password)) throw new HttpError(400, 'Password must be at least 5 characters');

        const sanitized = sanitizeRoles(roles);
        if (sanitized.length === 0) throw new HttpError(400, 'At least one valid role is required');

        if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
            throw new HttpError(409, 'Username already exists');
        }

        const id = crypto.randomUUID();
        const now = Date.now();
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        db.prepare(`
            INSERT INTO users (id, username, password, roles, must_change_password, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, username, passwordHash, JSON.stringify(sanitized), mustChangePassword ? 1 : 0, now, now);

        createDemoProject(db, id, username, sanitized);

        res.status(201).json({ id, username, roles: sanitized, mustChangePassword, createdAt: now, updatedAt: now });
    }));

    // Update user
    app.put('/api/users/:id', asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { password, roles, mustChangePassword } = req.body;
        const currentUser = req.user;
        const isAdmin = currentUser?.roles?.includes('admin');
        const isSelf = currentUser?.id === id;

        if (!isAdmin && !isSelf) throw new HttpError(403, 'Access denied');
        if (!isAdmin && roles !== undefined) throw new HttpError(403, 'Only admin can change roles');

        const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!existing) throw new HttpError(404, 'User not found');

        const now = Date.now();
        const updates = [];
        const values = [];

        if (password !== undefined) {
            if (!isValidPassword(password)) throw new HttpError(400, 'Password must be at least 5 characters');
            updates.push('password = ?');
            values.push(await bcrypt.hash(password, BCRYPT_ROUNDS));
        }
        if (roles !== undefined && isAdmin) {
            updates.push('roles = ?');
            values.push(JSON.stringify(sanitizeRoles(roles)));
        }
        if (mustChangePassword !== undefined) {
            updates.push('must_change_password = ?');
            values.push(mustChangePassword ? 1 : 0);
        }

        if (updates.length > 0) {
            updates.push('updated_at = ?');
            values.push(now, id);
            db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }

        res.json({ success: true, updatedAt: now });
    }));

    // Delete user (admin only)
    app.delete('/api/users/:id', requireRole(['admin']), asyncHandler((req, res) => {
        const { id } = req.params;
        if (req.user.id === id) throw new HttpError(400, 'Cannot delete your own account');

        const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
        if (result.changes === 0) throw new HttpError(404, 'User not found');

        res.json({ success: true });
    }));

    // Login
    app.post('/api/auth/login', asyncHandler(async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) throw new HttpError(400, 'Username and password are required');

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) throw new HttpError(401, 'Invalid username or password');

        let passwordValid = false;
        if (!user.password.startsWith('$2')) {
            // Migrate legacy plaintext password
            if (user.password === password) {
                passwordValid = true;
                db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?')
                    .run(await bcrypt.hash(password, BCRYPT_ROUNDS), Date.now(), user.id);
            }
        } else {
            passwordValid = await bcrypt.compare(password, user.password);
        }

        if (!passwordValid) throw new HttpError(401, 'Invalid username or password');

        const roles = JSON.parse(user.roles);
        const token = generateToken({ id: user.id, username: user.username, roles });
        res.json({ token, id: user.id, username: user.username, roles, mustChangePassword: !!user.must_change_password });
    }));

    // Get current user
    app.get('/api/auth/me', asyncHandler((req, res) => {
        if (!req.user) throw new HttpError(401, 'Not authenticated');

        const user = db.prepare(
            'SELECT id, username, roles, must_change_password FROM users WHERE id = ?'
        ).get(req.user.id);
        if (!user) throw new HttpError(404, 'User not found');

        res.json({
            id: user.id,
            username: user.username,
            roles: JSON.parse(user.roles),
            mustChangePassword: !!user.must_change_password
        });
    }));

    // ========== Invite Token Routes ==========

    app.post('/api/invite', requireRole(['admin']), asyncHandler((req, res) => {
        const { roles = ['annotator'], maxUses = 0, expiresInDays = 0 } = req.body;
        const sanitized = sanitizeRoles(roles);
        const id = crypto.randomUUID();
        const token = crypto.randomUUID().replace(/-/g, '');
        const now = Date.now();
        const expiresAt = expiresInDays > 0 ? now + (expiresInDays * 24 * 60 * 60 * 1000) : null;

        db.prepare(`
            INSERT INTO invite_tokens (id, token, created_by, default_roles, max_uses, current_uses, expires_at, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?)
        `).run(id, token, req.user.id, JSON.stringify(sanitized), maxUses, expiresAt, now);

        res.status(201).json({ id, token, inviteUrl: `/signup?token=${token}`, roles: sanitized, maxUses, expiresAt, createdAt: now });
    }));

    app.get('/api/invite', requireRole(['admin']), asyncHandler((req, res) => {
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
    }));

    app.get('/api/invite/:token/validate', asyncHandler((req, res) => {
        const invite = db.prepare('SELECT * FROM invite_tokens WHERE token = ?').get(req.params.token);
        if (!invite) throw new HttpError(404, 'Invalid invite token');
        if (!invite.is_active) throw new HttpError(410, 'This invite link has been deactivated');
        if (invite.expires_at && Date.now() > invite.expires_at) throw new HttpError(410, 'This invite link has expired');
        if (invite.max_uses > 0 && invite.current_uses >= invite.max_uses) throw new HttpError(410, 'This invite link has reached its maximum uses');
        res.json({ valid: true, roles: JSON.parse(invite.default_roles) });
    }));

    app.post('/api/auth/signup', signupLimiter, asyncHandler(async (req, res) => {
        const { username, password, token } = req.body;
        if (!username || !password || !token) throw new HttpError(400, 'Username, password, and invite token are required');
        if (!isValidPassword(password)) throw new HttpError(400, 'Password must be at least 5 characters');

        const invite = db.prepare('SELECT * FROM invite_tokens WHERE token = ?').get(token);
        if (!invite) throw new HttpError(404, 'Invalid invite token');
        if (!invite.is_active) throw new HttpError(410, 'This invite link has been deactivated');
        if (invite.expires_at && Date.now() > invite.expires_at) throw new HttpError(410, 'This invite link has expired');
        if (invite.max_uses > 0 && invite.current_uses >= invite.max_uses) throw new HttpError(410, 'This invite link has reached its maximum uses');

        if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
            throw new HttpError(409, 'Username already exists');
        }

        const userId = crypto.randomUUID();
        const now = Date.now();
        const roles = JSON.parse(invite.default_roles);

        db.prepare(`
            INSERT INTO users (id, username, password, roles, must_change_password, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, ?, ?)
        `).run(userId, username, await bcrypt.hash(password, BCRYPT_ROUNDS), invite.default_roles, now, now);

        db.prepare('UPDATE invite_tokens SET current_uses = current_uses + 1 WHERE id = ?').run(invite.id);

        createDemoProject(db, userId, username, roles);

        const jwtToken = generateToken({ id: userId, username, roles });
        res.status(201).json({ token: jwtToken, id: userId, username, roles, mustChangePassword: false });
    }));

    app.patch('/api/invite/:id', requireRole(['admin']), asyncHandler((req, res) => {
        const { isActive } = req.body;
        const result = db.prepare('UPDATE invite_tokens SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, req.params.id);
        if (result.changes === 0) throw new HttpError(404, 'Invite token not found');
        res.json({ success: true, isActive });
    }));

    app.delete('/api/invite/:id', requireRole(['admin']), asyncHandler((req, res) => {
        const result = db.prepare('DELETE FROM invite_tokens WHERE id = ?').run(req.params.id);
        if (result.changes === 0) throw new HttpError(404, 'Invite token not found');
        res.json({ success: true });
    }));
}

export default { registerUserRoutes };
