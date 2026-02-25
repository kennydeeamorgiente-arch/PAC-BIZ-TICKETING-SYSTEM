const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/database');
const { trackSLAEvent, getSLAStatus } = require('../services/slaService');
const { sendTicketReply } = require('../services/gmailService');
const { logAudit, addSystemActivityComment } = require('../services/auditService');
const { notifyUsers } = require('../services/notificationService');
const { renderTemplate } = require('../services/emailTemplateService');
const { getReportSettings } = require('../services/appConfigService');
const { getStatusModelResponse, getAllowedStatuses, canTransition } = require('../constants/ticketStatusModel');
const {
  decideTicketPriority,
  getPriorityId,
  recordPriorityInference,
  recordPriorityHistory,
  getLatestPriorityInference,
  getPriorityHistory,
} = require('../services/priorityDecisionService');

const ALLOWED_STATUSES = getAllowedStatuses();

const DEFAULT_TICKET_LOCK_MINUTES = 10;
let ticketLockColumnsAvailable = null;

function buildTicketSelect(overdueDays = 3) {
  const safeOverdueDays = Math.max(1, Math.min(30, Number(overdueDays || 3)));
  return `
  SELECT t.id,
         t.ticket_number,
         t.subject AS title,
         t.description,
         ts.status_code AS status,
         CASE
           WHEN ts.status_code = 'new' THEN 'new'
           WHEN ts.status_code IN ('open', 'in_progress', 'reopened') THEN 'active'
           ELSE 'complete'
         END AS status_list,
         tp.priority_code AS priority,
         tc.category_code AS category,
         t.created_by_user_id AS created_by,
         t.assigned_to_user_id AS assigned_to,
         t.status_id,
         t.priority_id,
         creator.full_name AS created_by_name,
         assignee.full_name AS assigned_to_name,
         requester.email AS requester_email,
         requester.full_name AS requester_name,
         t.email_thread_id,
         t.first_response_at,
         t.resolved_at,
         t.closed_at,
         DATE_ADD(t.created_at, INTERVAL ${safeOverdueDays} DAY) AS overdue_after_at,
         CASE
           WHEN ts.status_code NOT IN ('resolved', 'closed', 'deleted')
             AND t.created_at < DATE_SUB(NOW(), INTERVAL ${safeOverdueDays} DAY)
           THEN 1
           ELSE 0
         END AS is_overdue,
         CASE
           WHEN ts.status_code NOT IN ('resolved', 'closed', 'deleted')
             AND t.created_at < DATE_SUB(NOW(), INTERVAL ${safeOverdueDays} DAY)
           THEN 1
           ELSE 0
         END AS sla_breach,
         GREATEST(TIMESTAMPDIFF(DAY, t.created_at, NOW()), 0) AS age_days,
         t.created_at,
         t.updated_at,
         t.is_deleted
  FROM tickets t
  INNER JOIN ticket_statuses ts ON ts.id = t.status_id
  INNER JOIN ticket_priorities tp ON tp.id = t.priority_id
  LEFT JOIN ticket_categories tc ON tc.id = t.category_id
  LEFT JOIN users creator ON creator.id = t.created_by_user_id
  LEFT JOIN users assignee ON assignee.id = t.assigned_to_user_id
  LEFT JOIN users requester ON requester.id = t.requester_user_id
`;
}

function isOpsRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  return ['technician', 'admin', 'agent'].includes(normalized);
}

function clampLockMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return DEFAULT_TICKET_LOCK_MINUTES;
  return Math.max(1, Math.min(60, Math.floor(minutes)));
}

