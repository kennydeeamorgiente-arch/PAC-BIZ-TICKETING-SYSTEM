const DEFAULT_TEMPLATES = [
  {
    code: 'acknowledge',
    name: 'Acknowledge Ticket',
    subject: '[{{ticket_number}}] Ticket Received',
    body: 'Hi {{requester_name}}, we received your ticket and our IT team is reviewing it now.',
  },
  {
    code: 'need_more_info',
    name: 'Request More Details',
    subject: '[{{ticket_number}}] Additional Information Needed',
    body: 'Hi {{requester_name}}, please share device name, exact error message, and when it started.',
  },
  {
    code: 'resolved_check',
    name: 'Resolution Verification',
    subject: '[{{ticket_number}}] Please Verify Resolution',
    body: 'Hi {{requester_name}}, we applied a fix. Please confirm if the issue is now resolved.',
  },
  {
    code: 'closure_notice',
    name: 'Closure Notice',
    subject: '[{{ticket_number}}] Ticket Closure',
    body: 'Hi {{requester_name}}, we will close this ticket if no further issue is reported.',
  },
];

function renderString(template, vars = {}) {
  let out = String(template || '');
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value == null ? '' : String(value));
  }
  return out;
}

function getTemplates() {
  return DEFAULT_TEMPLATES;
}

function renderTemplate(code, vars = {}) {
  const tpl = DEFAULT_TEMPLATES.find((t) => t.code === code);
  if (!tpl) return null;
  return {
    code: tpl.code,
    name: tpl.name,
    subject: renderString(tpl.subject, vars),
    body: renderString(tpl.body, vars),
  };
}

module.exports = {
  getTemplates,
  renderTemplate,
};

