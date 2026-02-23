const db = require('../config/database');

function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

const getShiftReport = async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'start and end query params are required' });
    }

    const [rows] = await db.query(
      `SELECT
         COALESCE(s.shift_code, 'UNASSIGNED') AS shift,
         SUM(CASE WHEN ts.status_code IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved,
         ROUND(AVG(TIMESTAMPDIFF(MINUTE, t.created_at, COALESCE(t.resolved_at, NOW()))), 0) AS avgResolutionMinutes
       FROM tickets t
       LEFT JOIN users u ON u.id = t.assigned_to_user_id
       LEFT JOIN shifts s ON s.id = u.shift_id
       INNER JOIN ticket_statuses ts ON ts.id = t.status_id
       WHERE t.is_deleted = 0
         AND DATE(t.created_at) BETWEEN ? AND ?
       GROUP BY COALESCE(s.shift_code, 'UNASSIGNED')
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
         SUM(CASE WHEN ts.status_code IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS resolved,
         ROUND(
           CASE WHEN COUNT(t.id) = 0 THEN 0
           ELSE (SUM(CASE WHEN ts.status_code IN ('resolved', 'closed') THEN 1 ELSE 0 END) * 100.0 / COUNT(t.id))
           END,
           0
         ) AS slaCompliance
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       LEFT JOIN tickets t
         ON t.assigned_to_user_id = u.id
        AND t.is_deleted = 0
        AND DATE(t.created_at) BETWEEN ? AND ?
       LEFT JOIN ticket_statuses ts ON ts.id = t.status_id
       WHERE u.is_deleted = 0
         AND u.is_active = 1
         AND r.code IN ('technician', 'admin')
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

const getTicketActivity = async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, message: 'start and end query params are required' });
    }
    if (!isValidDateInput(start) || !isValidDateInput(end)) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const params = [start, end];

    const [createdRows] = await db.query(
      `SELECT DATE(t.created_at) AS day, COUNT(*) AS total
       FROM tickets t
       WHERE t.is_deleted = 0
         AND DATE(t.created_at) BETWEEN ? AND ?
       GROUP BY DATE(t.created_at)
       ORDER BY day ASC`,
      params
    );

    const [closedRows] = await db.query(
      `SELECT DATE(t.closed_at) AS day, COUNT(*) AS total
       FROM tickets t
       WHERE t.is_deleted = 0
         AND t.closed_at IS NOT NULL
         AND DATE(t.closed_at) BETWEEN ? AND ?
       GROUP BY DATE(t.closed_at)
       ORDER BY day ASC`,
      params
    );

    const [reopenedRows] = await db.query(
      `SELECT DATE(t.updated_at) AS day, COUNT(*) AS total
       FROM tickets t
       INNER JOIN ticket_statuses ts ON ts.id = t.status_id
       WHERE t.is_deleted = 0
         AND ts.status_code = 'reopened'
         AND DATE(t.updated_at) BETWEEN ? AND ?
       GROUP BY DATE(t.updated_at)
       ORDER BY day ASC`,
      params
    );

    const [overdueRows] = await db.query(
      `SELECT DATE(DATE_ADD(t.created_at, INTERVAL 3 DAY)) AS day, COUNT(*) AS total
       FROM tickets t
       INNER JOIN ticket_statuses ts ON ts.id = t.status_id
       WHERE t.is_deleted = 0
         AND ts.status_code NOT IN ('resolved', 'closed', 'deleted')
         AND DATE(DATE_ADD(t.created_at, INTERVAL 3 DAY)) BETWEEN ? AND ?
       GROUP BY DATE(DATE_ADD(t.created_at, INTERVAL 3 DAY))
       ORDER BY day ASC`,
      params
    );

    const [collabRows] = await db.query(
      `SELECT DATE(tc.created_at) AS day, COUNT(*) AS total
       FROM ticket_comments tc
       INNER JOIN tickets t ON t.id = tc.ticket_id
       WHERE t.is_deleted = 0
         AND DATE(tc.created_at) BETWEEN ? AND ?
       GROUP BY DATE(tc.created_at)
       ORDER BY day ASC`,
      params
    );

    return res.json({
      success: true,
      data: {
        start,
        end,
        series: {
          created: createdRows,
          closed: closedRows,
          reopened: reopenedRows,
          overdue: overdueRows,
          collab: collabRows,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching ticket activity report:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket activity report', error: error.message });
  }
};

module.exports = {
  getShiftReport,
  getTechnicianPerformance,
  getTicketActivity,
};
