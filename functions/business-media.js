'use strict';
const { randomUUID } = require('node:crypto');
const policy = require('./hierarchy-policy');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['image/jpeg','image/jpg','image/png','image/gif','image/webp','video/mp4','video/webm']);

// Storage rules permit only two Firestore reads. Check the complete, current
// hierarchy here instead of weakening ownership checks or caching permissions.
function createBusinessMediaService(db, bucket) {
  async function execute(actor, input) {
    if (!['uploadBusinessMedia','deleteBusinessMedia'].includes(input?.action)) fail(400, 'Invalid media action.');
    const id = input.businessId;
    if (typeof id !== 'string' || !id || id.includes('/') || id.length > 128) fail(400, 'Invalid business ID.');
    await db.runTransaction(async tx => {
      const [userSnap, businessSnap, privateSnap] = await Promise.all([
        tx.get(db.doc('users/' + actor.uid)), tx.get(db.doc('business_listings_public/' + id)),
        tx.get(db.doc('business_listings_private/' + id))
      ]);
      const user = userSnap.data(), business = businessSnap.data(), owner = privateSnap.data();
      if (!user || policy.isBlocked(user)) fail(403, 'Account access is suspended.');
      if (!business || !owner) fail(404, 'Business not found.');
      if (policy.isAdmin(user)) return;
      if (owner.owner_uid !== actor.uid) fail(403, 'Only the business owner can manage its media.');
      if (['suspended','rejected'].includes(business.listing_status) || business.platform_suspended || business.church_suspended) fail(403, 'Business access is suspended.');
      if (business.church_id) {
        const church = await tx.get(db.doc('churches/' + business.church_id));
        if (!policy.activeChurch(church.data())) fail(403, 'The controlling church is not active.');
      }
    });
    if (input.action === 'deleteBusinessMedia') {
      const path = input.path;
      if (typeof path !== 'string' || !path.startsWith(`businesses/${id}/`) || path.split('/').some(p => !p || p === '.' || p === '..') || path.includes('\\')) fail(400, 'Invalid media path.');
      await bucket.file(path).delete({ ignoreNotFound: true });
      return { success: true };
    }
    if (!TYPES.has(input.contentType)) fail(400, 'Unsupported media type.');
    if (typeof input.data !== 'string' || input.data.length > Math.ceil(MAX_BYTES / 3) * 4 || input.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) fail(400, 'Invalid media data.');
    const bytes = Buffer.from(input.data, 'base64');
    if (!bytes.length || bytes.length > MAX_BYTES) fail(400, 'Media must be between 1 byte and 10MB.');
    const type = input.type || 'images';
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(type)) fail(400, 'Invalid media category.');
    const name = String(input.name || 'upload').replace(/[^a-zA-Z0-9.-]/g, '_').slice(-160);
    const path = `businesses/${id}/${type}/${randomUUID()}_${name}`;
    await bucket.file(path).save(bytes, { resumable: false, metadata: { contentType: input.contentType, cacheControl: 'public,max-age=31536000' } });
    return { success: true, path, name, size: bytes.length,
      url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media` };
  }
  return { execute };
}
module.exports = { createBusinessMediaService };
