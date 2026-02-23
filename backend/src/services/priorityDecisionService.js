const db = require('../config/database');

const PRIORITY_CODES = ['low', 'medium', 'high', 'critical'];

const HARD_CRITICAL_PATTERNS = [
  /server\s+down/i,
  /system\s+down/i,
  /production\s+down/i,
  /all\s+users?\s+(cannot|can't|unable)/i,
  /company[-\s]?wide\s+outage/i,
  /ransomware|data\s+breach|security\s+incident/i,
  /payment\s+gateway\s+down|cannot\s+process\s+payments?/i,
];

const HIGH_PATTERNS = [
  /cannot\s+login/i,
  /can't\s+login/i,
  /unable\s+to\s+login/i,
  /vpn\s+(down|issue|problem)/i,
  /email\s+down/i,
  /internet\s+down/i,
  /network\s+(down|outage)/i,
  /urgent|asap|immediately|right\s+now/i,
  /printer\s+down/i,
  /pos\s+offline/i,
];

const LOW_PATTERNS = [
  /request|schedule|enhancement|improvement/i,
  /how\s+to|help\s+me\s+with/i,
  /minor|cosmetic|typo/i,
  /feature\s+request/i,
];

const IMPACT_SCOPE_PATTERNS = [
  /all\s+users?/i,
  /entire\s+(company|office|branch|site)/i,
  /company[-\s]?wide/i,
  /no\s+one\s+can\s+access/i,
  /operations?\s+(are\s+)?blocked/i,
  /cannot\s+work/i,
  /business\s+halted/i,
];

const URGENCY_PATTERNS = [
  /urgent|asap|immediately|right\s+now/i,
  /critical|highest\s+priority/i,
  /before\s+eod|today/i,
];

const AUTOMATED_SENDER_PATTERNS = [/^no-?reply@/i, /^notifications?@/i, /^mailer-daemon@/i];

const AI_MODES = ['rules_only', 'hybrid_llm', 'llm_only'];

function normalizePriorityCode(code, fallback = 'medium') {
  const normalized = String(code || '').trim().toLowerCase();
  if (PRIORITY_CODES.includes(normalized)) return normalized;
  return fallback;
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

function normalizeMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  return AI_MODES.includes(normalized) ? normalized : 'rules_only';
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

function getPatternHits(patterns, text) {
  const corpus = String(text || '');
  return patterns.filter((pattern) => pattern.test(corpus)).map((pattern) => pattern.source);
}

function mergeUniqueHits(...groups) {
  return [...new Set(groups.flat().filter(Boolean))];
}

function parseEmailDomain(fromEmail = '') {
  const email = String(fromEmail || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  return at > -1 ? email.slice(at + 1) : '';
}

function evaluateRules({ subject, bodyText, fromEmail = null, intakeSource = 'portal' }) {
  const subjectText = cleanText(subject);
  const body = cleanText(bodyText);
  const corpus = `${subjectText} ${body}`.trim();

  const subjectHardHits = getPatternHits(HARD_CRITICAL_PATTERNS, subjectText);
  const bodyHardHits = getPatternHits(HARD_CRITICAL_PATTERNS, body);
  const hardHits = mergeUniqueHits(subjectHardHits, bodyHardHits);

  if (hardHits.length > 0) {
    const evidenceCount = hardHits.length;
    const confidence = clamp01(0.9 + Math.min(0.09, evidenceCount * 0.03));
    return {
      predictedPriorityCode: 'critical',
      confidence,
      reason: `Hard critical signal matched (${evidenceCount}).`,
      ruleHits: {
        hard: hardHits,
        high: [],
        low: [],
        impact_scope: [],
        urgency: [],
        scoring: {
          severity_score: 100,
          evidence_count: evidenceCount,
          source: intakeSource || 'portal',
          from_domain: parseEmailDomain(fromEmail),
        },
      },
      hardMatch: true,
    };
  }

  const subjectHighHits = getPatternHits(HIGH_PATTERNS, subjectText);
  const bodyHighHits = getPatternHits(HIGH_PATTERNS, body);
  const highHits = mergeUniqueHits(subjectHighHits, bodyHighHits);

  const subjectLowHits = getPatternHits(LOW_PATTERNS, subjectText);
  const bodyLowHits = getPatternHits(LOW_PATTERNS, body);
  const lowHits = mergeUniqueHits(subjectLowHits, bodyLowHits);

  const subjectImpactHits = getPatternHits(IMPACT_SCOPE_PATTERNS, subjectText);
  const bodyImpactHits = getPatternHits(IMPACT_SCOPE_PATTERNS, body);
  const impactHits = mergeUniqueHits(subjectImpactHits, bodyImpactHits);

  const subjectUrgencyHits = getPatternHits(URGENCY_PATTERNS, subjectText);
  const bodyUrgencyHits = getPatternHits(URGENCY_PATTERNS, body);
  const urgencyHits = mergeUniqueHits(subjectUrgencyHits, bodyUrgencyHits);

  const evidenceCount = highHits.length + lowHits.length + impactHits.length + urgencyHits.length;
  const subjectEvidenceCount =
    subjectHighHits.length + subjectLowHits.length + subjectImpactHits.length + subjectUrgencyHits.length;
  const mixedSignals = highHits.length > 0 && lowHits.length > 0;
  const sparseText = subjectText.length < 16 && body.length < 50;

  let severityScore = 48;
  severityScore += subjectHighHits.length * 15 + bodyHighHits.length * 9;
  severityScore += subjectImpactHits.length * 18 + bodyImpactHits.length * 12;
  severityScore += subjectUrgencyHits.length * 8 + bodyUrgencyHits.length * 5;
  severityScore -= subjectLowHits.length * 12 + bodyLowHits.length * 8;

  if (mixedSignals) severityScore -= 6;
  if (sparseText) severityScore -= 7;

  const sender = String(fromEmail || '').trim().toLowerCase();
  const senderDomain = parseEmailDomain(sender);
  const automatedSender = AUTOMATED_SENDER_PATTERNS.some((pattern) => pattern.test(sender));
  const internalDomain = senderDomain.endsWith('pac-biz.com');

  if (intakeSource === 'email') severityScore += 2;
  if (automatedSender && highHits.length === 0 && impactHits.length === 0) severityScore -= 8;
  if (internalDomain && impactHits.length > 0) severityScore += 4;

  severityScore = Math.max(0, Math.min(100, severityScore));

  let predictedPriorityCode = 'medium';
  if (severityScore >= 83) predictedPriorityCode = 'critical';
  else if (severityScore >= 60) predictedPriorityCode = 'high';
  else if (severityScore <= 28) predictedPriorityCode = 'low';

  let distanceFromBoundary = 0;
  if (predictedPriorityCode === 'critical') {
    distanceFromBoundary = Math.max(0, severityScore - 83);
  } else if (predictedPriorityCode === 'high') {
    distanceFromBoundary = Math.min(Math.max(0, severityScore - 60), Math.max(0, 83 - severityScore));
  } else if (predictedPriorityCode === 'low') {
    distanceFromBoundary = Math.max(0, 28 - severityScore);
  } else {
    distanceFromBoundary = Math.min(Math.max(0, severityScore - 28), Math.max(0, 60 - severityScore));
  }

  const evidenceFactor = Math.min(1, evidenceCount / 7);
  const marginFactor = Math.min(1, distanceFromBoundary / 20);

  let confidence =
    0.42 +
    evidenceFactor * 0.24 +
    marginFactor * 0.2 +
    (subjectEvidenceCount > 0 ? 0.05 : 0) +
    (internalDomain ? 0.02 : 0) -
    (mixedSignals ? 0.1 : 0) -
    (sparseText ? 0.08 : 0);

  if (predictedPriorityCode === 'critical') confidence += 0.08;
  if (automatedSender && predictedPriorityCode !== 'critical') confidence -= 0.05;

  confidence = clamp01(confidence);

  const reasonParts = [];
  if (impactHits.length > 0) reasonParts.push(`${impactHits.length} impact signal${impactHits.length > 1 ? 's' : ''}`);
  if (highHits.length > 0) reasonParts.push(`${highHits.length} high-priority signal${highHits.length > 1 ? 's' : ''}`);
  if (urgencyHits.length > 0) reasonParts.push(`${urgencyHits.length} urgency signal${urgencyHits.length > 1 ? 's' : ''}`);
  if (lowHits.length > 0) reasonParts.push(`${lowHits.length} low-priority signal${lowHits.length > 1 ? 's' : ''}`);

  const reason =
    reasonParts.length > 0
      ? `Rules score ${Math.round(severityScore)} from ${reasonParts.join(', ')}.`
      : `Rules score ${Math.round(severityScore)} with limited priority indicators.`;

  return {
    predictedPriorityCode,
    confidence,
    reason,
    ruleHits: {
      hard: [],
      high: highHits,
      low: lowHits,
      impact_scope: impactHits,
      urgency: urgencyHits,
      scoring: {
        severity_score: Math.round(severityScore),
        evidence_count: evidenceCount,
        subject_signal_count: subjectEvidenceCount,
        mixed_signals: mixedSignals,
        sparse_text: sparseText,
        intake_source: intakeSource || 'portal',
        from_domain: senderDomain || null,
        automated_sender: automatedSender,
      },
    },
    hardMatch: false,
  };
}

async function evaluateWithLlm({ subject, bodyText, fromEmail, intakeSource, rulesEvaluation }) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;
  if (typeof fetch !== 'function') return null;

  const model = String(process.env.AI_PRIORITY_LLM_MODEL || 'gpt-4o-mini').trim();
  const timeoutMs = Number(process.env.AI_PRIORITY_LLM_TIMEOUT_MS || 10000);
  const maxBodyChars = Number(process.env.AI_PRIORITY_LLM_MAX_BODY_CHARS || 3000);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  const payload = {
    intake_source: intakeSource || 'portal',
    from_email: cleanText(fromEmail || '').slice(0, 200) || null,
    subject: cleanText(subject).slice(0, 300),
    body_text: cleanText(bodyText).slice(0, Math.max(500, maxBodyChars)),
    rules_prediction: {
      priority: rulesEvaluation?.predictedPriorityCode || 'medium',
      confidence: Number(rulesEvaluation?.confidence || 0),
      hard_match: Boolean(rulesEvaluation?.hardMatch),
      reason: String(rulesEvaluation?.reason || ''),
    },
  };

  const instruction =
    'Classify IT support ticket priority using all available fields (subject, body, sender, intake source, and rule context), and return strict JSON only. ' +
    'Required keys: predicted_priority_code, confidence, reason. ' +
    'Priority must be one of low, medium, high, critical. confidence must be 0..1.';

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
        provider: 'openai',
        modelName: model,
        reason: `LLM request failed with status ${response.status}`,
        rawOutput: json,
      };
    }

    const outputText = extractOutputText(json);
    const parsed = extractJsonObject(outputText);
    if (!parsed || typeof parsed !== 'object') {
      return {
        ok: false,
        provider: 'openai',
        modelName: model,
        reason: 'LLM output could not be parsed as JSON',
        rawOutput: { output_text: outputText, response: json },
      };
    }

    return {
      ok: true,
      provider: 'openai',
      modelName: model,
      predictedPriorityCode: normalizePriorityCode(parsed.predicted_priority_code, 'medium'),
      confidence: clamp01(parsed.confidence),
      reason: cleanText(parsed.reason || 'LLM classified ticket priority').slice(0, 500),
      rawOutput: {
        response_id: json.id || null,
        output_text: outputText,
      },
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'openai',
      modelName: model,
      reason: `LLM request error: ${error.message || 'unknown error'}`,
      rawOutput: { error: error.message || String(error) },
    };
  } finally {
    clearTimeout(timer);
  }
}

