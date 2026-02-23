export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMinutes(minutes) {
  const total = Number(minutes || 0);
  if (!Number.isFinite(total) || total <= 0) return '0m';
  if (total < 60) return `${Math.round(total)}m`;
  return `${Math.floor(total / 60)}h ${Math.round(total % 60)}m`;
}

export function truncate(str = '', length = 80) {
  const value = String(str);
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

export function getInitials(name = '') {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function toQueryString(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}
