const bcrypt = require('bcryptjs');
const db = require('../config/database');

const getUsers = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, username, email, full_name, role, shift_type, is_active, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `);

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch users', error: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, email, full_name, role = 'user', shift_type = null, password = 'admin123' } = req.body;

    if (!username || !email || !full_name) {
      return res.status(400).json({ success: false, message: 'username, email, and full_name are required' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, shift_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, email, password_hash, full_name, role, shift_type]
    );

    const [rows] = await db.query(
      `SELECT id, username, email, full_name, role, shift_type, is_active, created_at, updated_at
       FROM users WHERE id = ?`,
      [result.insertId]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ success: false, message: 'Failed to create user', error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const allowed = ['username', 'email', 'full_name', 'role', 'shift_type', 'is_active'];
    const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));

    if (!id || entries.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);

    await db.query(`UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = ?`, [...values, id]);

    const [rows] = await db.query(
      `SELECT id, username, email, full_name, role, shift_type, is_active, created_at, updated_at
       FROM users WHERE id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ success: false, message: 'Failed to update user', error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    await db.query('UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
    return res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete user', error: error.message });
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
};
