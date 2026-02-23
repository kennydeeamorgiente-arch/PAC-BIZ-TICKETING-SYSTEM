/* eslint-disable no-console */
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api';
const SMOKE_EMAIL = process.env.SMOKE_EMAIL || 'admin@company.com';
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || 'admin123';

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function run() {
  console.log(`Smoke test started against ${API_BASE_URL}`);

  const healthRes = await fetch(`${API_BASE_URL}/health`);
  const healthData = await parseJsonSafe(healthRes);
  if (!healthRes.ok || !healthData?.success) {
    throw new Error(`Health check failed: ${JSON.stringify(healthData)}`);
  }
  console.log('OK: /health');

  const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
  });
  const loginData = await parseJsonSafe(loginRes);
  if (!loginRes.ok || !loginData?.token) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }
  console.log('OK: /auth/login');

  const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  const meData = await parseJsonSafe(meRes);
  if (!meRes.ok || !meData?.id) {
    throw new Error(`/auth/me failed: ${JSON.stringify(meData)}`);
  }
  console.log('OK: /auth/me');

  console.log('Smoke test passed.');
}

run().catch((error) => {
  console.error('Smoke test failed.');
  console.error(error.message || error);
  process.exit(1);
});
