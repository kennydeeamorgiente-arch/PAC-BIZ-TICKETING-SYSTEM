const db = require('../config/database');
const { getPriorityId, recordPriorityHistory } = require('../services/priorityDecisionService');
const { checkNewEmails, createTicketFromEmail } = require('../services/gmailService');

function canAccessAiReview(req) {
  const role = String(req.user?.role || '').toLowerCase();
  return role === 'technician' || role === 'admin';
}

function toBoolFlag(value) {
  return Number(value) === 1 || value === true;
}

function isMissingSchemaError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR';
}

function isTruthyText(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

async function tableExists(tableName) {
  const [rows] = await db.query('SHOW TABLES LIKE ?', [tableName]);
  return rows.length > 0;
}

async function getQueue(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const status = String(req.query.status || 'pending').toLowerCase();
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const page = Math.max(1, Number(req.query.page || 1));
    const offset = (page - 1) * limit;

    let whereClause = '';
    if (status === 'pending') {
      whereClause = 'WHERE ai.needs_review = 1 AND ai.reviewed_at IS NULL';
    } else if (status === 'reviewed') {
      whereClause = 'WHERE ai.reviewed_at IS NOT NULL';
    } else if (status === 'all') {
      whereClause = '';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid status filter' });
    }

    const [rows] = await db.query(
      `SELECT ai.id,
              ai.ticket_id,
              ai.mode,
              ai.provider,
              ai.model_name,
              ai.intake_source,
              ai.predicted_priority_code,
              ai.applied_priority_code,
              ai.confidence,
              ai.decision_reason,
              ai.rule_hits,
              ai.needs_review,
              ai.is_auto_applied,
              ai.reviewed_at,
              ai.created_at,
              reviewer.full_name AS reviewed_by_name,
              t.ticket_number,
              t.subject AS ticket_subject,
              tp.priority_code AS ticket_current_priority
       FROM ai_inferences ai
       INNER JOIN tickets t ON t.id = ai.ticket_id
       LEFT JOIN ticket_priorities tp ON tp.id = t.priority_id
       LEFT JOIN users reviewer ON reviewer.id = ai.reviewed_by_user_id
       ${whereClause}
       ORDER BY ai.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM ai_inferences ai
       INNER JOIN tickets t ON t.id = ai.ticket_id
       ${whereClause}`
    );
    const total = Number(countRows?.[0]?.total || 0);
    const pages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        rule_hits: safeJsonParse(row.rule_hits, {}),
        needs_review: toBoolFlag(row.needs_review),
        is_auto_applied: toBoolFlag(row.is_auto_applied),
      })),
      count: rows.length,
      pagination: {
        total,
        page,
        limit,
        pages,
      },
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return res.status(400).json({
        success: false,
        message: 'AI inference tables are missing. Run AI phase migrations first.',
      });
    }
    console.error('Error fetching AI review queue:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch AI review queue', error: error.message });
  }
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

async function getIntakeQueue(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const status = String(req.query.status || 'new').toLowerCase();
    const decision = String(req.query.decision || 'all').toLowerCase();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    const page = Math.max(1, Number(req.query.page || 1));
    const offset = (page - 1) * limit;

    if (!['new', 'released', 'dismissed', 'all'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status filter' });
    }
    if (!['all', 'quarantine', 'review', 'ignore'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Invalid decision filter' });
    }

    const whereParts = [];
    const params = [];

    if (status !== 'all') {
      whereParts.push('q.status = ?');
      params.push(status);
    }
    if (decision !== 'all') {
      whereParts.push('q.decision = ?');
      params.push(decision);
    }

    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT q.id,
              q.gmail_message_id,
              q.gmail_thread_id,
              q.from_email,
              q.to_email,
              q.subject,
              q.body_snippet,
              q.risk_score,
              q.risk_level,
              q.decision,
              q.status,
              q.released_ticket_id,
              q.created_at,
              q.reviewed_at,
              q.reasons_json,
              q.rule_hits_json,
              q.attachments_json,
              t.ticket_number AS released_ticket_number
       FROM incoming_email_quarantine q
       LEFT JOIN tickets t ON t.id = q.released_ticket_id
       ${whereClause}
       ORDER BY q.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM incoming_email_quarantine q
       ${whereClause}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);
    const pages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        reasons: safeJsonParse(row.reasons_json, []),
        rule_hits: safeJsonParse(row.rule_hits_json, {}),
        attachments: safeJsonParse(row.attachments_json, []),
      })),
      pagination: {
        total,
        page,
        limit,
        pages,
      },
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return res.status(400).json({
        success: false,
        message: 'Incoming email quarantine table is missing. Run email guard migration first.',
      });
    }
    console.error('Error fetching intake review queue:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch intake review queue', error: error.message });
  }
}