function toDecision({
  predictedPriorityCode,
  confidence,
  reason,
  ruleHits,
  hardMatch = false,
  mode = 'rules_only',
  provider = 'rules_engine',
  intakeSource = 'portal',
  modelName = null,
  promptVersion = 'rules-v1',
  rawOutput = null,
}) {
  const threshold = Number(process.env.AI_PRIORITY_AUTO_APPLY_THRESHOLD || 0.8);
  const isAutoApplied = hardMatch || confidence >= threshold;
  const appliedPriorityCode = isAutoApplied ? predictedPriorityCode : 'medium';

  return {
    mode,
    provider,
    modelName,
    promptVersion,
    intakeSource,
    predictedPriorityCode: normalizePriorityCode(predictedPriorityCode),
    appliedPriorityCode: normalizePriorityCode(appliedPriorityCode),
    confidence: Number(confidence || 0),
    reason: String(reason || '').slice(0, 500),
    ruleHits: ruleHits || {},
    rawOutput,
    isAutoApplied,
    needsReview: !isAutoApplied,
  };
}

async function decideTicketPriority({
  subject,
  bodyText,
  fromEmail = null,
  explicitPriorityCode = null,
  intakeSource = 'portal',
}) {
  const enabled = String(process.env.AI_PRIORITY_ENABLED || 'true').toLowerCase() !== 'false';
  const mode = normalizeMode(process.env.AI_PRIORITY_MODE || 'rules_only');

  const explicit = String(explicitPriorityCode || '').trim().toLowerCase();
  if (explicit && PRIORITY_CODES.includes(explicit)) {
    return toDecision({
      predictedPriorityCode: explicit,
      confidence: 1,
      reason: 'Explicit priority provided by user input',
      ruleHits: { hard: [], high: [], low: [] },
      hardMatch: true,
      mode: 'manual_input',
      provider: 'manual_input',
      intakeSource,
      promptVersion: 'manual-v1',
    });
  }

  if (!enabled) {
    return toDecision({
      predictedPriorityCode: 'medium',
      confidence: 0.5,
      reason: 'Priority intelligence disabled by configuration',
      ruleHits: { hard: [], high: [], low: [] },
      hardMatch: false,
      mode: 'disabled',
      provider: 'disabled',
      intakeSource,
      promptVersion: 'disabled-v1',
    });
  }

  const evaluated = evaluateRules({ subject, bodyText, fromEmail, intakeSource });

  if (mode === 'rules_only') {
    return toDecision({
      ...evaluated,
      mode: 'rules_only',
      provider: 'rules_engine',
      intakeSource,
      promptVersion: 'rules-v1',
    });
  }

  const llmResult = await evaluateWithLlm({
    subject,
    bodyText,
    fromEmail,
    intakeSource,
    rulesEvaluation: evaluated,
  });

  if (mode === 'llm_only') {
    if (llmResult?.ok) {
      return toDecision({
        predictedPriorityCode: llmResult.predictedPriorityCode,
        confidence: llmResult.confidence,
        reason: llmResult.reason,
        ruleHits: { hard: [], high: [], low: [], llm: true },
        hardMatch: false,
        mode: 'llm_only',
        provider: llmResult.provider || 'openai',
        intakeSource,
        modelName: llmResult.modelName || null,
        promptVersion: 'llm-v1',
        rawOutput: llmResult.rawOutput || null,
      });
    }

    return toDecision({
      ...evaluated,
      reason: `LLM unavailable in llm_only mode. Fallback to rules-based decision. ${llmResult?.reason || ''}`.trim(),
      ruleHits: {
        ...(evaluated.ruleHits || {}),
        llm: {
          error: llmResult?.reason || 'unknown',
          fallback: 'rules_only',
        },
      },
      hardMatch: Boolean(evaluated.hardMatch),
      mode: 'llm_only',
      provider: 'rules_engine_fallback',
      intakeSource,
      modelName: llmResult?.modelName || null,
      promptVersion: 'llm-v1',
      rawOutput: llmResult?.rawOutput || null,
    });
  }

  if (evaluated.hardMatch) {
    return toDecision({
      ...evaluated,
      mode: 'hybrid_llm',
      provider: 'rules_engine',
      intakeSource,
      modelName: llmResult?.modelName || null,
      promptVersion: 'hybrid-v1',
      rawOutput: llmResult?.rawOutput || null,
    });
  }

  if (llmResult?.ok) {
    const agreed = llmResult.predictedPriorityCode === evaluated.predictedPriorityCode;
    const blendedConfidence = clamp01(Number(llmResult.confidence || 0.6) + (agreed ? 0.08 : -0.05));

    return toDecision({
      predictedPriorityCode: llmResult.predictedPriorityCode,
      confidence: blendedConfidence,
      reason: llmResult.reason,
      ruleHits: {
        hard: evaluated.ruleHits?.hard || [],
        high: evaluated.ruleHits?.high || [],
        low: evaluated.ruleHits?.low || [],
        llm: {
          predicted: llmResult.predictedPriorityCode,
          base_confidence: llmResult.confidence,
          agreed_with_rules: agreed,
        },
      },
      hardMatch: false,
      mode: 'hybrid_llm',
      provider: llmResult.provider || 'openai',
      intakeSource,
      modelName: llmResult.modelName || null,
      promptVersion: 'hybrid-v1',
      rawOutput: llmResult.rawOutput || null,
    });
  }

  return toDecision({
    ...evaluated,
    reason: `Hybrid mode fallback to rules. ${llmResult?.reason || ''}`.trim(),
    mode: 'hybrid_llm',
    provider: 'rules_engine_fallback',
    intakeSource,
    modelName: llmResult?.modelName || null,
    promptVersion: 'hybrid-v1',
    rawOutput: llmResult?.rawOutput || null,
  });
}

