const db = require('../config/database');

const getShiftReport = async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'start and end query params are required' });
    }

    const [rows] = await db.query(
      `SELECT
         COALESCE(u.shift_type, 'AM') AS shift,
         SUM(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved,
         ROUND(AVG(TIMESTAMPDIFF(MINUTE, t.created_at, COALESCE(t.resolved_at, NOW()))), 0) AS avgResolutionMinutes
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE DATE(t.created_at) BETWEEN ? AND ?
       GROUP BY COALESCE(u.shift_type, 'AM')
       ORDER BY shift ASC`,
      [start, end]
    );

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching shift report:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch shift report', error: error.message });
  }
};

const getTechnicianPerformance = async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'start and end query params are required' });
    }

    const [rows] = await db.query(
      `SELECT
         u.full_name AS name,
         SUM(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved,
         ROUND(
           CASE WHEN COUNT(t.id) = 0 THEN 0
           ELSE (SUM(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE 0 END) * 100.0 / COUNT(t.id))
           END,
           0
         ) AS slaCompliance
       FROM users u
       LEFT JOIN tickets t
         ON t.assigned_to = u.id
        AND DATE(t.created_at) BETWEEN ? AND ?
       WHERE u.role IN ('agent', 'admin')
       GROUP BY u.id, u.full_name
       ORDER BY resolved DESC, u.full_name ASC`,
      [start, end]
    );

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching technician performance:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch technician performance', error: error.message });
  }
};

module.exports = {
  getShiftReport,
  getTechnicianPerformance,
};
