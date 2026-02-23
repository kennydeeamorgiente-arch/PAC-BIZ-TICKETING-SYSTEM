const bcrypt = require('bcryptjs');
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

async function getRoleIdByCode(roleCode) {
  const [rows] = await db.query('SELECT id FROM roles WHERE code = ? LIMIT 1', [roleCode]);
  return rows.length ? rows[0].id : null;
}

async function getShiftIdByCode(shiftCode) {
  if (!shiftCode) return null;
  const [rows] = await db.query('SELECT id FROM shifts WHERE shift_code = ? LIMIT 1', [shiftCode]);
  return rows.length ? rows[0].id : null;
}

async function selectUserById(id) {
  const hasAvatar = await supportsAvatarColumn();
  const avatarSelect = hasAvatar ? 'u.avatar_data' : 'NULL AS avatar_data';
  const [rows] = await db.query(
    `SELECT u.id, u.username, u.email, u.full_name, r.code AS role, s.shift_code AS shift_type, ${avatarSelect},
            u.is_active, u.created_at, u.updated_at
     FROM users u
     INNER JOIN roles r ON r.id = u.role_id
     LEFT JOIN shifts s ON s.id = u.shift_id
     WHERE u.id = ? AND u.is_deleted = 0`,
    [id]
  );
  return rows.length ? rows[0] : null;
}

const getUsers = async (req, res) => {
  try {
    const hasAvatar = await supportsAvatarColumn();
    const avatarSelect = hasAvatar ? 'u.avatar_data' : 'NULL AS avatar_data';
    const [rows] = await db.query(`
      SELECT u.id, u.username, u.email, u.full_name, r.code AS role, s.shift_code AS shift_type, ${avatarSelect},
             u.is_active, u.created_at, u.updated_at
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      LEFT JOIN shifts s ON s.id = u.shift_id
      WHERE u.is_deleted = 0
      ORDER BY u.created_at DESC
    `);

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch users', error: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, email, full_name, role = 'technician', shift_type = null, password = 'admin123' } = req.body;

    if (!username || !email || !full_name) {
      return res.status(400).json({ success: false, message: 'username, email, and full_name are required' });
    }

    const roleId = await getRoleIdByCode(role);
    if (!roleId) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const shiftId = await getShiftIdByCode(shift_type);
    if (shift_type && !shiftId) {
      return res.status(400).json({ success: false, message: 'Invalid shift_type' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, role_id, shift_id, auth_provider)
       VALUES (?, ?, ?, ?, ?, ?, 'local')`,
      [username, email, password_hash, full_name, roleId, shiftId]
    );

    const created = await selectUserById(result.insertId);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ success: false, message: 'Failed to create user', error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(req.body, 'username')) {
      updates.push('username = ?');
      values.push(req.body.username);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      updates.push('email = ?');
      values.push(req.body.email);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'full_name')) {
      updates.push('full_name = ?');
      values.push(req.body.full_name);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'avatar_data')) {
      const hasAvatar = await supportsAvatarColumn();
      if (hasAvatar) {
        const avatarData = req.body.avatar_data || null;
        if (avatarData && (!String(avatarData).startsWith('data:image/') || String(avatarData).length > 2_000_000)) {
          return res.status(400).json({ success: false, message: 'Invalid avatar_data format or size' });
        }
        updates.push('avatar_data = ?');
        values.push(avatarData);
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
      updates.push('is_active = ?');
      values.push(req.body.is_active ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'role')) {
      const roleId = await getRoleIdByCode(req.body.role);
      if (!roleId) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      updates.push('role_id = ?');
      values.push(roleId);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'shift_type')) {
      const shiftId = await getShiftIdByCode(req.body.shift_type);
      if (req.body.shift_type && !shiftId) {
        return res.status(400).json({ success: false, message: 'Invalid shift_type' });
      }
      updates.push('shift_id = ?');
      values.push(shiftId);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    await db.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, [...values, id]);

    const updated = await selectUserById(id);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, data: updated });
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

    await db.query('UPDATE users SET is_active = 0, is_deleted = 1, updated_at = NOW() WHERE id = ?', [id]);
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
