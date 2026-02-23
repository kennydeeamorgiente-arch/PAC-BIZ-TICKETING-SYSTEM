require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

async function getId(table, codeColumn, code) {
  const [rows] = await db.query(`SELECT id FROM ${table} WHERE ${codeColumn} = ? LIMIT 1`, [code]);
  return rows.length ? rows[0].id : null;
}

async function run() {
  const roleId = await getId('roles', 'code', 'technician');
  const shiftId = await getId('shifts', 'shift_code', 'AM');

  if (!roleId) {
    throw new Error('Missing roles seed: technician');
  }

  const passwordHash = await bcrypt.hash('admin123', 10);

  await db.query(
    `INSERT INTO users (username, email, password_hash, auth_provider, full_name, role_id, shift_id, is_active, is_deleted)
     VALUES (?, ?, ?, 'local', ?, ?, ?, 1, 0)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       full_name = VALUES(full_name),
       role_id = VALUES(role_id),
       shift_id = VALUES(shift_id),
       is_active = 1,
       is_deleted = 0,
       updated_at = CURRENT_TIMESTAMP`,
    ['admin', 'admin@company.com', passwordHash, 'System Administrator', roleId, shiftId]
  );

  console.log('V2 admin ensured: admin@company.com / admin123');
  process.exit(0);
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
