const db = require('../config/database');

const SUSPICIOUS_PATTERNS = [
  /verify\s+your\s+account/i,
  /password\s+expires?\s+today/i,
  /reset\s+your\s+password/i,
  /unusual\s+login/i,
  /gift\s+card/i,
  /wire\s+transfer/i,
  /bank\s+details?/i,
  /urgent\s+action\s+required/i,
  /click\s+the\s+link/i,
  /login\s+now/i,
  /payment\s+failed/i,
  /invoice\s+overdue/i,
];

const SHORTENER_DOMAINS = ['bit.ly', 'tinyurl.com', 't.co', 'rb.gy', 'ow.ly'];
const RISKY_EXTENSIONS = ['.exe', '.js', '.bat', '.cmd', '.scr', '.vbs', '.jar', '.msi', '.ps1', '.hta'];
const NON_TICKET_PATTERNS = [
  /\bnewsletter\b/i,
  /\bannouncement\b/i,
  /\bcompany\s+update\b/i,
  /\bweekly\s+update\b/i,
  /\bmonthly\s+update\b/i,
  /\bhr\s+notice\b/i,
  /\bevent\s+invite\b/i,
  /\binvitation\b/i,
  /\bfyi\b/i,
  /\bout\s+of\s+office\b/i,
  /\bholiday\s+notice\b/i,
];
const NON_TICKET_HARD_PATTERNS = [
  /\bstarted\s+chatting\s+in\b/i,
  /\bhere'?s\s+the\s+latest\s+activity\b/i,
  /\bwelcome\s+to\s+google\s+workspace\b/i,
  /\bnotification\s+digest\b/i,
  /\bactivity\s+summary\b/i,
];
const ISSUE_PATTERNS = [
  /\bissue\b/i,
  /\bproblem\b/i,
  /\berror\b/i,
  /\bnot\s+working\b/i,
  /\bcannot\b/i,
  /\bcan't\b/i,
  /\bunable\b/i,
  /\bdown\b/i,
  /\bfailed\b/i,
  /\bhelp\b/i,
  /\bsupport\b/i,
  /\bticket\b/i,
  /\bincident\b/i,
];
const NOTIFICATION_SENDER_LOCAL_PATTERNS = [
  /^notifications?$/i,
  /^no-?reply$/i,
  /^noreply$/i,
  /^workspace-noreply$/i,
  /^mailer-daemon$/i,
];

