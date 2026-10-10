// ============================================================
// Fluba Brain Connector - Kingdom Connects
// HMAC-signed HTTPS proxy — matches Fluba brainProxyRoute spec
// ============================================================

const express = require('express');
const router  = express.Router();
const admin   = require('firebase-admin');
const crypto  = require('crypto');

const SITE_ID = 'kingdom-connects';

// ── Config from env vars ──────────────────────────────────────
// FLUBA_BRAIN_URL  - set once Fluba deploys brainIngressHttp
// FLUBA_SITE_SECRET - shared HMAC secret (Dave sets this)
//                    falls back to KC-API-KEY if not set
function getSecret() {
  return process.env.FLUBA_SITE_SECRET || process.env['KC-API-KEY'];
}

function getBrainUrl() {
  return process.env.FLUBA_BRAIN_URL
    || 'https://us-central1-flubadesigns-25482.cloudfunctions.net/brainIngressHttp';
}

function getStatusUrl() {
  return process.env.FLUBA_STATUS_URL
    || 'https://us-central1-flubadesigns-25482.cloudfunctions.net/brainStatusHttp';
}

// ── HMAC sign (matches Fluba spec exactly) ────────────────────
function sign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// ── Verify KC user from Authorization header ──────────────────
async function verifyKcUser(req) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// POST /api/brain/submit
// Body: { action, payload? }
// Signs { action, payload } and forwards to Fluba ingress
// ────────────────────────────────────────────────────────────
router.post('/submit', async (req, res) => {
  const user = await verifyKcUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const { action, payload = {} } = req.body || {};
  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'action is required' });
  }

  const secret = getSecret();
  if (!secret) return res.status(500).json({ error: 'FLUBA_SITE_SECRET not configured' });

  // Sign exactly { action, payload } — matches Fluba verification
  const body = { action, payload };
  const raw  = JSON.stringify(body);
  const sig  = sign(secret, raw);

  try {
    const flubaRes = await fetch(getBrainUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-site-id':    SITE_ID,
        'x-signature':  sig
      },
      body: raw
    });

    const data = await flubaRes.json();

    if (!flubaRes.ok) {
      console.error('[Brain] Fluba error:', flubaRes.status, data);
      return res.status(502).json({ error: data?.error || `Fluba returned ${flubaRes.status}` });
    }

    return res.json(data);
  } catch (err) {
    console.error('[Brain] Submit error:', err.message);
    return res.status(502).json({ error: 'Failed to reach Fluba Brain' });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/brain/status/:requestId
// Polls Fluba for brain_responses result
// ────────────────────────────────────────────────────────────
router.get('/status/:requestId', async (req, res) => {
  const user = await verifyKcUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const secret = getSecret();
  if (!secret) return res.status(500).json({ error: 'FLUBA_SITE_SECRET not configured' });

  const { requestId } = req.params;
  const body = { requestId };
  const raw  = JSON.stringify(body);
  const sig  = sign(secret, raw);

  try {
    const flubaRes = await fetch(getStatusUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-site-id':    SITE_ID,
        'x-signature':  sig
      },
      body: raw
    });

    const data = await flubaRes.json();

    if (!flubaRes.ok) {
      return res.status(502).json({ error: data?.error || `Fluba returned ${flubaRes.status}` });
    }

    return res.json(data);
  } catch (err) {
    console.error('[Brain] Status error:', err.message);
    return res.status(502).json({ error: 'Failed to reach Fluba Brain status endpoint' });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/brain/health
// ────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  const secret = getSecret();
  res.json({
    available:  !!secret,
    siteId:     SITE_ID,
    submitUrl:  getBrainUrl(),
    statusUrl:  getStatusUrl(),
    secretFrom: process.env.FLUBA_SITE_SECRET ? 'FLUBA_SITE_SECRET' : 'KC-API-KEY (fallback)',
    message:    secret ? 'Brain connector ready' : 'No secret configured'
  });
});

function initBrain() {
  const secret = getSecret();
  console.log(`[Brain] HMAC connector loaded - siteId: ${SITE_ID}, secret: ${secret ? 'OK' : 'MISSING'}`);
}

module.exports = { router, initBrain };
