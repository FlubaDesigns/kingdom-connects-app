'use strict';
const { randomUUID } = require('node:crypto');
const policy = require('./hierarchy-policy');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['image/jpeg','image/jpg','image/png','image/gif','image/webp','video/mp4','video/webm']);
function hasPro(b, user) {
  return [true,'pro','active'].includes(b.pro_status) && (b.promotional_grant === true || !b.stripe_subscription_id ||
    (b.subscription_status !== undefined ? ['active','trialing'].includes(b.subscription_status) :
    user.stripeSubscriptionId === b.stripe_subscription_id && ['active','trialing'].includes(user.subscription_status)));
}
function createBusinessMediaService(db, bucket) {
  async function execute(actor, input) {
    if (!['uploadBusinessMedia','deleteBusinessMedia'].includes(input?.action)) fail(400, 'Invalid media action.');
    const id = input.businessId;
    if (typeof id !== 'string' || !id || id.includes('/') || id.length > 128) fail(400, 'Invalid business ID.');
    const deleting = input.action === 'deleteBusinessMedia';
    let bytes, name, type, path = input.path;
    if (deleting) {
      if (typeof path !== 'string' || !path.startsWith(`businesses/${id}/`) || path.split('/').some(p => !p || p === '.' || p === '..') || path.includes('\\')) fail(400, 'Invalid media path.');
    } else {
      if (!TYPES.has(input.contentType)) fail(400, 'Unsupported media type.');
      if (typeof input.data !== 'string' || input.data.length > Math.ceil(MAX_BYTES / 3) * 4 || input.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) fail(400, 'Invalid media data.');
      bytes = Buffer.from(input.data,'base64');
      if (!bytes.length || bytes.length > MAX_BYTES) fail(400, 'Media must be between 1 byte and 10MB.');
      type = input.type || 'images';
      if (!['images','photos','videos','logo','logos'].includes(type)) fail(400, 'Invalid media category.');
      if ((type === 'videos') !== input.contentType.startsWith('video/')) fail(400, 'Media type does not match category.');
      name = String(input.name || 'upload').replace(/[^a-zA-Z0-9.-]/g, '_').slice(-160);
      path = `businesses/${id}/${type}/${randomUUID()}_${name}`;
    }
    const registry = db.doc('business_media/' + id);
    const urlFor = p => `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(p)}?alt=media`;
    await db.runTransaction(async tx => {
      const [userSnap,businessSnap,privateSnap,mediaSnap] = await Promise.all([
        tx.get(db.doc('users/' + actor.uid)), tx.get(db.doc('business_listings_public/' + id)),
        tx.get(db.doc('business_listings_private/' + id)), tx.get(registry)
      ]);
      const user=userSnap.data(), business=businessSnap.data(), owner=privateSnap.data();
      if (!user || policy.isBlocked(user)) fail(403,'Account access is suspended.');
      if (!business || !owner) fail(404,'Business not found.');
      if (!policy.isAdmin(user)) {
        if (owner.owner_uid !== actor.uid) fail(403,'Only the business owner can manage its media.');
        if (['suspended','rejected'].includes(business.listing_status) || business.platform_suspended || business.church_suspended) fail(403,'Business access is suspended.');
        if (business.church_id && !policy.activeChurch((await tx.get(db.doc('churches/' + business.church_id))).data())) fail(403,'The controlling church is not active.');
        if (!deleting && !['logo','logos'].includes(type) && !hasPro(business,user)) fail(403,'An active Pro listing is required for photos and videos.');
      }
      if (deleting) return;
      const files=mediaSnap.data()?.files || {};
      const group=type === 'videos' ? 'videos' : ['logo','logos'].includes(type) ? 'logos' : 'photos';
      const existing=group === 'photos' ? business.photos || [] : group === 'videos' ? [...(business.videos || []),...(business.video_files || [])] : [business.logo,business.logo_url].filter(Boolean);
      const urls=new Set([...existing,...Object.entries(files).filter(([,v])=>v.group===group).map(([p])=>urlFor(p))]);
      const limit=group === 'photos' ? 10 : group === 'videos' ? 3 : 2;
      if (urls.size >= limit) fail(409,`Maximum ${limit} ${group} allowed. Remove an existing upload first.`);
      files[path]={group};
      tx.set(registry,{files});
    });
    async function release() { await db.runTransaction(async tx => { const snap=await tx.get(registry); const files=snap.data()?.files || {}; delete files[path]; tx.set(registry,{files}); }); }
    if (deleting) {
      await bucket.file(path).delete({ignoreNotFound:true});
      await release();
      await db.runTransaction(async tx => {
        const ref=db.doc('business_listings_public/'+id),snap=await tx.get(ref);
        if(!snap.exists) return;
        const patch={};
        const belongs=value=>{ try { const u=new URL(value); return u.hostname==='firebasestorage.googleapis.com' && u.pathname.startsWith('/v0/b/'+bucket.name+'/o/') && decodeURIComponent(u.pathname.split('/o/')[1])===path; } catch {return false;} };
        for(const field of ['photos','video_files','videos']) if(Array.isArray(snap.data()[field])) patch[field]=snap.data()[field].filter(value=>!belongs(value));
        for(const field of ['logo','logo_url']) if(belongs(snap.data()[field])) patch[field]='';
        if(Object.keys(patch).length) tx.update(ref,patch);
      });
      return {success:true};
    }
    try { await bucket.file(path).save(bytes,{resumable:false,metadata:{contentType:input.contentType,cacheControl:'public,max-age=31536000'}}); }
    catch (error) { await release(); throw error; }
    return {success:true,path,name,size:bytes.length,url:urlFor(path)};
  }
  return {execute};
}
module.exports={createBusinessMediaService,hasPro};
