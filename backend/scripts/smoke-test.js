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

  const createRes = await fetch(`${API_BASE_URL}/tickets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${loginData.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `Smoke Ticket Lock ${Date.now()}`,
      description: 'Smoke test ticket for lock/unlock endpoints.',
      priority: 'medium',
    }),
  });
  const createData = await parseJsonSafe(createRes);
  const createdTicketId = createData?.data?.id || createData?.data?.ticket?.id || createData?.data?.ticket_id || null;
  if (!createRes.ok || !createdTicketId) {
    throw new Error(`Create ticket failed: ${JSON.stringify(createData)}`);
  }
  console.log('OK: /tickets (create)');

  const lockRes = await fetch(`${API_BASE_URL}/tickets/${createdTicketId}/lock`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${loginData.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const lockData = await parseJsonSafe(lockRes);
  const lockRow = lockData?.data || null;
  if (!lockRes.ok || !lockRow?.is_locked || Number(lockRow.locked_by_user_id || 0) !== Number(meData.id)) {
    throw new Error(`Lock ticket failed: ${JSON.stringify(lockData)}`);
  }
  console.log('OK: /tickets/:id/lock (lock)');

  const unlockRes = await fetch(`${API_BASE_URL}/tickets/${createdTicketId}/lock`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  const unlockData = await parseJsonSafe(unlockRes);
  const unlockRow = unlockData?.data || null;
  if (!unlockRes.ok || unlockRow?.is_locked) {
    throw new Error(`Unlock ticket failed: ${JSON.stringify(unlockData)}`);
  }
  console.log('OK: /tickets/:id/lock (unlock)');

  console.log('Smoke test passed.');
}

run().catch((error) => {
  console.error('Smoke test failed.');
  console.error(error.message || error);
  process.exit(1);
});