async function getPriorityId(priorityCode, fallback = 'medium') {
  const code = normalizePriorityCode(priorityCode, fallback);
  const [rows] = await db.query('SELECT id FROM ticket_priorities WHERE priority_code = ? LIMIT 1', [code]);
  if (rows.length > 0) return rows[0].id;

  const [fallbackRows] = await db.query('SELECT id FROM ticket_priorities WHERE priority_code = ? LIMIT 1', [fallback]);
  return fallbackRows.length ? fallbackRows[0].id : null;
}

function isMissingSchemaError(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR';
}

async function recordPriorityInference({ ticketId, decision, actorUserId = null }) {
  if (!ticketId || !decision) return null;

  try {
    const [result] = await db.query(
      `INSERT INTO ai_inferences (
         ticket_id, intake_source, provider, model_name, mode, prompt_version,
         predicted_priority_code, applied_priority_code, confidence, decision_reason,
         rule_hits, raw_output, is_auto_applied, needs_review, reviewed_by_user_id, reviewed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ticketId,
        decision.intakeSource || 'portal',
        decision.provider || 'rules_engine',
        decision.modelName || null,
        decision.mode || 'rules_only',
        decision.promptVersion || null,
        decision.predictedPriorityCode,
        decision.appliedPriorityCode,
        Number(decision.confidence || 0),
        decision.reason || null,
        JSON.stringify(decision.ruleHits || {}),
        decision.rawOutput ? JSON.stringify(decision.rawOutput) : null,
        decision.isAutoApplied ? 1 : 0,
        decision.needsReview ? 1 : 0,
        decision.needsReview ? null : actorUserId,
        decision.needsReview ? null : new Date(),
      ]
    );

    return result.insertId;
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn('Priority inference table not found yet. Run AI phase-1 migration.');
      return null;
    }
    throw error;
  }
}

async function recordPriorityHistory({
  ticketId,
  oldPriorityId = null,
  newPriorityId,
  changedByUserId = null,
  changeSource = 'system',
  reason = null,
  inferenceId = null,
}) {
  if (!ticketId || !newPriorityId) return null;

  try {
    const [result] = await db.query(
      `INSERT INTO ticket_priority_history
         (ticket_id, old_priority_id, new_priority_id, changed_by_user_id, change_source, reason, inference_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, oldPriorityId, newPriorityId, changedByUserId, changeSource, reason, inferenceId]
    );
    return result.insertId;
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn('Priority history table not found yet. Run AI phase-1 migration.');
      return null;
    }
    throw error;
  }
}

