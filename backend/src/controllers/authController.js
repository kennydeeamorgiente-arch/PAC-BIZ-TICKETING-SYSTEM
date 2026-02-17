const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

function buildAuthUser(row) {
    return {
        id: row.id,
        email: row.email,
        name: row.full_name,
        role: row.role,
        shift_type: row.shift_type,
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

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const [rows] = await db.query(
            `SELECT id, email, full_name, role, shift_type, password_hash, is_active
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const userRow = rows[0];
        if (userRow.is_active === 0) {
            return res.status(403).json({ success: false, message: 'User is inactive' });
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
        const [rows] = await db.query(
            `SELECT id, email, full_name, role, shift_type, is_active
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [req.user.id]
        );

        if (rows.length === 0 || rows[0].is_active === 0) {
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
