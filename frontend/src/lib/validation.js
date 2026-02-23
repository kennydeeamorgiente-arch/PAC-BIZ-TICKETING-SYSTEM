export function required(value) {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

export function validateEmail(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

export function validatePassword(pwd = '') {
  if (pwd.length < 8) return 'At least 8 characters required';
  if (!/[A-Z]/.test(pwd)) return 'At least one uppercase letter required';
  if (!/[0-9]/.test(pwd)) return 'At least one number required';
  return null;
}

export function sanitizeText(str = '') {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

export function validateTicketComment(text = '') {
  const clean = String(text).trim();
  if (!clean) return 'Comment cannot be empty';
  if (clean.length > 5000) return 'Comment too long (max 5,000 characters)';
  return null;
}
