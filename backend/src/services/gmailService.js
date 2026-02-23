const { google } = require('googleapis');
const dns = require('node:dns/promises');
const db = require('../config/database');
const {
  decideTicketPriority,
  getPriorityId,
  recordPriorityInference,
  recordPriorityHistory,
} = require('./priorityDecisionService');
const { evaluateEmailIntakeDecision, saveEmailGuardRecord } = require('./emailIntakeGuardService');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN,
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
const GMAIL_API_HOST = 'gmail.googleapis.com';

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const GMAIL_POLL_INTERVAL_MS = parsePositiveInt(process.env.GMAIL_POLL_INTERVAL_MS, 30000);
const GMAIL_MAX_ERROR_BACKOFF_MS = parsePositiveInt(process.env.GMAIL_MAX_ERROR_BACKOFF_MS, 300000);
const GMAIL_NETWORK_LOG_THROTTLE_MS = parsePositiveInt(process.env.GMAIL_NETWORK_LOG_THROTTLE_MS, 120000);
const GMAIL_MONITOR_SINGLETON = String(process.env.GMAIL_MONITOR_SINGLETON || 'true').toLowerCase() !== 'false';
const GMAIL_MONITOR_DB_LOCK_NAME = String(process.env.GMAIL_MONITOR_DB_LOCK_NAME || 'pacbiz_gmail_monitor').trim() || 'pacbiz_gmail_monitor';

let emailMonitorTimer = null;
let emailMonitorRunning = false;
let consecutiveMonitorFailures = 0;
let lastNetworkIssueLogAt = 0;
let monitorLockConnection = null;

function buildInboxQuery() {
  const explicitQuery = String(process.env.GMAIL_FETCH_QUERY || '').trim();
  if (explicitQuery) return explicitQuery;

  const receiver = String(process.env.GMAIL_RECEIVER_EMAIL || '').trim();
  if (!receiver) return 'is:unread';
  return `is:unread (to:${receiver} OR cc:${receiver} OR deliveredto:${receiver})`;
}

function shouldMarkEmailAsRead() {
  return String(process.env.GMAIL_MARK_AS_READ_AFTER_PROCESS || 'true').toLowerCase() !== 'false';
}

function shouldAutoReevaluatePriorityOnInbound() {
  return String(process.env.AI_PRIORITY_REEVALUATE_ON_INBOUND || 'true').toLowerCase() !== 'false';
}

function networkErrorCode(error) {
  return String(error?.code || error?.cause?.code || error?.error?.code || '').toUpperCase();
}

function isTransientNetworkError(error) {
  const code = networkErrorCode(error);
  const message = String(error?.message || '').toLowerCase();
  return (
    ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code) ||
    message.includes('getaddrinfo enotfound')
  );
}

function networkErrorSummary(error) {
  const code = networkErrorCode(error) || 'NETWORK_ERROR';
  const message = String(error?.message || error?.cause?.message || 'Unknown network error')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
  return `${code}: ${message}`;
}

function logTransientNetworkIssue(error, context = 'Gmail monitoring') {
  const now = Date.now();
  if (now - lastNetworkIssueLogAt < GMAIL_NETWORK_LOG_THROTTLE_MS) return;
  lastNetworkIssueLogAt = now;

  console.warn(
    `${context} temporarily unavailable (${networkErrorSummary(error)}). ` +
      'Will retry automatically with backoff.'
  );
}

async function canResolveGmailApiHost() {
  try {
    await dns.lookup(GMAIL_API_HOST);
    return true;
  } catch (error) {
    return { ok: false, error };
  }
}

async function acquireMonitorLeaderLock() {
  if (!GMAIL_MONITOR_SINGLETON) return true;
  if (monitorLockConnection) return true;

  let connection = null;
  try {
    connection = await db.getConnection();
    const [rows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [GMAIL_MONITOR_DB_LOCK_NAME]);
    const acquired = Number(rows?.[0]?.acquired || 0) === 1;
    if (!acquired) {
      connection.release();
      return false;
    }

    monitorLockConnection = connection;
    return true;
  } catch (error) {
    if (connection) {
      try {
        connection.release();
      } catch {
        // ignore release errors
      }
    }
    console.warn(
      `Gmail monitor lock unavailable (${error?.message || error}). ` +
        'Continuing without singleton protection.'
    );
    return true;
  }
}