async function releaseIntakeEmail(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid intake record id' });
    }

    const [rows] = await db.query(
      `SELECT id, gmail_message_id, gmail_thread_id, from_email, to_email, subject, body_snippet, attachments_json, status, released_ticket_id
       FROM incoming_email_quarantine
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Intake record not found' });
    }

    const row = rows[0];
    if (row.status === 'released' && row.released_ticket_id) {
      return res.json({
        success: true,
        message: 'Intake record already released to ticket',
        data: {
          id: row.id,
          released_ticket_id: row.released_ticket_id,
        },
      });
    }

    const emailPayload = {
      id: row.gmail_message_id || `intake-${row.id}`,
      threadId: row.gmail_thread_id || null,
      from: row.from_email,
      to: row.to_email || '',
      subject: row.subject || 'No Subject',
      body: row.body_snippet || '',
      snippet: row.body_snippet || '',
      attachments: safeJsonParse(row.attachments_json, []),
    };

    const created = await createTicketFromEmail(emailPayload);
    if (!created?.created) {
      return res.status(500).json({
        success: false,
        message: created?.error || 'Failed to create ticket from intake record',
      });
    }

    await db.query(
      `UPDATE incoming_email_quarantine
       SET status = 'released', released_ticket_id = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [created.ticketId, row.id]
    );

    return res.json({
      success: true,
      message: 'Intake email released to ticket successfully',
      data: {
        id: row.id,
        released_ticket_id: created.ticketId,
        released_ticket_number: created.ticketNumber,
      },
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return res.status(400).json({
        success: false,
        message: 'Incoming email quarantine table is missing. Run email guard migration first.',
      });
    }
    console.error('Error releasing intake email to ticket:', error);
    return res.status(500).json({ success: false, message: 'Failed to release intake email', error: error.message });
  }
}

async function dismissIntakeEmail(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid intake record id' });
    }

    const [rows] = await db.query('SELECT id, status FROM incoming_email_quarantine WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Intake record not found' });
    }

    if (rows[0].status === 'released') {
      return res.status(409).json({
        success: false,
        message: 'This intake record is already released to a ticket and cannot be dismissed.',
      });
    }

    await db.query(
      `UPDATE incoming_email_quarantine
       SET status = 'dismissed', reviewed_at = NOW()
       WHERE id = ?`,
      [id]
    );

    return res.json({
      success: true,
      message: 'Intake email dismissed',
      data: { id, status: 'dismissed' },
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return res.status(400).json({
        success: false,
        message: 'Incoming email quarantine table is missing. Run email guard migration first.',
      });
    }
    console.error('Error dismissing intake email:', error);
    return res.status(500).json({ success: false, message: 'Failed to dismiss intake email', error: error.message });
  }
}

async function deleteIntakeEmail(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid intake record id' });
    }

    const [rows] = await db.query('SELECT id, status, released_ticket_id FROM incoming_email_quarantine WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Intake record not found' });
    }

    const row = rows[0];
    if (row.status === 'released' && row.released_ticket_id) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete released intake record. It is linked to a ticket.',
      });
    }

    await db.query('DELETE FROM incoming_email_quarantine WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Intake email deleted', data: { id } });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return res.status(400).json({
        success: false,
        message: 'Incoming email quarantine table is missing. Run email guard migration first.',
      });
    }
    console.error('Error deleting intake email:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete intake email', error: error.message });
  }
}

