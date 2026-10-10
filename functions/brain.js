// ============================================================
// Brain Connector Cloud Functions - Kingdom Connects
// HMAC-signed proxy to Fluba Brain ingress
// ============================================================

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const cors = require('cors')({ origin: true });

const flubaSiteSecret = defineSecret('FLUBA_SITE_SECRET');

const SITE_ID        = 'kingdom-connects';
const FLUBA_SUBMIT   = 'https://us-central1-flubadesigns-25482.cloudfunctions.net/brainIngressHttp';
const FLUBA_STATUS   = 'https://us-central1-flubadesigns-25482.cloudfunctions.net/brainStatusHttp';
const REGION         = 'us-central1';

function sign(secret, rawBody) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

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

// ── POST /api/brain/submit ────────────────────────────────────
exports.brainProxy = onRequest(
  { region: REGION, secrets: ['FLUBA_SITE_SECRET'] },
  (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const user = await verifyKcUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const { action, payload = {} } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action is required' });

    const secret  = flubaSiteSecret.value();
    const body    = { action, payload };
    const raw     = JSON.stringify(body);
    const sig     = sign(secret, raw);

    try {
      const r = await fetch(FLUBA_SUBMIT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-site-id':    SITE_ID,
          'x-signature':  sig
        },
        body: raw
      });
      const data = await r.json();
      if (!r.ok) {
        console.error('[Brain] Fluba error:', r.status, data);
        return res.status(502).json({ error: data?.error || `Fluba returned ${r.status}` });
      }
      return res.json(data);
    } catch (err) {
      console.error('[Brain] Submit error:', err.message);
      return res.status(502).json({ error: 'Failed to reach Fluba Brain' });
    }
  })
);

// ── GET /api/brain/status/** ──────────────────────────────────
exports.brainStatus = onRequest(
  { region: REGION, secrets: ['FLUBA_SITE_SECRET'] },
  (req, res) => cors(req, res, async () => {
    const user = await verifyKcUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    // Extract requestId from path: /api/brain/status/{requestId}
    const parts     = req.path.split('/').filter(Boolean);
    const requestId = parts[parts.length - 1];
    if (!requestId) return res.status(400).json({ error: 'requestId required' });

    const secret = flubaSiteSecret.value();
    const body   = { requestId };
    const raw    = JSON.stringify(body);
    const sig    = sign(secret, raw);

    try {
      const r = await fetch(FLUBA_STATUS, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-site-id':    SITE_ID,
          'x-signature':  sig
        },
        body: raw
      });
      const data = await r.json();
      if (!r.ok) return res.status(502).json({ error: data?.error || `Fluba returned ${r.status}` });
      return res.json(data);
    } catch (err) {
      console.error('[Brain] Status error:', err.message);
      return res.status(502).json({ error: 'Failed to reach Fluba Brain status' });
    }
  })
);

// ── GET /api/brain/health ─────────────────────────────────────
exports.brainHealth = onRequest(
  { region: REGION },
  (req, res) => cors(req, res, () => {
    res.json({
      available: true,
      siteId:    SITE_ID,
      submitUrl: FLUBA_SUBMIT,
      statusUrl: FLUBA_STATUS,
      message:   'Brain connector online (Cloud Function)'
    });
  })
);
