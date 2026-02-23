const db = require('../config/database');

const getShifts = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, shift_code AS shift_name, shift_code, display_name, start_time, end_time
      FROM shifts
      WHERE is_active = 1
      ORDER BY id ASC
    `);
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching shifts:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch shifts', error: error.message });
  }
};

const updateShift = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { start_time, end_time } = req.body;

    if (!id || !start_time || !end_time) {
      return res.status(400).json({ success: false, message: 'id, start_time, end_time are required' });
    }

    await db.query('UPDATE shifts SET start_time = ?, end_time = ? WHERE id = ?', [start_time, end_time, id]);

    const [rows] = await db.query(
      'SELECT id, shift_code AS shift_name, shift_code, display_name, start_time, end_time FROM shifts WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shift not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error updating shift:', error);
    return res.status(500).json({ success: false, message: 'Failed to update shift', error: error.message });
  }
};

module.exports = {
  getShifts,
  updateShift,
};
