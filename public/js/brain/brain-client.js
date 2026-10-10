// ============================================================
// Fluba Brain Client - Kingdom Connects
// Submits requests to the Universal Brain via KC's server relay
// ============================================================

import { auth } from '../firebase-config.js';

const BRAIN_API = '/api/brain';
const DEFAULT_POLL_TIMEOUT = 30000;
const POLL_INTERVAL = 1000;

async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be signed in to use Brain');
  return user.getIdToken();
}

// ──────────────────────────────────────────────
// submitToBrain({ action, payload, idempotencyKey? })
// Returns { requestId, traceId, status }
// ──────────────────────────────────────────────
async function submitToBrain({ action, payload = {}, idempotencyKey = null } = {}) {
  const token = await getIdToken();

  const res = await fetch(`${BRAIN_API}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ action, payload, idempotencyKey })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Brain submit failed (${res.status})`);
  }

  return res.json();
}

// ──────────────────────────────────────────────
// getBrainStatus(requestId)
// Returns { status, result?, traceId? }
// status: 'pending' | 'done' | 'error'
// ──────────────────────────────────────────────
async function getBrainStatus(requestId) {
  const token = await getIdToken();

  const res = await fetch(`${BRAIN_API}/status/${requestId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Brain status failed (${res.status})`);
  }

  return res.json();
}

// ──────────────────────────────────────────────
// waitForBrainResponse(requestId, options?)
// Polls until done or timeout. Returns result.
// options: { timeout?, onPoll? }
// ──────────────────────────────────────────────
async function waitForBrainResponse(requestId, { timeout = DEFAULT_POLL_TIMEOUT, onPoll } = {}) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const data = await getBrainStatus(requestId);

    if (onPoll) onPoll(data);

    if (data.status === 'done') return data.result;
    if (data.status === 'error') throw new Error('Brain returned an error');

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error(`Brain response timed out after ${timeout}ms`);
}

// ──────────────────────────────────────────────
// askBrain(prompt, options?)
// Convenience: submit ask_brain action and wait
// ──────────────────────────────────────────────
async function askBrain(prompt, options = {}) {
  const { requestId } = await submitToBrain({
    action: 'ask_brain',
    payload: { prompt },
    idempotencyKey: options.idempotencyKey || null
  });

  return waitForBrainResponse(requestId, options);
}

// ──────────────────────────────────────────────
// isBrainAvailable()
// Check if connector is configured on the server
// ──────────────────────────────────────────────
async function isBrainAvailable() {
  try {
    const res = await fetch(`${BRAIN_API}/health`);
    const data = await res.json();
    return data.available === true;
  } catch {
    return false;
  }
}

export {
  submitToBrain,
  getBrainStatus,
  waitForBrainResponse,
  askBrain,
  isBrainAvailable
};