async function getMetrics(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const [[summary]] = await db.query(
      `SELECT
         COUNT(*) AS total_inferences,
         SUM(CASE WHEN needs_review = 1 AND reviewed_at IS NULL THEN 1 ELSE 0 END) AS pending_reviews,
         SUM(CASE WHEN reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS reviewed_count,
         SUM(CASE WHEN reviewed_at IS NOT NULL AND predicted_priority_code = applied_priority_code THEN 1 ELSE 0 END) AS reviewed_agree_count,
         AVG(confidence) AS avg_confidence
       FROM ai_inferences`
    );

    const [bySource] = await db.query(
      `SELECT intake_source, COUNT(*) AS total
       FROM ai_inferences
       GROUP BY intake_source
       ORDER BY total DESC`
    );

    const reviewedCount = Number(summary?.reviewed_count || 0);
    const reviewedAgree = Number(summary?.reviewed_agree_count || 0);
    const agreementRate = reviewedCount > 0 ? reviewedAgree / reviewedCount : null;

    return res.json({
      success: true,
      data: {
        total_inferences: Number(summary?.total_inferences || 0),
        pending_reviews: Number(summary?.pending_reviews || 0),
        reviewed_count: reviewedCount,
        reviewed_agree_count: reviewedAgree,
        reviewed_agreement_rate: agreementRate,
        avg_confidence: Number(summary?.avg_confidence || 0),
        by_intake_source: bySource,
      },
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return res.status(400).json({
        success: false,
        message: 'AI inference tables are missing. Run AI phase migrations first.',
      });
    }
    console.error('Error fetching AI review metrics:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch AI review metrics', error: error.message });
  }
}

