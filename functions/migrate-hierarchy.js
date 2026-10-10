'use strict';
// Dry run by default. Uses application-default credentials; never embeds credentials.
const admin = require('firebase-admin');
const { businessState } = require('./hierarchy-policy');
admin.initializeApp();
const db = admin.firestore();
const apply = process.argv.includes('--apply');

async function main() {
  const businesses = await db.collection('business_listings_public').get();
  const summary = { mode: apply ? 'apply' : 'dry-run', normalized: 0, conflicts: [], missingOwner: [], missingChurch: [] };
  for (const item of businesses.docs) {
    await db.runTransaction(async tx => {
      const current = await tx.get(item.ref);
      const business = current.data();
      if (business.church_id && business.referring_church_id && business.church_id !== business.referring_church_id) {
        summary.conflicts.push(item.id); return;
      }
      const owner = await tx.get(db.doc(`business_listings_private/${item.id}`));
      if (!owner.data()?.owner_uid) { summary.missingOwner.push(item.id); return; }
      const churchId = business.church_id || business.referring_church_id || null;
      const parent = churchId ? await tx.get(db.doc(`churches/${churchId}`)) : null;
      if (churchId && !parent.exists) { summary.missingChurch.push(item.id); return; }
      // Existing visible, active test records retain their approval; payment alone is not approval.
      const historicallyApproved = business.listing_status === 'active' && business.is_visible === true;
      const normalized = { ...business, church_id: churchId,
        platform_approved: business.platform_approved ?? historicallyApproved,
        church_approved: business.church_approved ?? (historicallyApproved && !!churchId),
        platform_suspended: business.platform_suspended ?? (business.listing_status === 'suspended'),
        church_suspended: business.church_suspended ?? false };
      if (apply) tx.update(item.ref, { church_id: churchId,
        created_by_uid: business.created_by_uid || owner.data().owner_uid,
        ...businessState(normalized, parent?.data()),
        platform_suspended: normalized.platform_suspended, church_suspended: normalized.church_suspended,
        referring_church_id: admin.firestore.FieldValue.delete(),
        updated_at: admin.firestore.FieldValue.serverTimestamp() });
      summary.normalized++;
    });
  }
  console.log(JSON.stringify(summary, null, 2));
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