function parseCsvSet(input) {
  return new Set(
    String(input || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function cleanText(input = '') {
  return String(input).replace(/\s+/g, ' ').trim();
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function extractJsonObject(text = '') {
  const source = String(text || '').trim();
  if (!source) return null;

  try {
    return JSON.parse(source);
  } catch (_) {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(source.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function extractOutputText(responseJson) {
  if (!responseJson || typeof responseJson !== 'object') return '';

  if (typeof responseJson.output_text === 'string' && responseJson.output_text.trim()) {
    return responseJson.output_text.trim();
  }

  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return '';
}

function extractEmailAddress(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).toLowerCase();
}

function getDomain(email = '') {
  const at = String(email).lastIndexOf('@');
  if (at < 0) return '';
  return String(email).slice(at + 1).toLowerCase();
}

function getLocalPart(email = '') {
  const at = String(email).indexOf('@');
  if (at <= 0) return '';
  return String(email).slice(0, at).toLowerCase();
}

function extractUrls(text = '') {
  const source = String(text || '');
  const matches = source.match(/https?:\/\/[^\s<>"')]+|www\.[^\s<>"')]+/gi) || [];
  const normalized = matches.map((u) => (u.toLowerCase().startsWith('http') ? u : `http://${u}`));
  return [...new Set(normalized)];
}

function extractUrlDomain(url = '') {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

function classifyLevel(score) {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function evaluateEmailRisk(email = {}) {
  const enabled = String(process.env.EMAIL_GUARD_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    return {
      enabled: false,
      score: 0,
      level: 'low',
      decision: 'allow',
      reasons: ['Email guard disabled by configuration'],
      ruleHits: {},
    };
  }

  const blockedDomains = parseCsvSet(process.env.EMAIL_GUARD_BLOCKED_DOMAINS);
  const blockedSenders = parseCsvSet(process.env.EMAIL_GUARD_BLOCKED_SENDERS);
  const allowedDomains = parseCsvSet(process.env.EMAIL_GUARD_ALLOWED_DOMAINS);
  const allowlistOnly = String(process.env.EMAIL_GUARD_ALLOWLIST_ONLY || 'false').toLowerCase() === 'true';
  const quarantineScore = Number(process.env.EMAIL_GUARD_QUARANTINE_SCORE || 70);
  const reviewScore = Number(process.env.EMAIL_GUARD_REVIEW_SCORE || 45);
  const maxUrlsBeforeRisk = Number(process.env.EMAIL_GUARD_MAX_URLS_BEFORE_RISK || 4);

  const fromEmail = extractEmailAddress(email.from || '');
  const fromDomain = getDomain(fromEmail);
  const fromLocalPart = getLocalPart(fromEmail);
  const subject = cleanText(email.subject || '');
  const body = cleanText(email.body || email.snippet || '');
  const corpus = `${subject} ${body}`.trim();
  const urls = extractUrls(corpus);
  const attachments = Array.isArray(email.attachments) ? email.attachments : [];

  let score = 0;
  const reasons = [];
  const ruleHits = {
    blocked_domain: false,
    blocked_sender: false,
    allowlist_miss: false,
    suspicious_keywords: [],
    shortened_links: [],
    risky_attachments: [],
    high_link_volume: false,
    suspicious_sender_domain: false,
  };

  if (blockedDomains.has(fromDomain)) {
    score += 95;
    reasons.push(`Sender domain is blocked: ${fromDomain}`);
    ruleHits.blocked_domain = true;
  }

  if (blockedSenders.has(fromEmail)) {
    score += 100;
    reasons.push(`Sender is blocked: ${fromEmail}`);
    ruleHits.blocked_sender = true;
  }

  if (allowlistOnly && allowedDomains.size > 0 && !allowedDomains.has(fromDomain)) {
    score += 80;
    reasons.push(`Sender domain not in allowlist: ${fromDomain}`);
    ruleHits.allowlist_miss = true;
  }

  const keywordHits = SUSPICIOUS_PATTERNS.filter((pattern) => pattern.test(corpus)).map((p) => p.source);
  if (keywordHits.length > 0) {
    score += Math.min(48, keywordHits.length * 12);
    reasons.push(`Suspicious language detected (${keywordHits.length} pattern hit${keywordHits.length > 1 ? 's' : ''})`);
    ruleHits.suspicious_keywords = keywordHits;
  }

  const shortenedLinkHits = urls
    .map((url) => ({ url, domain: extractUrlDomain(url) }))
    .filter((item) => SHORTENER_DOMAINS.includes(item.domain));
  if (shortenedLinkHits.length > 0) {
    score += Math.min(40, shortenedLinkHits.length * 20);
    reasons.push(`Shortened link detected (${shortenedLinkHits.length})`);
    ruleHits.shortened_links = shortenedLinkHits;
  }

  if (urls.length > maxUrlsBeforeRisk) {
    score += 15;
    reasons.push(`High link count detected (${urls.length})`);
    ruleHits.high_link_volume = true;
  }

  const riskyAttachmentHits = attachments.filter((file) => {
    const name = String(file.filename || '').toLowerCase();
    return RISKY_EXTENSIONS.some((ext) => name.endsWith(ext));
  });
  if (riskyAttachmentHits.length > 0) {
    score += Math.min(100, riskyAttachmentHits.length * 70);
    reasons.push(`Risky attachment extension detected (${riskyAttachmentHits.length})`);
    ruleHits.risky_attachments = riskyAttachmentHits.map((f) => f.filename);
  }

  if (fromDomain.includes('xn--')) {
    score += 20;
    reasons.push('Punycode sender domain detected');
    ruleHits.suspicious_sender_domain = true;
  }

  const nonTicketHits = NON_TICKET_PATTERNS.filter((pattern) => pattern.test(corpus)).map((p) => p.source);
  const hardNonTicketHits = NON_TICKET_HARD_PATTERNS.filter((pattern) => pattern.test(corpus)).map((p) => p.source);
  const issueHits = ISSUE_PATTERNS.filter((pattern) => pattern.test(corpus)).map((p) => p.source);
  const isNotificationSender = NOTIFICATION_SENDER_LOCAL_PATTERNS.some((p) => p.test(fromLocalPart));

  if (hardNonTicketHits.length > 0 && (isNotificationSender || issueHits.length <= 1)) {
    reasons.push('Hard non-ticket system notification pattern detected');
    return {
      enabled: true,
      score: 0,
      level: 'low',
      decision: 'ignore',
      reasons,
      ruleHits: {
        ...ruleHits,
        hard_non_ticket_patterns: hardNonTicketHits,
        non_ticket_patterns: nonTicketHits,
        issue_patterns: issueHits,
        notification_sender: isNotificationSender,
      },
      context: {
        from_email: fromEmail,
        from_domain: fromDomain,
        url_count: urls.length,
        urls,
        attachments,
      },
    };
  }

  if (nonTicketHits.length > 0 && issueHits.length === 0) {
    reasons.push('Likely non-ticket email (announcement/newsletter/fyi)');
    return {
      enabled: true,
      score: 0,
      level: 'low',
      decision: 'ignore',
      reasons,
      ruleHits: {
        ...ruleHits,
        non_ticket_patterns: nonTicketHits,
        issue_patterns: issueHits,
        notification_sender: isNotificationSender,
      },
      context: {
        from_email: fromEmail,
        from_domain: fromDomain,
        url_count: urls.length,
        urls,
        attachments,
      },
    };
  }

  score = Math.max(0, Math.min(100, score));
  const level = classifyLevel(score);

  let decision = 'allow';
  if (score >= quarantineScore) decision = 'quarantine';
  else if (score >= reviewScore) decision = 'review';

  if (reasons.length === 0) {
    reasons.push('No phishing risk rule triggered');
  }

  return {
    enabled: true,
    score,
    level,
    decision,
    reasons,
    ruleHits,
    context: {
      from_email: fromEmail,
      from_domain: fromDomain,
      url_count: urls.length,
      urls,
      attachments,
    },
  };
}

async function classifyEmailIntentWithLlm(email = {}, baseAssessment = null) {
  const llmEnabled = String(process.env.EMAIL_GUARD_LLM_ENABLED || 'true').toLowerCase() !== 'false';
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!llmEnabled || !apiKey || typeof fetch !== 'function') return null;

  const model = String(process.env.EMAIL_GUARD_LLM_MODEL || process.env.AI_PRIORITY_LLM_MODEL || 'gpt-4o-mini').trim();
  const timeoutMs = Number(process.env.EMAIL_GUARD_LLM_TIMEOUT_MS || 8000);
  const maxBodyChars = Number(process.env.EMAIL_GUARD_LLM_MAX_BODY_CHARS || 3000);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  const payload = {
    from: extractEmailAddress(email.from || ''),
    to: String(email.to || '').slice(0, 300),
    subject: cleanText(email.subject || '').slice(0, 300),
    body: cleanText(email.body || email.snippet || '').slice(0, Math.max(500, maxBodyChars)),
    attachments: Array.isArray(email.attachments) ? email.attachments.map((a) => String(a.filename || '')).slice(0, 20) : [],
    rules_decision: {
      decision: baseAssessment?.decision || 'allow',
      score: Number(baseAssessment?.score || 0),
      level: String(baseAssessment?.level || 'low'),
      reasons: (baseAssessment?.reasons || []).slice(0, 10),
    },
  };

  const instruction =
    'Classify if this inbound email is a valid IT support ticket request or non-ticket noise. ' +
    'Return strict JSON only with keys: classification, confidence, reason, suggested_decision. ' +
    'classification: ticket | non_ticket | uncertain. ' +
    'suggested_decision: allow | review | ignore.';

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: instruction }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(payload) }] },
        ],
      }),
      signal: controller.signal,
    });

    const json = await response.json();
    if (!response.ok) {
      return {
        ok: false,
        model,
        reason: `LLM request failed with status ${response.status}`,
        rawOutput: json,
      };
    }

    const outputText = extractOutputText(json);
    const parsed = extractJsonObject(outputText);
    if (!parsed || typeof parsed !== 'object') {
      return {
        ok: false,
        model,
        reason: 'LLM output could not be parsed as JSON',
        rawOutput: { output_text: outputText, response: json },
      };
    }

    const classification = String(parsed.classification || '').trim().toLowerCase();
    const normalizedClassification = ['ticket', 'non_ticket', 'uncertain'].includes(classification)
      ? classification
      : 'uncertain';
    const suggestedDecision = String(parsed.suggested_decision || '').trim().toLowerCase();
    const normalizedDecision = ['allow', 'review', 'ignore'].includes(suggestedDecision) ? suggestedDecision : 'review';

    return {
      ok: true,
      model,
      classification: normalizedClassification,
      confidence: clamp01(parsed.confidence),
      reason: cleanText(parsed.reason || 'LLM email intent classification').slice(0, 500),
      suggestedDecision: normalizedDecision,
      rawOutput: {
        response_id: json.id || null,
        output_text: outputText,
      },
    };
  } catch (error) {
    return {
      ok: false,
      model,
      reason: `LLM request error: ${error.message || 'unknown error'}`,
      rawOutput: { error: error.message || String(error) },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function evaluateEmailIntakeDecision(email = {}) {
  const base = evaluateEmailRisk(email);

  if (base.decision === 'quarantine') return base;

  const llm = await classifyEmailIntentWithLlm(email, base);
  if (!llm) return base;

  const result = {
    ...base,
    reasons: [...(base.reasons || [])],
    ruleHits: { ...(base.ruleHits || {}) },
  };

  if (!llm.ok) {
    result.reasons.push(`LLM classification skipped: ${llm.reason}`);
    result.ruleHits.llm_intent = {
      used: false,
      error: llm.reason,
      model: llm.model,
    };
    return result;
  }

  const minConfidence = clamp01(process.env.EMAIL_GUARD_LLM_MIN_CONFIDENCE || 0.65);
  const autoIgnoreConfidence = clamp01(process.env.EMAIL_GUARD_LLM_AUTO_IGNORE_CONFIDENCE || 0.8);
  const autoPromoteTicketConfidence = clamp01(process.env.EMAIL_GUARD_LLM_AUTO_PROMOTE_TICKET_CONFIDENCE || 0.75);

  const llmReason = `LLM intent=${llm.classification}, confidence=${Math.round(llm.confidence * 100)}%, reason=${llm.reason}`;
  result.reasons.push(llmReason);
  result.ruleHits.llm_intent = {
    used: true,
    model: llm.model,
    classification: llm.classification,
    confidence: llm.confidence,
    suggested_decision: llm.suggestedDecision,
  };

  if (llm.classification === 'non_ticket' && llm.confidence >= autoIgnoreConfidence) {
    result.decision = 'ignore';
    return result;
  }

  if (llm.classification === 'ticket' && llm.confidence >= autoPromoteTicketConfidence) {
    if (result.decision === 'ignore') {
      result.decision = 'review';
    }
    return result;
  }

  if (llm.classification === 'uncertain' && llm.confidence >= minConfidence && result.decision === 'allow') {
    result.decision = 'review';
  }

  return result;
}

function isMissingSchemaError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR';
}

async function saveEmailGuardRecord({ email, assessment }) {
  try {
    const [result] = await db.query(
      `INSERT INTO incoming_email_quarantine (
         gmail_message_id, gmail_thread_id, from_email, to_email, subject, body_snippet,
         risk_score, risk_level, decision, reasons_json, rule_hits_json, urls_json, attachments_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email.id || null,
        email.threadId || null,
        assessment?.context?.from_email || extractEmailAddress(email.from || ''),
        String(email.to || '').slice(0, 500) || null,
        String(email.subject || '').slice(0, 255) || 'No Subject',
        String(email.snippet || email.body || '').slice(0, 2000) || null,
        Number(assessment?.score || 0),
        assessment?.level || 'medium',
        assessment?.decision || 'quarantine',
        JSON.stringify(assessment?.reasons || []),
        JSON.stringify(assessment?.ruleHits || {}),
        JSON.stringify(assessment?.context?.urls || []),
        JSON.stringify(assessment?.context?.attachments || []),
      ]
    );
    return result.insertId;
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn('incoming_email_quarantine table is missing. Run email guard migration.');
      return null;
    }
    throw error;
  }
}

module.exports = {
  evaluateEmailRisk,
  evaluateEmailIntakeDecision,
  saveEmailGuardRecord,
};