async function getDashboard(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const days = Math.max(7, Math.min(365, Number(req.query.days || 30)));
    const start = String(req.query.start || '').trim();
    const end = String(req.query.end || '').trim();

    const hasExplicitRange = Boolean(start && end);
    if (hasExplicitRange && (!isValidDateInput(start) || !isValidDateInput(end))) {
      return res.status(400).json({ success: false, message: 'Invalid date format for start/end. Use YYYY-MM-DD.' });
    }

    const aiWhereClause = hasExplicitRange
      ? 'DATE(created_at) BETWEEN ? AND ?'
      : 'created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
    const aiWhereParams = hasExplicitRange ? [start, end] : [days];

    const [[summary]] = await db.query(
      `SELECT
         COUNT(*) AS total_inferences_window,
         SUM(CASE WHEN intake_source = 'email' THEN 1 ELSE 0 END) AS email_inferences_window,
         SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS needs_review_window,
         SUM(CASE WHEN reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS reviewed_window,
         SUM(CASE WHEN is_auto_applied = 1 THEN 1 ELSE 0 END) AS auto_applied_window,
         SUM(CASE WHEN reviewed_at IS NOT NULL AND predicted_priority_code = applied_priority_code THEN 1 ELSE 0 END) AS reviewed_agree_window,
         SUM(CASE WHEN reviewed_at IS NOT NULL AND predicted_priority_code <> applied_priority_code THEN 1 ELSE 0 END) AS reviewed_override_window,
         AVG(confidence) AS avg_confidence_window
       FROM ai_inferences
       WHERE ${aiWhereClause}`,
      aiWhereParams
    );

    const [weeklyTrend] = await db.query(
      `SELECT DATE_FORMAT(DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d') AS week_start,
              COUNT(*) AS total,
              SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS needs_review_count,
              SUM(CASE WHEN reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS reviewed_count,
              SUM(CASE WHEN reviewed_at IS NOT NULL AND predicted_priority_code = applied_priority_code THEN 1 ELSE 0 END) AS reviewed_agree_count,
              AVG(confidence) AS avg_confidence
       FROM ai_inferences
       WHERE ${aiWhereClause}
       GROUP BY week_start
       ORDER BY week_start ASC`,
      aiWhereParams
    );

    const [sourceQuality] = await db.query(
      `SELECT intake_source,
              COUNT(*) AS total,
              AVG(confidence) AS avg_confidence,
              SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS needs_review_count,
              SUM(CASE WHEN reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS reviewed_count,
              SUM(CASE WHEN reviewed_at IS NOT NULL AND predicted_priority_code = applied_priority_code THEN 1 ELSE 0 END) AS reviewed_agree_count,
              SUM(CASE WHEN reviewed_at IS NOT NULL AND predicted_priority_code <> applied_priority_code THEN 1 ELSE 0 END) AS reviewed_override_count
       FROM ai_inferences
       WHERE ${aiWhereClause}
       GROUP BY intake_source
       ORDER BY total DESC`,
      aiWhereParams
    );

    let noiseOutcomes = [];
    let topNoisySenders = [];
    let topNoisyDomains = [];
    try {
      [noiseOutcomes] = await db.query(
        `SELECT decision, COUNT(*) AS total, AVG(risk_score) AS avg_risk_score
         FROM incoming_email_quarantine
         WHERE ${aiWhereClause}
         GROUP BY decision
         ORDER BY total DESC`,
        aiWhereParams
      );

      [topNoisySenders] = await db.query(
        `SELECT from_email, COUNT(*) AS total
         FROM incoming_email_quarantine
         WHERE ${aiWhereClause}
           AND decision IN ('ignore', 'quarantine')
         GROUP BY from_email
         ORDER BY total DESC
         LIMIT 10`,
        aiWhereParams
      );

      [topNoisyDomains] = await db.query(
        `SELECT SUBSTRING_INDEX(from_email, '@', -1) AS domain, COUNT(*) AS total
         FROM incoming_email_quarantine
         WHERE ${aiWhereClause}
           AND decision IN ('ignore', 'quarantine')
         GROUP BY domain
         ORDER BY total DESC
         LIMIT 10`,
        aiWhereParams
      );
    } catch (noiseError) {
      if (!isMissingSchemaError(noiseError)) throw noiseError;
    }

    const reviewedCount = Number(summary?.reviewed_window || 0);
    const reviewedAgree = Number(summary?.reviewed_agree_window || 0);
    const reviewedOverride = Number(summary?.reviewed_override_window || 0);

    return res.json({
      success: true,
      data: {
        days,
        range: hasExplicitRange ? { start, end } : null,
        summary: {
          total_inferences_window: Number(summary?.total_inferences_window || 0),
          email_inferences_window: Number(summary?.email_inferences_window || 0),
          needs_review_window: Number(summary?.needs_review_window || 0),
          reviewed_window: reviewedCount,
          auto_applied_window: Number(summary?.auto_applied_window || 0),
          reviewed_agree_window: reviewedAgree,
          reviewed_override_window: reviewedOverride,
          avg_confidence_window: Number(summary?.avg_confidence_window || 0),
          reviewed_agreement_rate: reviewedCount > 0 ? reviewedAgree / reviewedCount : null,
          reviewed_override_rate: reviewedCount > 0 ? reviewedOverride / reviewedCount : null,
        },
        weekly_trend: weeklyTrend,
        source_quality: sourceQuality,
        noise_outcomes: noiseOutcomes,
        top_noisy_senders: topNoisySenders,
        top_noisy_domains: topNoisyDomains,
      },
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return res.status(400).json({
        success: false,
        message: 'AI inference tables are missing. Run AI phase migrations first.',
      });
    }
    console.error('Error fetching AI dashboard:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch AI dashboard', error: error.message });
  }
}