async function supportsTicketLockColumns() {
  if (ticketLockColumnsAvailable !== null) return ticketLockColumnsAvailable;
  try {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'tickets'
         AND COLUMN_NAME IN ('locked_by_user_id', 'lock_expires_at', 'locked_at')`
    );
    ticketLockColumnsAvailable = Number(rows?.[0]?.total || 0) >= 3;
  } catch {
    ticketLockColumnsAvailable = false;
  }
  return ticketLockColumnsAvailable;
}

async function clearExpiredTicketLock(ticketId) {
  if (!(await supportsTicketLockColumns())) return;
  await db.query(
    `UPDATE tickets
     SET locked_by_user_id = NULL,
         locked_at = NULL,
         lock_expires_at = NULL,
         updated_at = updated_at
     WHERE id = ?
       AND lock_expires_at IS NOT NULL
       AND lock_expires_at <= NOW()`,
    [ticketId]
  );
}

async function fetchTicketLock(ticketId) {
  if (!(await supportsTicketLockColumns())) {
    return {
      is_locked: false,
      locked_by_user_id: null,
      locked_by_name: null,
      locked_at: null,
      lock_expires_at: null,
    };
  }
  const [rows] = await db.query(
    `SELECT t.locked_by_user_id,
            t.locked_at,
            t.lock_expires_at,
            u.full_name AS locked_by_name
     FROM tickets t
     LEFT JOIN users u ON u.id = t.locked_by_user_id
     WHERE t.id = ?
       AND t.is_deleted = 0
     LIMIT 1`,
    [ticketId]
  );

  if (!rows.length) return null;

  const row = rows[0];
  const expiresAt = row.lock_expires_at ? new Date(row.lock_expires_at).getTime() : 0;
  const isLocked = Boolean(row.locked_by_user_id) && expiresAt > Date.now();

  return {
    is_locked: isLocked,
    locked_by_user_id: row.locked_by_user_id ? Number(row.locked_by_user_id) : null,
    locked_by_name: row.locked_by_name || null,
    locked_at: row.locked_at || null,
    lock_expires_at: row.lock_expires_at || null,
  };
}

function stripHtml(input = '') {
  return String(input).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function safeFileName(name = '') {
  return String(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
}

function buildStoragePath(ticketId, originalName) {
  const ext = path.extname(originalName || '') || '.bin';
  const base = safeFileName(path.basename(originalName || `file${ext}`, ext));
  const unique = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  return {
    relativeDir: path.join('uploads', 'tickets', String(ticketId)),
    fileName: `${base || 'attachment'}_${unique}${ext}`,
  };
}

async function getLookupId(table, codeColumn, value, fallbackValue = null) {
  const code = String(value || fallbackValue || '').trim().toLowerCase();
  if (!code) return null;

  const [rows] = await db.query(
    `SELECT id FROM ${table} WHERE ${codeColumn} = ? LIMIT 1`,
    [code]
  );

  if (rows.length > 0) return rows[0].id;

  if (fallbackValue && code !== fallbackValue) {
    const [fallbackRows] = await db.query(
      `SELECT id FROM ${table} WHERE ${codeColumn} = ? LIMIT 1`,
      [fallbackValue]
    );
    return fallbackRows.length ? fallbackRows[0].id : null;
  }

  return null;
}

async function getStatusId(statusCode, fallback = 'open') {
  return getLookupId('ticket_statuses', 'status_code', statusCode, fallback);
}

async function fetchTicketById(ticketId) {
  const settings = await getReportSettings();
  const ticketSelect = buildTicketSelect(settings.overdueDays);
  const [rows] = await db.query(`${ticketSelect} WHERE t.id = ? AND t.is_deleted = 0`, [ticketId]);
  return rows.length > 0 ? rows[0] : null;
}

async function fetchTicketAttachmentsByCommentIds(commentIds) {
  if (!commentIds.length) return [];

  const placeholders = commentIds.map(() => '?').join(', ');
  const [rows] = await db.query(
    `SELECT id, ticket_id, comment_id, original_file_name, mime_type, file_size_bytes, storage_key, created_at
     FROM ticket_attachments
     WHERE comment_id IN (${placeholders})
     ORDER BY created_at ASC`,
    commentIds
  );

  return rows.map((a) => ({
    ...a,
    public_url: `/${String(a.storage_key).replaceAll('\\\\', '/').replaceAll('\\', '/')}`,
  }));
}

async function getOpsUserIds(excludeUserId = null) {
  const [rows] = await db.query(
    `SELECT u.id
     FROM users u
     INNER JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = 1
       AND u.is_deleted = 0
       AND r.code IN ('technician', 'admin')`
  );

  return rows
    .map((r) => Number(r.id))
    .filter((id) => id && id !== Number(excludeUserId || 0));
}

async function insertStatusHistory(ticketId, fromStatusId, toStatusId, changedByUserId, note = null) {
  await db.query(
    `INSERT INTO ticket_status_history (ticket_id, from_status_id, to_status_id, changed_by_user_id, note)
     VALUES (?, ?, ?, ?, ?)`,
    [ticketId, fromStatusId, toStatusId, changedByUserId || null, note]
  );
}

async function saveAttachments({ ticketId, commentId, uploadedByUserId, attachments }) {
  const saved = [];

  for (const attachment of attachments) {
    const fileName = attachment?.file_name || attachment?.original_file_name || 'attachment.bin';
    const mimeType = attachment?.mime_type || 'application/octet-stream';
    const base64 = String(attachment?.content_base64 || '').trim();
    if (!base64) continue;

    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) continue;
    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error('Attachment size exceeds 10MB limit');
    }

    const { relativeDir, fileName: finalFileName } = buildStoragePath(ticketId, fileName);
    const absoluteDir = path.join(__dirname, '..', '..', relativeDir);
    fs.mkdirSync(absoluteDir, { recursive: true });

    const absolutePath = path.join(absoluteDir, finalFileName);
    const storageKey = path.join(relativeDir, finalFileName);
    fs.writeFileSync(absolutePath, buffer);

    const [result] = await db.query(
      `INSERT INTO ticket_attachments
         (ticket_id, comment_id, uploaded_by_user_id, original_file_name, mime_type, file_size_bytes, storage_provider, storage_key)
       VALUES (?, ?, ?, ?, ?, ?, 'local', ?)`,
      [ticketId, commentId, uploadedByUserId || null, fileName, mimeType, buffer.length, storageKey]
    );

    saved.push({
      id: result.insertId,
      ticket_id: ticketId,
      comment_id: commentId,
      original_file_name: fileName,
      mime_type: mimeType,
      file_size_bytes: buffer.length,
      storage_key: storageKey,
      public_url: `/${String(storageKey).replaceAll('\\\\', '/').replaceAll('\\', '/')}`,
    });
  }

  return saved;
}

function mapStatusToSlaEvent(status) {
  if (status === 'resolved') return 'resolved';
  if (status === 'open' || status === 'in_progress' || status === 'reopened') return 'resumed';
  if (status === 'closed') return 'paused';
  return null;
}

const getAllTickets = async (req, res) => {
  try {
    const settings = await getReportSettings();
    const ticketSelect = buildTicketSelect(settings.overdueDays);
    const [tickets] = await db.query(`${ticketSelect} WHERE t.is_deleted = 0 ORDER BY t.created_at DESC`);

    res.json({
      success: true,
      data: tickets,
      count: tickets.length,
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets', error: error.message });
  }
};

const getTicketStatusModel = async (req, res) => {
  return res.json({
    success: true,
    data: getStatusModelResponse(),
  });
};

const createTicket = async (req, res) => {
  try {
    const { title, description, priority, category, created_by, requester_user_id } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }

    const statusId = (await getStatusId('new')) || (await getStatusId('open'));
    const categoryId = await getLookupId('ticket_categories', 'category_code', category, 'general');
    const intakeChannelId =
      (await getLookupId('intake_channels', 'channel_code', 'it_portal')) ||
      (await getLookupId('intake_channels', 'channel_code', 'email'));

    const actorId = Number(created_by) || Number(req.user?.id) || null;
    const requesterId = Number(requester_user_id) || actorId;

    if (!actorId || !requesterId) {
      return res.status(400).json({ success: false, message: 'created_by user is required' });
    }

    const priorityDecision = await decideTicketPriority({
      subject: String(title).trim(),
      bodyText: description || '',
      explicitPriorityCode: priority || null,
      intakeSource: 'portal',
    });

    const priorityId = await getPriorityId(priorityDecision.appliedPriorityCode, 'medium');

    if (!statusId || !priorityId || !intakeChannelId) {
      return res.status(500).json({ success: false, message: 'Required lookup values are missing in DB seeds' });
    }

    const ticketNumber = `TKT-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

    const [result] = await db.query(
      `INSERT INTO tickets (
         ticket_number, subject, description,
         requester_user_id, created_by_user_id,
         category_id, priority_id, status_id, intake_channel_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ticketNumber,
        String(title).trim(),
        description || null,
        requesterId,
        actorId,
        categoryId,
        priorityId,
        statusId,
        intakeChannelId,
      ]
    );

    const createdTicket = await fetchTicketById(result.insertId);

    let inferenceId = null;
    try {
      inferenceId = await recordPriorityInference({
        ticketId: result.insertId,
        decision: priorityDecision,
        actorUserId: actorId,
      });

      await recordPriorityHistory({
        ticketId: result.insertId,
        oldPriorityId: null,
        newPriorityId: priorityId,
        changedByUserId: actorId,
        changeSource: priority ? 'create' : 'rule_engine',
        reason: priorityDecision.reason,
        inferenceId,
      });
    } catch (priorityLogError) {
      console.warn('Priority logging skipped:', priorityLogError.message || priorityLogError);
    }

    await addSystemActivityComment(result.insertId, `Ticket created by user #${actorId}`);
    await addSystemActivityComment(
      result.insertId,
      `Priority decision: predicted=${priorityDecision.predictedPriorityCode}, applied=${priorityDecision.appliedPriorityCode}, confidence=${priorityDecision.confidence}`
    );

    await logAudit({
      actorUserId: req.user?.id || actorId,
      entityType: 'tickets',
      entityId: result.insertId,
      action: 'create',
      newValues: { title: createdTicket?.title, status: createdTicket?.status, priority: createdTicket?.priority },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const opsUserIds = await getOpsUserIds(actorId);
    await notifyUsers(opsUserIds, {
      typeCode: 'ticket_created',
      title: `New ticket ${ticketNumber}`,
      message: createdTicket?.title || 'New ticket created',
      ticketId: result.insertId,
      payload: { ticket_number: ticketNumber, status: createdTicket?.status, priority: createdTicket?.priority },
      priority: createdTicket?.priority === 'critical' ? 'high' : 'normal',
    });

    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: {
        ...createdTicket,
        priority_decision: {
          predicted_priority: priorityDecision.predictedPriorityCode,
          applied_priority: priorityDecision.appliedPriorityCode,
          confidence: priorityDecision.confidence,
          needs_review: priorityDecision.needsReview,
          reason: priorityDecision.reason,
          inference_id: inferenceId,
        },
      },
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to create ticket', error: error.message });
  }
};

const getTicketById = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    return res.json({ success: true, data: ticket });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket', error: error.message });
  }
};

const updateTicketPriority = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const nextPriorityCode = String(req.body?.priority || '').trim().toLowerCase();
    const reason = String(req.body?.reason || 'Manual priority update').slice(0, 500);

    if (!nextPriorityCode) {
      return res.status(400).json({ success: false, message: 'priority is required' });
    }

    const ticket = await fetchTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const newPriorityId = await getPriorityId(nextPriorityCode, null);
    if (!newPriorityId) {
      return res.status(400).json({ success: false, message: 'Invalid priority value' });
    }

    if (Number(ticket.priority_id) === Number(newPriorityId)) {
      return res.json({ success: true, message: 'Priority unchanged' });
    }

    await db.query(
      `UPDATE tickets
       SET priority_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [newPriorityId, ticketId]
    );

    try {
      await recordPriorityHistory({
        ticketId,
        oldPriorityId: ticket.priority_id || null,
        newPriorityId,
        changedByUserId: req.user?.id || null,
        changeSource: 'manual',
        reason,
        inferenceId: null,
      });
    } catch (priorityLogError) {
      console.warn('Priority history log skipped:', priorityLogError.message || priorityLogError);
    }

    await addSystemActivityComment(ticketId, `Priority changed from ${ticket.priority} to ${nextPriorityCode} by user #${req.user?.id || 'system'}`);

    await logAudit({
      actorUserId: req.user?.id || null,
      entityType: 'tickets',
      entityId: ticketId,
      action: 'priority_change',
      oldValues: { priority: ticket.priority },
      newValues: { priority: nextPriorityCode, reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const updated = await fetchTicketById(ticketId);
    return res.json({ success: true, message: 'Ticket priority updated', data: updated });
  } catch (error) {
    console.error('Error updating priority:', error);
    return res.status(500).json({ success: false, message: 'Failed to update priority', error: error.message });
  }
};

const getTicketPriorityInsights = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const [latestInference, history] = await Promise.all([
      getLatestPriorityInference(ticketId),
      getPriorityHistory(ticketId),
    ]);

    return res.json({
      success: true,
      data: {
        ticket_id: ticketId,
        current_priority: ticket.priority,
        latest_inference: latestInference,
        history,
      },
    });
  } catch (error) {
    console.error('Error fetching ticket priority insights:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch priority insights', error: error.message });
  }
};