async function getLatestPriorityInference(ticketId) {
  try {
    const [rows] = await db.query(
      `SELECT id, ticket_id, intake_source, provider, model_name, mode, prompt_version,
              predicted_priority_code, applied_priority_code, confidence, decision_reason,
              rule_hits, raw_output, is_auto_applied, needs_review, reviewed_by_user_id, reviewed_at, created_at
       FROM ai_inferences
       WHERE ticket_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [ticketId]
    );
    return rows.length ? rows[0] : null;
  } catch (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
}

async function getPriorityHistory(ticketId) {
  try {
    const [rows] = await db.query(
      `SELECT tph.id, tph.ticket_id, tph.created_at, tph.change_source, tph.reason,
              oldp.priority_code AS old_priority,
              newp.priority_code AS new_priority,
              changer.full_name AS changed_by_name
       FROM ticket_priority_history tph
       LEFT JOIN ticket_priorities oldp ON oldp.id = tph.old_priority_id
       INNER JOIN ticket_priorities newp ON newp.id = tph.new_priority_id
       LEFT JOIN users changer ON changer.id = tph.changed_by_user_id
       WHERE tph.ticket_id = ?
       ORDER BY tph.id DESC`,
      [ticketId]
    );
    return rows;
  } catch (error) {
    if (isMissingSchemaError(error)) return [];
    throw error;
  }
}

module.exports = {
  decideTicketPriority,
  getPriorityId,
  recordPriorityInference,
  recordPriorityHistory,
  getLatestPriorityInference,
  getPriorityHistory,
  normalizePriorityCode,
};
