'use strict';
const { createHash } = require('node:crypto');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const topics = {
  general: ['feedback', 'partnerships', 'chapters', 'other'],
  support: ['account', 'listing', 'pro_upgrade', 'technical', 'other']
};
function validateContact(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Invalid message.');
  const allowed = ['category', 'subcategory', 'name', 'email', 'subject', 'message', 'source', 'dashboard', 'page_url'];
  if (Object.keys(input).some(key => !allowed.includes(key))) fail(400, 'Invalid message fields.');
  const text = (key, min, max) => {
    const value = input[key];
    if (typeof value !== 'string' || value.trim().length < min || value.length > max) fail(400, 'Invalid ' + key + '.');
    return value.trim();
  };
  const name = text('name', 2, 100), email = text('email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Invalid email.');
  if (!topics[input.category]?.includes(input.subcategory)) fail(400, 'Invalid topic.');
  if (!['form', 'contact', 'widget'].includes(input.source)) fail(400, 'Invalid source.');
  if (input.dashboard != null && !['unknown', 'admin', 'member', 'business', 'church', 'sales', 'marketing'].includes(input.dashboard)) fail(400, 'Invalid dashboard.');
  // Keep page context, never arbitrary query parameters or fragments that might contain secrets.
  let page = '';
  if (input.page_url != null) {
    try {
      const url = new URL(text('page_url', 1, 2000));
      if (url.protocol !== 'https:' || !['kingdom-commerce.web.app', 'kingdom-commerce.firebaseapp.com', 'kingdomconnects.org', 'www.kingdomconnects.org'].includes(url.hostname)) fail(400, 'Invalid page.');
      page = url.origin + url.pathname;
    } catch { fail(400, 'Invalid page.'); }
  }
  return { name, email, subject: text('subject', 1, 200), message: text('message', 1, 5000),
    category: input.category, subcategory: input.subcategory, source: input.source,
    dashboard: input.dashboard || null, page_url: page };
}
function createContactService(db, timestamp, now = () => Date.now()) {
  return async function submit(input, { ip, uid = null }) {
    const values = validateContact(input), time = now(), window = Math.floor(time / 3600000);
    if (typeof ip !== 'string' || !ip) fail(503, 'Contact service unavailable.');
    const hash = value => createHash('sha256').update(value).digest('hex');
    const buckets = [['ip:' + ip, 10], ['email:' + values.email, 3], ['global', 300]]
      .map(([key, max]) => ({ ref: db.doc('contact_rate_limits/' + hash(key)), max }));
    const record = db.collection('contact_submissions').doc();
    await db.runTransaction(async tx => {
      const snapshots = await Promise.all(buckets.map(bucket => tx.get(bucket.ref)));
      const counts = snapshots.map(snapshot => snapshot.data()?.window === window ? Number(snapshot.data().count || 0) : 0);
      if (counts.some((count, index) => count >= buckets[index].max)) fail(429, 'Too many messages.');
      buckets.forEach((bucket, index) => tx.set(bucket.ref, { window, count: counts[index] + 1 }));
      tx.create(record, { ...values, status: 'new', user_id: uid, created_at: timestamp(),
        admin_response: null, responded_at: null, responded_by: null });
    });
    return { success: true, id: record.id };
  };
}
module.exports = { createContactService, validateContact };