function toSafeDate(input) {
  const d = new Date(input || Date.now());
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function isMissingSchemaError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR';
}

function messageBodyForTicket(email) {
  const text = String(email.body || email.snippet || '').trim();
  return text || '(No body text)';
}

async function findTicketByThreadId(threadId) {
  if (!threadId) return null;
  const [rows] = await db.query(
    `SELECT id, ticket_number, requester_user_id, email_thread_id
     FROM tickets
     WHERE email_thread_id = ? AND is_deleted = 0
     LIMIT 1`,
    [threadId]
  );
  return rows.length ? rows[0] : null;
}

function extractTicketNumberFromSubject(subject) {
  const text = String(subject || '');
  const bracketMatch = text.match(/\[(TKT-[A-Z0-9-]+)\]/i);
  if (bracketMatch) return bracketMatch[1].toUpperCase();

  const plainMatch = text.match(/\b(TKT-[A-Z0-9-]+)\b/i);
  if (plainMatch) return plainMatch[1].toUpperCase();

  return null;
}

async function findTicketByNumber(ticketNumber) {
  if (!ticketNumber) return null;
  const [rows] = await db.query(
    `SELECT id, ticket_number, requester_user_id, email_thread_id
     FROM tickets
     WHERE ticket_number = ? AND is_deleted = 0
     LIMIT 1`,
    [ticketNumber]
  );
  return rows.length ? rows[0] : null;
}

