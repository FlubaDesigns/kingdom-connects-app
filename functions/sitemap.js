// ============================================================
// Sitemap + Slug Cloud Functions - Kingdom Connects
// ============================================================

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

const REGION = 'us-central1';
const BASE_URL = 'https://kingdomconnects.org';

// ── Simple in-memory rate limiter ────────────────────────────
const _rl = new Map();
function isRateLimited(req, res, max = 30, windowMs = 60000) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'unknown';
  const key = `${ip}:${req.path}`;
  const now = Date.now();
  const rec = _rl.get(key);
  if (!rec || now > rec.reset) {
    _rl.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  rec.count++;
  if (rec.count > max) {
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return true;
  }
  return false;
}

async function verifyAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw { status: 401, message: 'Unauthorized: No token provided' };
  }
  const idToken = authHeader.split('Bearer ')[1];
  if (!idToken || idToken.length < 100) {
    throw { status: 401, message: 'Unauthorized: Invalid token format' };
  }
  const decoded = await admin.auth().verifyIdToken(idToken);
  const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
  if (!userDoc.exists) throw { status: 403, message: 'Forbidden: User not found' };
  const roles = userDoc.data().roles || [];
  if (!roles.includes('platform_admin') && !roles.includes('admin')) {
    throw { status: 403, message: 'Forbidden: Insufficient permissions' };
  }
  return { user: decoded, userData: userDoc.data() };
}

function generateSlug(name, city, state, docId = null) {
  const parts = [name, city, state].filter(Boolean);
  const slug = parts.join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
  if (!slug || slug.length < 3) return docId || 'listing';
  return slug;
}

// ── GET /sitemap.xml ──────────────────────────────────────────
exports.sitemapXml = onRequest(
  { region: REGION, invoker: 'public' },
  async (req, res) => {
    if (isRateLimited(req, res, 60, 60000)) return;

    try {
      const db = admin.firestore();
      const now = new Date().toISOString();

      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${BASE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${BASE_URL}/business_directory.html</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${BASE_URL}/church_directory.html</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${BASE_URL}/for-businesses.html</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${BASE_URL}/for-churches.html</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
`;

      const [businesses, churches] = await Promise.all([
        db.collection('business_listings_public').where('listing_status', '==', 'active').get(),
        db.collection('churches').where('listing_status', '==', 'active').get()
      ]);

      for (const doc of businesses.docs) {
        const d = doc.data();
        const slug = d.slug || generateSlug(d.business_name, d.city, d.state, doc.id);
        const lastMod = (d.updated_at?.toDate?.()?.toISOString() || now).split('T')[0];
        xml += `  <url><loc>${BASE_URL}/business/${slug}.htm</loc><lastmod>${lastMod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
      }

      for (const doc of churches.docs) {
        const d = doc.data();
        const slug = d.slug || generateSlug(d.church_name, d.city, d.state, doc.id);
        const lastMod = (d.updated_at?.toDate?.()?.toISOString() || now).split('T')[0];
        xml += `  <url><loc>${BASE_URL}/church/${slug}.htm</loc><lastmod>${lastMod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
      }

      xml += `</urlset>`;
      res.set('Content-Type', 'application/xml');
      res.set('Cache-Control', 'public, max-age=3600');
      res.send(xml);
    } catch (err) {
      console.error('Sitemap error:', err);
      res.status(500).send('<?xml version="1.0"?><error>Failed to generate sitemap</error>');
    }
  }
);

// ── GET /api/slug/:type/:id ───────────────────────────────────
exports.slugLookup = onRequest(
  { region: REGION, invoker: 'public' },
  async (req, res) => {
    cors(req, res, async () => {
      if (isRateLimited(req, res, 60, 60000)) return;

      const parts = req.path.split('/').filter(Boolean);
      // Path: /api/slug/{type}/{id} → parts: ['api','slug',type,id]
      const type = parts[2];
      const id   = parts[3];

      if (!type || !id || !['business', 'church'].includes(type)) {
        return res.status(400).json({ error: 'Invalid request. Use /api/slug/business/:id or /api/slug/church/:id' });
      }

      try {
        const collection = type === 'business' ? 'business_listings_public' : 'churches';
        const nameField  = type === 'business' ? 'business_name' : 'church_name';
        const doc = await admin.firestore().collection(collection).doc(id).get();
        if (!doc.exists) return res.status(404).json({ error: 'Not found' });
        const data = doc.data();
        const slug = data.slug || generateSlug(data[nameField], data.city, data.state, id);
        res.json({ id, slug, url: `${BASE_URL}/${type}/${slug}.htm` });
      } catch (err) {
        console.error('Slug lookup error:', err);
        res.status(500).json({ error: 'Server error' });
      }
    });
  }
);

// ── POST /api/ping-sitemap ────────────────────────────────────
let lastPingTime = 0;
const PING_COOLDOWN = 60 * 60 * 1000;

exports.pingSitemap = onRequest(
  { region: REGION },
  (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
      await verifyAdmin(req);
    } catch (e) {
      return res.status(e.status || 401).json({ error: e.message });
    }

    const now = Date.now();
    if (now - lastPingTime < PING_COOLDOWN) {
      return res.json({ skipped: true, reason: 'cooldown', nextPingIn: Math.ceil((lastPingTime + PING_COOLDOWN - now) / 60000) + ' minutes' });
    }

    lastPingTime = now;
    const sitemapUrl = encodeURIComponent(`${BASE_URL}/sitemap.xml`);
    const results = { google: null, bing: null };

    try {
      const g = await fetch(`https://www.google.com/ping?sitemap=${sitemapUrl}`);
      results.google = g.ok ? 'success' : 'failed';
    } catch { results.google = 'error'; }

    try {
      const b = await fetch(`https://www.bing.com/ping?sitemap=${sitemapUrl}`);
      results.bing = b.ok ? 'success' : 'failed';
    } catch { results.bing = 'error'; }

    console.log('Sitemap ping results:', results);
    res.json({ success: true, results });
  })
);
