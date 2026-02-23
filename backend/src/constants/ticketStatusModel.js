const STATUS_MODEL = [
  { code: 'new', label: 'New', list: 'new', terminal: false },
  { code: 'open', label: 'Open', list: 'active', terminal: false },
  { code: 'in_progress', label: 'In Progress', list: 'active', terminal: false },
  { code: 'reopened', label: 'Reopened', list: 'active', terminal: false },
  { code: 'resolved', label: 'Resolved', list: 'complete', terminal: true },
  { code: 'closed', label: 'Closed', list: 'complete', terminal: true },
  { code: 'deleted', label: 'Deleted', list: 'complete', terminal: true },
];

const STATUS_TRANSITIONS = {
  new: ['open', 'in_progress', 'resolved', 'closed', 'deleted'],
  open: ['in_progress', 'resolved', 'closed', 'deleted'],
  in_progress: ['resolved', 'closed', 'deleted'],
  resolved: ['reopened', 'closed', 'deleted'],
  reopened: ['in_progress', 'resolved', 'closed', 'deleted'],
  closed: ['reopened', 'deleted'],
  deleted: [],
};

function getStatusModelResponse() {
  return {
    statuses: STATUS_MODEL,
    transitions: STATUS_TRANSITIONS,
  };
}

function getAllowedStatuses() {
  return STATUS_MODEL.map((s) => s.code);
}

function canTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return true;
  const allowed = STATUS_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

module.exports = {
  STATUS_MODEL,
  STATUS_TRANSITIONS,
  getStatusModelResponse,
  getAllowedStatuses,
  canTransition,
};