async function resolveInboundTicket(email) {
  const byThread = await findTicketByThreadId(email.threadId);
  if (byThread) return byThread;

  const ticketNumber = extractTicketNumberFromSubject(email.subject);
  if (!ticketNumber) return null;

  const byNumber = await findTicketByNumber(ticketNumber);
  if (!byNumber) return null;

  if (!byNumber.email_thread_id && email.threadId) {
    await db.query(
      `UPDATE tickets
       SET email_thread_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [email.threadId, byNumber.id]
    );
    byNumber.email_thread_id = email.threadId;
  }

  return byNumber;
}

async function isEmailMessageAlreadyStored(gmailMessageId) {
  if (!gmailMessageId) return false;
  try {
    const [rows] = await db.query(
      `SELECT id
       FROM email_messages
       WHERE gmail_message_id = ?
       LIMIT 1`,
      [gmailMessageId]
    );
    return rows.length > 0;
  } catch (error) {
    if (isMissingSchemaError(error)) return false;
    throw error;
  }
}

async function ensureRequesterUserId(fromHeader) {
  const userEmail = extractEmail(fromHeader);
  let [userRows] = await db.query(
    'SELECT id FROM users WHERE email = ? AND is_deleted = 0 LIMIT 1',
    [userEmail]
  );

  let userId;
  if (userRows.length === 0) {
    const requesterRoleId = await getLookupId('roles', 'code', 'requester');
    if (!requesterRoleId) {
      return { userId: null, userEmail };
    }

    const [insertUser] = await db.query(
      `INSERT INTO users (username, email, password_hash, auth_provider, full_name, role_id, shift_id, is_active)
       VALUES (?, ?, NULL, 'email_only', ?, ?, NULL, 1)`,
      [userEmail, userEmail, userEmail.split('@')[0], requesterRoleId]
    );
    userId = insertUser.insertId;
  } else {
    userId = userRows[0].id;
  }

  return { userId, userEmail };
}

async function storeInboundEmailMessage(ticketId, email) {
  try {
    await db.query(
      `INSERT INTO email_messages
         (ticket_id, gmail_message_id, gmail_thread_id, direction, from_email, to_email, subject, body_text, sent_or_received_at)
       VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ticket_id = VALUES(ticket_id)`,
      [
        ticketId,
        email.id || null,
        email.threadId || null,
        extractEmail(email.from || ''),
        String(email.to || '').slice(0, 190) || String(process.env.GMAIL_RECEIVER_EMAIL || '').slice(0, 190),
        String(email.subject || 'No Subject').slice(0, 255),
        messageBodyForTicket(email),
        toSafeDate(email.date),
      ]
    );
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn('email_messages table missing; inbound email log skipped.');
      return;
    }
    throw error;
  }
}

async function appendInboundReplyToTicket(ticketId, requesterUserId, email) {
  const inboundBody = messageBodyForTicket(email);
  const replyText = `Email reply from ${email.from}:\n\n${inboundBody}`;

  await db.query(
    `INSERT INTO ticket_comments (ticket_id, author_user_id, comment_text, is_internal)
     VALUES (?, ?, ?, 0)`,
    [ticketId, requesterUserId || null, replyText]
  );

  await db.query(
    `UPDATE tickets
     SET updated_at = NOW()
     WHERE id = ?`,
    [ticketId]
  );
}

async function fetchTicketForPriorityDecision(ticketId) {
  const [rows] = await db.query(
    `SELECT t.id, t.subject, t.description, t.priority_id,
            tp.priority_code AS priority_code,
            requester.email AS requester_email
     FROM tickets t
     INNER JOIN ticket_priorities tp ON tp.id = t.priority_id
     LEFT JOIN users requester ON requester.id = t.requester_user_id
     WHERE t.id = ? AND t.is_deleted = 0
     LIMIT 1`,
    [ticketId]
  );
  return rows.length ? rows[0] : null;
}

async function autoReevaluatePriorityFromInboundEmail(ticketId, email, actorUserId = null) {
  if (!shouldAutoReevaluatePriorityOnInbound()) return;

  try {
    const ticket = await fetchTicketForPriorityDecision(ticketId);
    if (!ticket) return;

    const decision = await decideTicketPriority({
      subject: ticket.subject || email.subject || '',
      bodyText: `${ticket.description || ''}\n\nLatest inbound reply:\n${messageBodyForTicket(email)}`,
      fromEmail: extractEmail(email.from || ''),
      explicitPriorityCode: null,
      intakeSource: 'email',
    });

    const nextPriorityId = await getPriorityId(decision.appliedPriorityCode, ticket.priority_code || 'medium');
    if (!nextPriorityId) return;

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
        actorUserId,
      });
    } catch (inferenceError) {
      console.warn('Inbound auto-priority inference log skipped:', inferenceError.message || inferenceError);
    }

    if (changed) {
      try {
        await recordPriorityHistory({
          ticketId,
          oldPriorityId: ticket.priority_id || null,
          newPriorityId: nextPriorityId,
          changedByUserId: actorUserId,
          changeSource: 'ai',
          reason: `Auto re-evaluated from inbound email. ${decision.reason || ''}`.trim().slice(0, 500),
          inferenceId,
        });
      } catch (historyError) {
        console.warn('Inbound auto-priority history log skipped:', historyError.message || historyError);
      }

      console.log(
        `Inbound auto-priority update on ticket ${ticketId}: ${ticket.priority_code} -> ${decision.appliedPriorityCode} (${Math.round(
          Number(decision.confidence || 0) * 100
        )}%)`
      );
    } else {
      console.log(
        `Inbound auto-priority check on ticket ${ticketId}: no change (${ticket.priority_code}, ${Math.round(
          Number(decision.confidence || 0) * 100
        )}%)`
      );
    }
  } catch (error) {
    console.warn('Inbound auto-priority re-evaluation skipped:', error.message || error);
  }
}

async function checkNewEmails(options = {}) {
  const markAsRead = options?.markAsRead === undefined ? shouldMarkEmailAsRead() : Boolean(options.markAsRead);
  const dryRun = Boolean(options?.dryRun);
  const autoCreateReview = String(process.env.EMAIL_GUARD_AUTO_CREATE_REVIEW || 'false').toLowerCase() === 'true';
  const stats = {
    query: buildInboxQuery(),
    fetched: 0,
    processed: 0,
    skipped_duplicate: 0,
    linked_replies: 0,
    created_tickets: 0,
    review_allowed: 0,
    ignored: 0,
    quarantined: 0,
    marked_read: 0,
    left_unread: 0,
    errors: 0,
  };

  try {
    const dnsCheck = await canResolveGmailApiHost();
    if (dnsCheck !== true) {
      stats.errors += 1;
      logTransientNetworkIssue(dnsCheck.error, 'Gmail API DNS lookup');
      return {
        ...stats,
        transient_network_error: true,
        fatal_error: networkErrorSummary(dnsCheck.error),
      };
    }

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: stats.query,
    });

    if (!response.data.messages) {
      console.log('No new emails found');
      return stats;
    }

    stats.fetched = response.data.messages.length;

    for (const message of response.data.messages) {
      try {
        const emailData = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full',
        });

        const email = parseEmail(emailData.data);

        if (await isEmailMessageAlreadyStored(email.id)) {
          stats.skipped_duplicate += 1;
          console.log(`Skipped already-processed email message: ${email.id}`);
        } else {
          const existingTicket = await resolveInboundTicket(email);

          if (existingTicket) {
            const { userId } = await ensureRequesterUserId(email.from);
            if (!dryRun) {
              await appendInboundReplyToTicket(existingTicket.id, userId, email);
              await storeInboundEmailMessage(existingTicket.id, email);
              await autoReevaluatePriorityFromInboundEmail(existingTicket.id, email, userId || null);
            }
            stats.linked_replies += 1;
            console.log(`Inbound reply linked to ticket ${existingTicket.ticket_number} from thread ${email.threadId}`);
          } else {
            const assessment = await evaluateEmailIntakeDecision(email);
            if (assessment.decision === 'quarantine') {
              stats.quarantined += 1;
              if (!dryRun) {
                const recordId = await saveEmailGuardRecord({ email, assessment });
                console.warn(
                  `Quarantined email "${email.subject}" (score=${assessment.score}, level=${assessment.level}, record_id=${recordId || 'n/a'})`
                );
              }
            } else if (assessment.decision === 'ignore') {
              stats.ignored += 1;
              if (!dryRun) {
                const recordId = await saveEmailGuardRecord({ email, assessment });
                console.log(`Ignored non-ticket email "${email.subject}" (record_id=${recordId || 'n/a'})`);
              }
            } else if (assessment.decision === 'review') {
              stats.review_allowed += 1;
              if (!dryRun) {
                const recordId = await saveEmailGuardRecord({ email, assessment });
                console.warn(
                  `Queued for manual intake review "${email.subject}" (score=${assessment.score}, level=${assessment.level}, record_id=${recordId || 'n/a'})`
                );
              }
              if (autoCreateReview) {
                if (!dryRun) {
                  const created = await createTicketFromEmail(email);
                  if (created?.created) {
                    stats.created_tickets += 1;
                  } else {
                    stats.errors += 1;
                  }
                } else {
                  stats.created_tickets += 1;
                }
              }
            } else {
              if (!dryRun) {
                const created = await createTicketFromEmail(email);
                if (created?.created) {
                  stats.created_tickets += 1;
                } else {
                  stats.errors += 1;
                }
              } else {
                stats.created_tickets += 1;
              }
            }
          }
        }

        if (!dryRun) {
          if (markAsRead) {
            await gmail.users.messages.modify({
              userId: 'me',
              id: message.id,
              requestBody: {
                removeLabelIds: ['UNREAD'],
              },
            });
            stats.marked_read += 1;
          } else {
            stats.left_unread += 1;
            console.warn(`Message left unread for testing: ${email.subject}`);
          }
        } else {
          stats.left_unread += 1;
        }

        stats.processed += 1;
        console.log(`Processed email: ${email.subject}`);
      } catch (messageError) {
        stats.errors += 1;
        console.error('Error processing one email message:', messageError);
      }
    }

    return stats;
  } catch (error) {
    stats.errors += 1;
    if (isTransientNetworkError(error)) {
      logTransientNetworkIssue(error, 'Error checking emails');
      return {
        ...stats,
        transient_network_error: true,
        fatal_error: networkErrorSummary(error),
      };
    }

    console.error('Error checking emails:', error);
    return {
      ...stats,
      fatal_error: error.message || 'Unknown Gmail processing error',
    };
  }
}

function collectParts(parts = [], bucket = []) {
  for (const part of parts || []) {
    bucket.push(part);
    if (Array.isArray(part.parts) && part.parts.length > 0) {
      collectParts(part.parts, bucket);
    }
  }
  return bucket;
}

function parseEmail(message) {
  const headers = message.payload.headers || [];
  const parts = collectParts(message.payload.parts || []);
  const subject = headers.find((h) => h.name === 'Subject')?.value || 'No Subject';
  const from = headers.find((h) => h.name === 'From')?.value || 'Unknown Sender';
  const to = headers.find((h) => h.name === 'To')?.value || '';
  const replyTo = headers.find((h) => h.name === 'Reply-To')?.value || '';
  const date = headers.find((h) => h.name === 'Date')?.value || new Date().toISOString();

  let body = '';
  if (parts.length > 0) {
    const textPart = parts.find((part) => part.mimeType === 'text/plain');
    if (textPart && textPart.body.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }
  } else if (message.payload.body.data) {
    body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
  }

  const attachments = parts
    .filter((part) => String(part.filename || '').trim().length > 0)
    .map((part) => ({
      filename: part.filename,
      mimeType: part.mimeType || 'application/octet-stream',
      size: Number(part.body?.size || 0),
    }));

  return {
    id: message.id,
    threadId: message.threadId,
    subject,
    from,
    to,
    replyTo,
    date,
    body,
    snippet: message.snippet,
    attachments,
  };
}

async function getLookupId(table, codeColumn, code, fallback = null) {
  const [rows] = await db.query(`SELECT id FROM ${table} WHERE ${codeColumn} = ? LIMIT 1`, [code]);
  if (rows.length) return rows[0].id;

  if (fallback && fallback !== code) {
    const [fallbackRows] = await db.query(`SELECT id FROM ${table} WHERE ${codeColumn} = ? LIMIT 1`, [fallback]);
    return fallbackRows.length ? fallbackRows[0].id : null;
  }

  return null;
}

async function createTicketFromEmail(email) {
  try {
    const userEmail = extractEmail(email.from);
    let [userRows] = await db.query('SELECT id FROM users WHERE email = ? AND is_deleted = 0 LIMIT 1', [userEmail]);

    let userId;
    if (userRows.length === 0) {
      const requesterRoleId = await getLookupId('roles', 'code', 'requester');
      if (!requesterRoleId) {
        throw new Error('roles.requester seed not found');
      }

      const [insertUser] = await db.query(
        `INSERT INTO users (username, email, password_hash, auth_provider, full_name, role_id, shift_id, is_active)
         VALUES (?, ?, NULL, 'email_only', ?, ?, NULL, 1)`,
        [userEmail, userEmail, userEmail.split('@')[0], requesterRoleId]
      );
      userId = insertUser.insertId;
    } else {
      userId = userRows[0].id;
    }

    const openStatusId = await getLookupId('ticket_statuses', 'status_code', 'new', 'open');
    const emailCategoryId = await getLookupId('ticket_categories', 'category_code', 'email', 'general');
    const emailChannelId = await getLookupId('intake_channels', 'channel_code', 'email');

    const priorityDecision = await decideTicketPriority({
      subject: email.subject,
      bodyText: email.body || email.snippet || '',
      fromEmail: userEmail,
      explicitPriorityCode: null,
      intakeSource: 'email',
    });
    const priorityId = await getPriorityId(priorityDecision.appliedPriorityCode, 'medium');

    if (!openStatusId || !priorityId || !emailChannelId) {
      throw new Error('Required ticket lookups are missing in V2 seed data');
    }

    const ticketNumber = `TKT-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

    const [insertTicket] = await db.query(
      `INSERT INTO tickets (
         ticket_number, subject, description,
         requester_user_id, created_by_user_id,
         assigned_to_user_id, category_id, priority_id, status_id,
         intake_channel_id, email_thread_id
       ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      [
        ticketNumber,
        email.subject,
        `Email from ${email.from}:\n\n${email.body || email.snippet || ''}`,
        userId,
        userId,
        emailCategoryId,
        priorityId,
        openStatusId,
        emailChannelId,
        email.threadId || null,
      ]
    );

    try {
      const inferenceId = await recordPriorityInference({
        ticketId: insertTicket.insertId,
        decision: priorityDecision,
        actorUserId: userId,
      });

      await recordPriorityHistory({
        ticketId: insertTicket.insertId,
        oldPriorityId: null,
        newPriorityId: priorityId,
        changedByUserId: userId,
        changeSource: 'rule_engine',
        reason: priorityDecision.reason,
        inferenceId,
      });
    } catch (priorityLogError) {
      console.warn('Email priority logging skipped:', priorityLogError.message || priorityLogError);
    }

    console.log(`Created ticket ${ticketNumber} from email`);
    return {
      created: true,
      ticketId: insertTicket.insertId,
      ticketNumber,
    };
  } catch (error) {
    console.error('Error creating ticket from email:', error);
    return {
      created: false,
      error: error.message || 'Failed to create ticket from email',
    };
  }
}

function extractEmail(fromString) {
  const match = fromString.match(/<(.+)>/);
  return (match ? match[1] : fromString).trim().toLowerCase();
}

async function startEmailMonitoring() {
  if (!process.env.GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.log('Gmail monitoring skipped: OAuth env vars are not fully set.');
    return;
  }

  const hasLock = await acquireMonitorLeaderLock();
  if (!hasLock) {
    console.log(`Gmail monitoring skipped: another backend process already owns lock "${GMAIL_MONITOR_DB_LOCK_NAME}".`);
    return;
  }

  if (emailMonitorTimer) {
    console.log('Gmail monitoring already running; skipping duplicate start.');
    return;
  }

  const scheduleNextRun = (delayMs) => {
    const safeDelay = parsePositiveInt(delayMs, GMAIL_POLL_INTERVAL_MS);
    emailMonitorTimer = setTimeout(runMonitorCycle, safeDelay);
  };

  const computeDelay = (result) => {
    if (result?.transient_network_error) {
      consecutiveMonitorFailures += 1;
      const nextDelay = Math.min(
        GMAIL_POLL_INTERVAL_MS * Math.pow(2, Math.min(consecutiveMonitorFailures - 1, 4)),
        GMAIL_MAX_ERROR_BACKOFF_MS
      );
      return nextDelay;
    }
    consecutiveMonitorFailures = 0;
    return GMAIL_POLL_INTERVAL_MS;
  };

  const runMonitorCycle = async () => {
    if (emailMonitorRunning) {
      scheduleNextRun(GMAIL_POLL_INTERVAL_MS);
      return;
    }

    emailMonitorRunning = true;
    try {
      const result = await checkNewEmails();
      scheduleNextRun(computeDelay(result));
    } catch (error) {
      const fallbackResult = { transient_network_error: isTransientNetworkError(error) };
      if (fallbackResult.transient_network_error) {
        logTransientNetworkIssue(error, 'Unhandled monitor cycle error');
      } else {
        console.error('Unhandled monitor cycle error:', error);
      }
      scheduleNextRun(computeDelay(fallbackResult));
    } finally {
      emailMonitorRunning = false;
    }
  };

  console.log(`Starting Gmail monitoring every ${Math.round(GMAIL_POLL_INTERVAL_MS / 1000)}s...`);
  runMonitorCycle();
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildReplySubject(ticketNumber, subject) {
  const cleanSubject = String(subject || '').trim();
  if (!cleanSubject) return `[${ticketNumber}] Update`;
  if (cleanSubject.toLowerCase().includes(`[${String(ticketNumber).toLowerCase()}]`)) return cleanSubject;
  return `[${ticketNumber}] ${cleanSubject}`;
}

async function sendTicketReply({ toEmail, ticketNumber, subject, commentText, threadId }) {
  try {
    if (!toEmail || !commentText) {
      return { sent: false, reason: 'Missing email recipient or message body' };
    }

    if (!process.env.GMAIL_REFRESH_TOKEN || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return { sent: false, reason: 'Gmail OAuth env vars are not configured' };
    }

    const emailSubject = buildReplySubject(ticketNumber, subject);
    const emailBody = String(commentText).trim();
    const mail = [
      `To: ${toEmail}`,
      'Content-Type: text/plain; charset=\"UTF-8\"',
      'MIME-Version: 1.0',
      `Subject: ${emailSubject}`,
      '',
      emailBody,
    ].join('\r\n');

    const raw = toBase64Url(mail);
    const requestBody = threadId ? { raw, threadId } : { raw };

    await gmail.users.messages.send({
      userId: 'me',
      requestBody,
    });

    return { sent: true };
  } catch (error) {
    console.error('Error sending ticket reply email:', error);
    return { sent: false, reason: error.message || 'Failed to send email reply' };
  }
}

module.exports = {
  checkNewEmails,
  startEmailMonitoring,
  parseEmail,
  createTicketFromEmail,
  sendTicketReply,
};