const reevaluateTicketPriority = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const decision = await decideTicketPriority({
      subject: ticket.title || '',
      bodyText: ticket.description || '',
      fromEmail: ticket.requester_email || null,
      explicitPriorityCode: null,
      intakeSource: ticket.email_thread_id ? 'email' : 'portal',
    });

    const nextPriorityId = await getPriorityId(decision.appliedPriorityCode, 'medium');
    if (!nextPriorityId) {
      return res.status(500).json({ success: false, message: 'Priority lookup missing' });
    }

    let changed = false;
    if (Number(ticket.priority_id) !== Number(nextPriorityId)) {
      await db.query(
        `UPDATE tickets
         SET priority_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [nextPriorityId, ticketId]
      );
      changed = true;
    }

    let inferenceId = null;
    try {
      inferenceId = await recordPriorityInference({
        ticketId,
        decision,
        actorUserId: req.user?.id || null,
      });

      if (changed) {
        await recordPriorityHistory({
          ticketId,
          oldPriorityId: ticket.priority_id || null,
          newPriorityId: nextPriorityId,
          changedByUserId: req.user?.id || null,
          changeSource: 'ai',
          reason: decision.reason || 'AI re-evaluation',
          inferenceId,
        });
      }
    } catch (priorityLogError) {
      console.warn('Priority re-evaluation logging skipped:', priorityLogError.message || priorityLogError);
    }

    await addSystemActivityComment(
      ticketId,
      `AI re-evaluated priority: predicted=${decision.predictedPriorityCode}, applied=${decision.appliedPriorityCode}, confidence=${Math.round(
        Number(decision.confidence || 0) * 100
      )}%`
    );

    await logAudit({
      actorUserId: req.user?.id || null,
      entityType: 'tickets',
      entityId: ticketId,
      action: 'priority_reevaluate',
      oldValues: { priority: ticket.priority },
      newValues: {
        priority: decision.appliedPriorityCode,
        predicted_priority: decision.predictedPriorityCode,
        confidence: decision.confidence,
        changed,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const updatedTicket = await fetchTicketById(ticketId);
    return res.json({
      success: true,
      message: changed ? 'Ticket priority re-evaluated and updated' : 'Ticket priority re-evaluated (no change)',
      data: {
        ticket: updatedTicket,
        decision: {
          mode: decision.mode,
          provider: decision.provider,
          model_name: decision.modelName,
          predicted_priority: decision.predictedPriorityCode,
          applied_priority: decision.appliedPriorityCode,
          confidence: decision.confidence,
          needs_review: decision.needsReview,
          reason: decision.reason,
          inference_id: inferenceId,
        },
      },
    });
  } catch (error) {
    console.error('Error re-evaluating ticket priority:', error);
    return res.status(500).json({ success: false, message: 'Failed to re-evaluate ticket priority', error: error.message });
  }
};

const updateTicketStatus = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const status = String(req.body?.status || '').toLowerCase();

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const ticket = await fetchTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (!canTransition(ticket.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${ticket.status} to ${status}`,
      });
    }

    const statusId = await getStatusId(status, status === 'reopened' ? 'in_progress' : 'open');
    if (!statusId) {
      return res.status(500).json({ success: false, message: 'Status lookup missing' });
    }

    await db.query(
      `UPDATE tickets
       SET status_id = ?,
           resolved_at = CASE
             WHEN ? = 'resolved' THEN NOW()
             WHEN ? IN ('reopened', 'in_progress', 'open') THEN NULL
             ELSE resolved_at
           END,
           closed_at = CASE
             WHEN ? = 'closed' THEN NOW()
             WHEN ? IN ('reopened', 'in_progress', 'open') THEN NULL
             ELSE closed_at
           END,
           updated_at = NOW()
       WHERE id = ?`,
      [statusId, status, status, status, status, ticketId]
    );

    await insertStatusHistory(ticketId, ticket.status_id || null, statusId, req.user?.id || null, `Status changed to ${status}`);
    await addSystemActivityComment(ticketId, `Status changed from ${ticket.status} to ${status} by user #${req.user?.id || 'system'}`);

    const slaEvent = mapStatusToSlaEvent(status);
    if (slaEvent) {
      await trackSLAEvent(ticketId, slaEvent, ticket.assigned_to || req.user?.id || null, `Status changed to ${status}`);
    }

    await logAudit({
      actorUserId: req.user?.id || null,
      entityType: 'tickets',
      entityId: ticketId,
      action: 'status_change',
      oldValues: { status: ticket.status },
      newValues: { status },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const notifyIds = [ticket.assigned_to, ticket.created_by].filter((id) => Number(id) !== Number(req.user?.id || 0));
    await notifyUsers(notifyIds, {
      typeCode: 'ticket_status_changed',
      title: `Ticket ${ticket.ticket_number} updated`,
      message: `Status changed to ${status.replaceAll('_', ' ')}`,
      ticketId,
      payload: { status },
      priority: status === 'resolved' || status === 'closed' ? 'normal' : 'high',
    });

    return res.json({ success: true, message: 'Ticket status updated' });
  } catch (error) {
    console.error('Error updating status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
};

const getTicketComments = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const [rows] = await db.query(
      `SELECT tc.id, tc.ticket_id, tc.comment_text, tc.is_internal, tc.created_at,
              tc.author_user_id AS created_by,
              u.full_name AS created_by_name
       FROM ticket_comments tc
       LEFT JOIN users u ON u.id = tc.author_user_id
       WHERE tc.ticket_id = ?
       ORDER BY tc.created_at ASC`,
      [ticketId]
    );

    const commentIds = rows.map((r) => r.id);
    const attachments = await fetchTicketAttachmentsByCommentIds(commentIds);

    const attachmentMap = new Map();
    for (const a of attachments) {
      if (!attachmentMap.has(a.comment_id)) attachmentMap.set(a.comment_id, []);
      attachmentMap.get(a.comment_id).push(a);
    }

    const data = rows.map((row) => ({
      ...row,
      attachments: attachmentMap.get(row.id) || [],
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch comments', error: error.message });
  }
};

const addTicketComment = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const { comment_text, is_internal = false, attachments = [], template_code, template_vars = {} } = req.body;

    const ticket = await fetchTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (!is_internal) {
      await clearExpiredTicketLock(ticketId);
      const lock = await fetchTicketLock(ticketId);
      const requesterId = Number(req.user?.id || 0);
      if (lock?.is_locked && Number(lock.locked_by_user_id || 0) !== requesterId) {
        return res.status(409).json({
          success: false,
          message: `Ticket is locked by ${lock.locked_by_name || 'another user'}.`,
          data: lock,
        });
      }
    }

    let finalCommentText = String(comment_text || '').trim();
    let emailSubject = `${ticket.ticket_number || `TKT-${ticketId}`} Ticket Update`;

    if (!finalCommentText && template_code) {
      const rendered = renderTemplate(template_code, {
        requester_name: ticket.requester_name || ticket.requester_email?.split('@')[0] || 'Requester',
        ticket_number: ticket.ticket_number || `TKT-${ticketId}`,
        status: ticket.status,
        ...template_vars,
      });
      if (!rendered) {
        return res.status(400).json({ success: false, message: 'Invalid template_code' });
      }
      finalCommentText = rendered.body;
      emailSubject = rendered.subject;
    }

    const cleanLength = stripHtml(finalCommentText).length;
    if (!cleanLength) {
      return res.status(400).json({ success: false, message: 'comment_text is required' });
    }

    if (cleanLength > 5000) {
      return res.status(400).json({ success: false, message: 'Comment too long (max 5000 chars)' });
    }

    if (!Array.isArray(attachments)) {
      return res.status(400).json({ success: false, message: 'attachments must be an array' });
    }

    if (attachments.length > 5) {
      return res.status(400).json({ success: false, message: 'Maximum 5 attachments per comment' });
    }

    const [result] = await db.query(
      `INSERT INTO ticket_comments (ticket_id, comment_text, is_internal, author_user_id)
       VALUES (?, ?, ?, ?)`,
      [ticketId, finalCommentText, is_internal ? 1 : 0, req.user?.id || null]
    );

    const savedAttachments = await saveAttachments({
      ticketId,
      commentId: result.insertId,
      uploadedByUserId: req.user?.id || null,
      attachments,
    });

    const [rows] = await db.query(
      `SELECT tc.id, tc.ticket_id, tc.comment_text, tc.is_internal, tc.created_at,
              tc.author_user_id AS created_by,
              u.full_name AS created_by_name
       FROM ticket_comments tc
       LEFT JOIN users u ON u.id = tc.author_user_id
       WHERE tc.id = ?`,
      [result.insertId]
    );

    if (!ticket.first_response_at) {
      await db.query(`UPDATE tickets SET first_response_at = NOW(), updated_at = NOW() WHERE id = ?`, [ticketId]);
    }

    await logAudit({
      actorUserId: req.user?.id || null,
      entityType: 'tickets',
      entityId: ticketId,
      action: 'comment_add',
      newValues: { is_internal: Boolean(is_internal), attachments: savedAttachments.length },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!is_internal) {
      await sendTicketReply({
        toEmail: ticket.requester_email,
        ticketNumber: ticket.ticket_number || `TKT-${ticketId}`,
        subject: emailSubject,
        commentText: stripHtml(finalCommentText),
        threadId: ticket.email_thread_id || null,
      });
    }

    if (!is_internal && Number(req.user?.id || 0)) {
      await db.query(
        `UPDATE tickets
         SET locked_by_user_id = NULL,
             locked_at = NULL,
             lock_expires_at = NULL,
             updated_at = updated_at
         WHERE id = ?
           AND locked_by_user_id = ?`,
        [ticketId, req.user.id]
      );
    }

    const notifyIds = [ticket.assigned_to, ticket.created_by].filter((id) => Number(id) !== Number(req.user?.id || 0));
    await notifyUsers(notifyIds, {
      typeCode: 'ticket_comment_added',
      title: `New comment on ${ticket.ticket_number}`,
      message: stripHtml(finalCommentText).slice(0, 140),
      ticketId,
      payload: { is_internal: Boolean(is_internal), attachments: savedAttachments.length },
      priority: is_internal ? 'normal' : 'high',
    });

    return res.status(201).json({
      success: true,
      data: {
        ...rows[0],
        attachments: savedAttachments,
      },
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ success: false, message: 'Failed to add comment', error: error.message });
  }
};

const getTicketLock = async (req, res) => {
  try {
    if (!isOpsRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (!(await supportsTicketLockColumns())) {
      return res.json({
        success: true,
        data: { is_locked: false, locked_by_user_id: null, locked_by_name: null, locked_at: null, lock_expires_at: null },
      });
    }

    await clearExpiredTicketLock(ticketId);
    const lock = await fetchTicketLock(ticketId);
    return res.json({ success: true, data: lock });
  } catch (error) {
    console.error('Error fetching ticket lock:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket lock', error: error.message });
  }
};

const lockTicket = async (req, res) => {
  try {
    if (!isOpsRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (!(await supportsTicketLockColumns())) {
      return res.status(501).json({
        success: false,
        message: 'Ticket locking is not enabled in the database schema.',
      });
    }

    const requesterId = Number(req.user?.id || 0);
    if (!requesterId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const minutes = clampLockMinutes(req.body?.minutes);
    await clearExpiredTicketLock(ticketId);

    const [result] = await db.query(
      `UPDATE tickets
       SET locked_by_user_id = ?,
           locked_at = NOW(),
           lock_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
           updated_at = updated_at
       WHERE id = ?
         AND is_deleted = 0
         AND (lock_expires_at IS NULL OR lock_expires_at <= NOW() OR locked_by_user_id = ?)`,
      [requesterId, minutes, ticketId, requesterId]
    );

    if (!result.affectedRows) {
      const lock = await fetchTicketLock(ticketId);
      return res.status(409).json({
        success: false,
        message: `Ticket is locked by ${lock?.locked_by_name || 'another user'}.`,
        data: lock,
      });
    }

    const lock = await fetchTicketLock(ticketId);
    return res.json({ success: true, data: lock });
  } catch (error) {
    console.error('Error locking ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to lock ticket', error: error.message });
  }
};

const unlockTicket = async (req, res) => {
  try {
    if (!isOpsRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (!(await supportsTicketLockColumns())) {
      return res.status(501).json({
        success: false,
        message: 'Ticket locking is not enabled in the database schema.',
      });
    }

    const requesterId = Number(req.user?.id || 0);
    if (!requesterId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const [result] = await db.query(
      `UPDATE tickets
       SET locked_by_user_id = NULL,
           locked_at = NULL,
           lock_expires_at = NULL,
           updated_at = updated_at
       WHERE id = ?
         AND is_deleted = 0
         AND locked_by_user_id = ?`,
      [ticketId, requesterId]
    );

    if (!result.affectedRows) {
      await clearExpiredTicketLock(ticketId);
      const lock = await fetchTicketLock(ticketId);
      if (lock?.is_locked) {
        return res.status(409).json({
          success: false,
          message: `Ticket is locked by ${lock.locked_by_name || 'another user'}.`,
          data: lock,
        });
      }
    }

    const lock = await fetchTicketLock(ticketId);
    return res.json({ success: true, data: lock });
  } catch (error) {
    console.error('Error unlocking ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to unlock ticket', error: error.message });
  }
};

const assignTicket = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const assignedTo = Number(req.body.assigned_to);

    if (!assignedTo) {
      return res.status(400).json({ success: false, message: 'assigned_to is required' });
    }

    const ticket = await fetchTicketById(ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const inProgressStatusId = await getStatusId('in_progress', 'open');
    await db.query(
      `UPDATE tickets
       SET assigned_to_user_id = ?, status_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [assignedTo, inProgressStatusId, ticketId]
    );

    await db.query(
      `INSERT INTO ticket_assignments (ticket_id, assigned_to_user_id, assigned_by_user_id, assigned_at, reason)
       VALUES (?, ?, ?, NOW(), ?)`,
      [ticketId, assignedTo, req.user?.id || null, 'Manual assignment']
    );

    await addSystemActivityComment(ticketId, `Ticket assigned to user #${assignedTo} by user #${req.user?.id || 'system'}`);
    await trackSLAEvent(ticketId, 'assigned', assignedTo, 'Ticket assigned to technician');

    await logAudit({
      actorUserId: req.user?.id || null,
      entityType: 'tickets',
      entityId: ticketId,
      action: 'assign',
      oldValues: { assigned_to: ticket.assigned_to },
      newValues: { assigned_to: assignedTo },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await notifyUsers([assignedTo], {
      typeCode: 'ticket_assigned',
      title: `Assigned: ${ticket.ticket_number}`,
      message: ticket.title,
      ticketId,
      payload: { assigned_to: assignedTo },
      priority: 'high',
    });

    return res.json({ success: true, message: 'Ticket assigned successfully' });
  } catch (error) {
    console.error('Error assigning ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to assign ticket', error: error.message });
  }
};

const pauseTicketSLA = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const technicianId = ticket.assigned_to || req.body.user_id || null;
    await trackSLAEvent(ticketId, 'paused', technicianId, 'Manual SLA pause');

    return res.json({ success: true, message: 'SLA timer paused' });
  } catch (error) {
    console.error('Error pausing SLA:', error);
    return res.status(500).json({ success: false, message: 'Failed to pause SLA timer', error: error.message });
  }
};

const resumeTicketSLA = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const technicianId = ticket.assigned_to || req.body.user_id || null;
    await trackSLAEvent(ticketId, 'resumed', technicianId, 'Manual SLA resume');

    return res.json({ success: true, message: 'SLA timer resumed' });
  } catch (error) {
    console.error('Error resuming SLA:', error);
    return res.status(500).json({ success: false, message: 'Failed to resume SLA timer', error: error.message });
  }
};

const respondToTicket = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    await db.query(
      `UPDATE tickets
       SET first_response_at = COALESCE(first_response_at, NOW()), updated_at = NOW()
       WHERE id = ?`,
      [ticketId]
    );

    await addSystemActivityComment(ticketId, `First response tracked by user #${req.user?.id || 'system'}`);

    const technicianId = ticket.assigned_to || req.body.user_id || null;
    await trackSLAEvent(ticketId, 'responded', technicianId, 'First response sent');

    return res.json({ success: true, message: 'Ticket response tracked' });
  } catch (error) {
    console.error('Error responding to ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to track response', error: error.message });
  }
};

