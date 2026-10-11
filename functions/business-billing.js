'use strict';
const { businessState } = require('./hierarchy-policy');
const idOf = value => typeof value === 'string' ? value : value?.id;
const active = subscription => ['active','trialing'].includes(subscription.status);
function entitlementPatch(business, subscription) {
  const pro = business.promotional_grant === true || active(subscription);
  return { stripe_subscription_id: subscription.id, stripe_customer_id: idOf(subscription.customer),
    subscription_status: subscription.status, cancel_at_period_end: subscription.cancel_at_period_end === true,
    is_pro: pro, pro_status: pro ? 'pro' : null, subscription_tier: pro ? 'pro' : 'free',
    trial_end_date: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null };
}
function createBusinessBillingService(db) {
  async function sync(subscription, { attachBusinessId, expectedCustomerId, checkoutSessionId, eventCreated } = {}) {
    if (!subscription?.id || !idOf(subscription.customer)) throw new Error('Invalid subscription');
    const customer = idOf(subscription.customer);
    if (expectedCustomerId && customer !== expectedCustomerId) throw new Error('Checkout customer mismatch');
    const refs = attachBusinessId ? [db.doc('business_listings_public/' + attachBusinessId)] :
      (await db.collection('business_listings_public').where('stripe_subscription_id','==',subscription.id).get()).docs.map(d=>d.ref);
    for (const ref of refs) await db.runTransaction(async tx => {
      const snap = await tx.get(ref); if (!snap.exists) return;
      const b = snap.data();
      if (eventCreated && b.billing_event_created > eventCreated) return;
      const owner = await tx.get(db.doc('business_listings_private/' + ref.id));
      if (!owner.data()?.owner_uid) throw new Error('Business owner missing');
      const user = await tx.get(db.doc('users/' + owner.data().owner_uid));
      if (user.data()?.stripeCustomerId !== customer) throw new Error('Subscription does not belong to business owner');
      if (!attachBusinessId && b.stripe_subscription_id !== subscription.id) return;
      // A late checkout completion must never replace a different subscription.
      if (attachBusinessId && b.stripe_checkout_session_id !== checkoutSessionId) throw new Error('Checkout was superseded');
      const church = b.church_id ? await tx.get(db.doc('churches/' + b.church_id)) : null;
      tx.update(ref, {...entitlementPatch(b, subscription), ...businessState(b, church?.data()), ...(eventCreated ? {billing_event_created:eventCreated} : {})});
      // Legacy account summary is advisory; each business now owns its entitlement.
      if (!user.data().stripeSubscriptionId || user.data().stripeSubscriptionId === subscription.id) tx.update(user.ref, {
        stripeSubscriptionId: subscription.id, subscription_status: subscription.status,
        subscription_plan: subscription.items?.data?.[0]?.price?.id || null
      });
    });
    if (!refs.length) {
      const users=await db.collection('users').where('stripeCustomerId','==',customer).get();
      for(const user of users.docs) await db.runTransaction(async tx=>{
        const current=await tx.get(user.ref);
        if(current.data().stripeSubscriptionId && current.data().stripeSubscriptionId!==subscription.id) return;
        tx.update(user.ref,{stripeSubscriptionId:subscription.id,subscription_status:subscription.status,subscription_plan:subscription.items?.data?.[0]?.price?.id || null});
      });
    }
    return refs.length;
  }
  return { sync };
}
module.exports = { createBusinessBillingService, entitlementPatch, active };