async function getRecommendations(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const days = Math.max(7, Math.min(365, Number(req.query.days || 30)));

    const [[summary]] = await db.query(
      `SELECT
         COUNT(*) AS total_inferences_window,
         SUM(CASE WHEN needs_review = 1 THEN 1 ELSE 0 END) AS needs_review_window,
         SUM(CASE WHEN reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS reviewed_window,
         SUM(CASE WHEN reviewed_at IS NOT NULL AND predicted_priority_code = applied_priority_code THEN 1 ELSE 0 END) AS reviewed_agree_window,
         SUM(CASE WHEN reviewed_at IS NOT NULL AND predicted_priority_code <> applied_priority_code THEN 1 ELSE 0 END) AS reviewed_override_window,
         AVG(confidence) AS avg_confidence_window
       FROM ai_inferences
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    let noiseRows = [];
    try {
      [noiseRows] = await db.query(
        `SELECT decision, COUNT(*) AS total
         FROM incoming_email_quarantine
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY decision`,
        [days]
      );
    } catch (noiseError) {
      if (!isMissingSchemaError(noiseError)) throw noiseError;
    }

    const currentThreshold = Number(process.env.AI_PRIORITY_AUTO_APPLY_THRESHOLD || 0.8);
    const total = Number(summary?.total_inferences_window || 0);
    const needsReview = Number(summary?.needs_review_window || 0);
    const reviewed = Number(summary?.reviewed_window || 0);
    const reviewedAgree = Number(summary?.reviewed_agree_window || 0);
    const reviewedOverride = Number(summary?.reviewed_override_window || 0);
    const avgConfidence = Number(summary?.avg_confidence_window || 0);

    const reviewLoadRate = total > 0 ? needsReview / total : 0;
    const reviewedAgreementRate = reviewed > 0 ? reviewedAgree / reviewed : null;
    const reviewedOverrideRate = reviewed > 0 ? reviewedOverride / reviewed : null;

    const noiseMap = new Map(noiseRows.map((r) => [String(r.decision || '').toLowerCase(), Number(r.total || 0)]));
    const ignored = noiseMap.get('ignore') || 0;
    const quarantined = noiseMap.get('quarantine') || 0;
    const reviewedNoise = noiseMap.get('review') || 0;
    const allowedNoise = noiseMap.get('allow') || 0;
    const filteredNoiseRate = ignored + quarantined + reviewedNoise + allowedNoise > 0
      ? (ignored + quarantined) / (ignored + quarantined + reviewedNoise + allowedNoise)
      : null;

    const recommendations = [];

    if (reviewedOverrideRate !== null && reviewedOverrideRate >= 0.35) {
      const target = Math.min(0.95, currentThreshold + 0.05);
      recommendations.push({
        code: 'raise_auto_apply_threshold',
        severity: 'high',
        title: 'Raise auto-apply threshold',
        reason: `Reviewed override rate is high (${Math.round(reviewedOverrideRate * 100)}%).`,
        suggested_env: {
          AI_PRIORITY_AUTO_APPLY_THRESHOLD: target.toFixed(2),
        },
      });
    }

    if (
      reviewLoadRate >= 0.60 &&
      reviewedAgreementRate !== null &&
      reviewedAgreementRate >= 0.85 &&
      avgConfidence >= 0.75
    ) {
      const target = Math.max(0.60, currentThreshold - 0.05);
      recommendations.push({
        code: 'lower_auto_apply_threshold',
        severity: 'medium',
        title: 'Lower auto-apply threshold',
        reason: `Review load is high (${Math.round(reviewLoadRate * 100)}%) while review agreement is strong (${Math.round(
          reviewedAgreementRate * 100
        )}%).`,
        suggested_env: {
          AI_PRIORITY_AUTO_APPLY_THRESHOLD: target.toFixed(2),
        },
      });
    }

    if (filteredNoiseRate !== null && filteredNoiseRate < 0.30) {
      recommendations.push({
        code: 'tighten_noise_filter',
        severity: 'high',
        title: 'Tighten email noise filter',
        reason: `Noise filter capture is low (${Math.round(filteredNoiseRate * 100)}%).`,
        suggested_env: {
          EMAIL_GUARD_REVIEW_SCORE: '40',
          EMAIL_GUARD_QUARANTINE_SCORE: '65',
        },
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        code: 'configuration_healthy',
        severity: 'info',
        title: 'Current thresholds look healthy',
        reason: 'No threshold adjustment is strongly indicated from current window metrics.',
        suggested_env: {},
      });
    }

    return res.json({
      success: true,
      data: {
        days,
        current: {
          AI_PRIORITY_AUTO_APPLY_THRESHOLD: currentThreshold,
          EMAIL_GUARD_REVIEW_SCORE: Number(process.env.EMAIL_GUARD_REVIEW_SCORE || 45),
          EMAIL_GUARD_QUARANTINE_SCORE: Number(process.env.EMAIL_GUARD_QUARANTINE_SCORE || 70),
        },
        metrics: {
          total_inferences_window: total,
          needs_review_window: needsReview,
          review_load_rate: reviewLoadRate,
          reviewed_window: reviewed,
          reviewed_agreement_rate: reviewedAgreementRate,
          reviewed_override_rate: reviewedOverrideRate,
          avg_confidence_window: avgConfidence,
          filtered_noise_rate: filteredNoiseRate,
        },
        recommendations,
      },
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return res.status(400).json({
        success: false,
        message: 'AI inference tables are missing. Run AI phase migrations first.',
      });
    }
    console.error('Error generating AI recommendations:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate AI recommendations', error: error.message });
  }
}

async function getReadiness(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const env = {
      AI_PRIORITY_ENABLED: isTruthyText(process.env.AI_PRIORITY_ENABLED, true),
      AI_PRIORITY_MODE: String(process.env.AI_PRIORITY_MODE || 'rules_only').toLowerCase(),
      AI_PRIORITY_REEVALUATE_ON_INBOUND: isTruthyText(process.env.AI_PRIORITY_REEVALUATE_ON_INBOUND, true),
      EMAIL_GUARD_ENABLED: isTruthyText(process.env.EMAIL_GUARD_ENABLED, true),
      EMAIL_GUARD_LLM_ENABLED: isTruthyText(process.env.EMAIL_GUARD_LLM_ENABLED, false),
      OPENAI_API_KEY_CONFIGURED: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
      GMAIL_OAUTH_CONFIGURED:
        Boolean(String(process.env.GOOGLE_CLIENT_ID || '').trim()) &&
        Boolean(String(process.env.GOOGLE_CLIENT_SECRET || '').trim()) &&
        Boolean(String(process.env.GMAIL_REFRESH_TOKEN || '').trim()),
      GMAIL_RECEIVER_EMAIL: String(process.env.GMAIL_RECEIVER_EMAIL || '').trim() || null,
    };

    const requiredTables = [
      'tickets',
      'ticket_comments',
      'email_messages',
      'ai_inferences',
      'ticket_priority_history',
      'incoming_email_quarantine',
    ];

    const tableChecks = {};
    for (const table of requiredTables) {
      tableChecks[table] = await tableExists(table);
    }

    const missingTables = Object.entries(tableChecks)
      .filter(([, exists]) => !exists)
      .map(([name]) => name);

    const blockers = [];
    if (!env.GMAIL_OAUTH_CONFIGURED) blockers.push('Gmail OAuth env is incomplete');
    if (!env.GMAIL_RECEIVER_EMAIL) blockers.push('GMAIL_RECEIVER_EMAIL is empty');
    const llmModeRequiresKey = ['llm_only', 'hybrid_llm'].includes(env.AI_PRIORITY_MODE);
    const guardLlmRequiresKey = env.EMAIL_GUARD_LLM_ENABLED;
    if ((llmModeRequiresKey || guardLlmRequiresKey) && !env.OPENAI_API_KEY_CONFIGURED) {
      blockers.push('OPENAI_API_KEY missing while LLM mode is enabled');
    }
    if (!['rules_only', 'llm_only', 'hybrid_llm', 'disabled'].includes(env.AI_PRIORITY_MODE)) {
      blockers.push(`Unknown AI_PRIORITY_MODE value: ${env.AI_PRIORITY_MODE}`);
    }
    if (missingTables.length > 0) blockers.push(`Missing DB tables: ${missingTables.join(', ')}`);

    const guidance = [];
    if (!env.OPENAI_API_KEY_CONFIGURED && (llmModeRequiresKey || guardLlmRequiresKey)) {
      guidance.push('Set OPENAI_API_KEY in backend/.env, or switch AI_PRIORITY_MODE=rules_only and EMAIL_GUARD_LLM_ENABLED=false.');
    }
    if (!env.GMAIL_OAUTH_CONFIGURED) {
      guidance.push('Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in backend/.env.');
    }

    return res.json({
      success: true,
      data: {
        env,
        tables: tableChecks,
        status: blockers.length === 0 ? 'ready' : 'needs_attention',
        blockers,
        guidance,
      },
    });
  } catch (error) {
    console.error('Error checking AI readiness:', error);
    return res.status(500).json({ success: false, message: 'Failed to check AI readiness', error: error.message });
  }
}

async function runEmailSyncNow(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const dryRun = Boolean(req.body?.dry_run);
    const markAsRead = req.body?.mark_as_read;
    const options = {
      dryRun,
    };
    if (markAsRead !== undefined) options.markAsRead = Boolean(markAsRead);

    const result = await checkNewEmails(options);
    return res.json({
      success: true,
      message: dryRun ? 'Email sync dry-run completed' : 'Email sync completed',
      data: result,
    });
  } catch (error) {
    console.error('Error running manual email sync:', error);
    return res.status(500).json({ success: false, message: 'Failed to run manual email sync', error: error.message });
  }
}

async function reviewInference(req, res) {
  try {
    if (!canAccessAiReview(req)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const inferenceId = Number(req.params.id);
    const decision = String(req.body?.decision || '').toLowerCase();
    const overridePriority = String(req.body?.priority_code || '').toLowerCase();
    const reason = String(req.body?.reason || '').trim().slice(0, 500);

    if (!inferenceId) {
      return res.status(400).json({ success: false, message: 'Invalid inference id' });
    }

    if (!['approve', 'apply_predicted', 'override'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Invalid decision value' });
    }

    const [rows] = await db.query(
      `SELECT ai.id, ai.ticket_id, ai.predicted_priority_code, ai.applied_priority_code, ai.reviewed_at,
              t.priority_id AS ticket_priority_id
       FROM ai_inferences ai
       INNER JOIN tickets t ON t.id = ai.ticket_id
       WHERE ai.id = ?
       LIMIT 1`,
      [inferenceId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Inference not found' });
    }

    const inference = rows[0];
    const oldPriorityId = Number(inference.ticket_priority_id || 0) || null;

    let nextPriorityCode = inference.applied_priority_code;
    if (decision === 'apply_predicted') {
      nextPriorityCode = inference.predicted_priority_code;
    } else if (decision === 'override') {
      if (!overridePriority) {
        return res.status(400).json({ success: false, message: 'priority_code is required for override decision' });
      }
      nextPriorityCode = overridePriority;
    }

    const nextPriorityId = await getPriorityId(nextPriorityCode, null);
    if (!nextPriorityId) {
      return res.status(400).json({ success: false, message: 'Invalid resulting priority' });
    }

    if (oldPriorityId !== Number(nextPriorityId)) {
      await db.query(
        `UPDATE tickets
         SET priority_id = ?, updated_at = NOW()
         WHERE id = ?`,
        [nextPriorityId, inference.ticket_id]
      );
    }

    await db.query(
      `UPDATE ai_inferences
       SET applied_priority_code = ?,
           needs_review = 0,
           reviewed_by_user_id = ?,
           reviewed_at = NOW()
       WHERE id = ?`,
      [nextPriorityCode, req.user?.id || null, inferenceId]
    );

    if (oldPriorityId !== Number(nextPriorityId)) {
      await recordPriorityHistory({
        ticketId: inference.ticket_id,
        oldPriorityId,
        newPriorityId: nextPriorityId,
        changedByUserId: req.user?.id || null,
        changeSource: 'manual',
        reason: reason || `AI review decision: ${decision}`,
        inferenceId,
      });
    }

    return res.json({
      success: true,
      message: 'AI inference review saved',
      data: {
        inference_id: inferenceId,
        ticket_id: inference.ticket_id,
        decision,
        applied_priority_code: nextPriorityCode,
      },
    });
  } catch (error) {
    if (isMissingSchemaError(error)) {
      return res.status(400).json({
        success: false,
        message: 'AI inference tables are missing. Run AI phase migrations first.',
      });
    }
    console.error('Error reviewing AI inference:', error);
    return res.status(500).json({ success: false, message: 'Failed to review AI inference', error: error.message });
  }
}

module.exports = {
  getQueue,
  getIntakeQueue,
  getMetrics,
  getDashboard,
  getRecommendations,
  getReadiness,
  runEmailSyncNow,
  releaseIntakeEmail,
  dismissIntakeEmail,
  deleteIntakeEmail,
  reviewInference,
};