const resolveTicket = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const resolvedStatusId = await getStatusId('resolved', 'open');
    await db.query(
      `UPDATE tickets
       SET status_id = ?, resolved_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [resolvedStatusId, ticketId]
    );

    await insertStatusHistory(ticketId, ticket.status_id || null, resolvedStatusId, req.user?.id || null, 'Resolved via shortcut endpoint');
    await addSystemActivityComment(ticketId, `Ticket resolved by user #${req.user?.id || 'system'}`);

    const technicianId = ticket.assigned_to || req.body.user_id || null;
    await trackSLAEvent(ticketId, 'resolved', technicianId, 'Ticket resolved');

    return res.json({ success: true, message: 'Ticket resolved' });
  } catch (error) {
    console.error('Error resolving ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to resolve ticket', error: error.message });
  }
};

const getTicketSLAStatus = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const sla = await getSLAStatus(ticketId);
    return res.json({ success: true, data: sla });
  } catch (error) {
    console.error('Error fetching SLA status:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch SLA status', error: error.message });
  }
};

const softDeleteTicket = async (req, res) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket = await fetchTicketById(ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const deletedStatusId = await getStatusId('deleted', 'closed');
    await db.query(
      `UPDATE tickets
       SET is_deleted = 1, status_id = COALESCE(?, status_id), updated_at = NOW()
       WHERE id = ?`,
      [deletedStatusId, ticketId]
    );

    await addSystemActivityComment(ticketId, `Ticket soft deleted by user #${req.user?.id || 'system'}`);

    await logAudit({
      actorUserId: req.user?.id || null,
      entityType: 'tickets',
      entityId: ticketId,
      action: 'soft_delete',
      oldValues: { is_deleted: 0 },
      newValues: { is_deleted: 1 },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ success: true, message: 'Ticket deleted (soft delete)' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete ticket', error: error.message });
  }
};

module.exports = {
  getAllTickets,
  getTicketStatusModel,
  createTicket,
  getTicketById,
  updateTicketPriority,
  getTicketPriorityInsights,
  reevaluateTicketPriority,
  updateTicketStatus,
  assignTicket,
  pauseTicketSLA,
  resumeTicketSLA,
  respondToTicket,
  resolveTicket,
  getTicketSLAStatus,
  getTicketComments,
  addTicketComment,
  getTicketLock,
  lockTicket,
  unlockTicket,
  softDeleteTicket,
};
