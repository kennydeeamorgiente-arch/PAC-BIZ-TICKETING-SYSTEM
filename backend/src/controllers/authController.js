const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

let avatarColumnAvailable = null;

async function supportsAvatarColumn() {
    if (avatarColumnAvailable !== null) return avatarColumnAvailable;
    try {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS total
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'users'
               AND COLUMN_NAME = 'avatar_data'`
        );
        avatarColumnAvailable = Number(rows?.[0]?.total || 0) > 0;
    } catch {
        avatarColumnAvailable = false;
    }
    return avatarColumnAvailable;
}

function buildAuthUser(row) {
    return {
        id: row.id,
        email: row.email,
        name: row.full_name,
        role: row.role,
        shift_type: row.shift_type,
        avatar_data: row.avatar_data || null,
    };
}

function signToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
        },
        process.env.JWT_SECRET || 'dev_secret_change_me',
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
}

async function fetchUserByEmail(email) {
    const hasAvatar = await supportsAvatarColumn();
    const avatarSelect = hasAvatar ? 'u.avatar_data' : 'NULL AS avatar_data';
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.email, u.full_name, r.code AS role, s.shift_code AS shift_type, ${avatarSelect},
                    u.password_hash, u.is_active, u.is_deleted
             FROM users u
             INNER JOIN roles r ON r.id = u.role_id
             LEFT JOIN shifts s ON s.id = u.shift_id
             WHERE u.email = ?
             LIMIT 1`,
            [email]
        );
        return rows;
    } catch (error) {
        if (error?.code !== 'ER_BAD_FIELD_ERROR' && error?.code !== 'ER_NO_SUCH_TABLE') {
            throw error;
        }

        const [legacyRows] = await db.query(
            `SELECT id, email, full_name, role, shift_type, NULL AS avatar_data, password_hash, is_active,
                    0 AS is_deleted
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );
        return legacyRows;
    }
}

async function fetchUserById(id) {
    const hasAvatar = await supportsAvatarColumn();
    const avatarSelect = hasAvatar ? 'u.avatar_data' : 'NULL AS avatar_data';
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.email, u.full_name, r.code AS role, s.shift_code AS shift_type, ${avatarSelect},
                    u.is_active, u.is_deleted
             FROM users u
             INNER JOIN roles r ON r.id = u.role_id
             LEFT JOIN shifts s ON s.id = u.shift_id
             WHERE u.id = ?
             LIMIT 1`,
            [id]
        );
        return rows;
    } catch (error) {
        if (error?.code !== 'ER_BAD_FIELD_ERROR' && error?.code !== 'ER_NO_SUCH_TABLE') {
            throw error;
        }

        const [legacyRows] = await db.query(
            `SELECT id, email, full_name, role, shift_type, NULL AS avatar_data, is_active, 0 AS is_deleted
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [id]
        );
        return legacyRows;
    }
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const rows = await fetchUserByEmail(email);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const userRow = rows[0];
        if (userRow.is_active === 0 || userRow.is_deleted === 1) {
            return res.status(403).json({ success: false, message: 'User is inactive' });
        }

        if (!userRow.password_hash) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, userRow.password_hash);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const user = buildAuthUser(userRow);
        const token = signToken(user);

        return res.json({ success: true, token, user });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ success: false, message: 'Login failed', error: error.message });
    }
};

const getMe = async (req, res) => {
    try {
        const rows = await fetchUserById(req.user.id);

        if (rows.length === 0 || rows[0].is_active === 0 || rows[0].is_deleted === 1) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const user = buildAuthUser(rows[0]);
        return res.json(user);
    } catch (error) {
        console.error('Get me error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch user', error: error.message });
    }
};

module.exports = {
    login,
    getMe,
};
