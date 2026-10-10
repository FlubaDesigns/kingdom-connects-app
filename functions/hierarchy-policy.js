'use strict';

// Canonical identity and lifecycle policy. Names, emails and slugs are display data.
const ENTITY_TYPES = ['member', 'business', 'church'];
const roles = data => [...new Set([...(Array.isArray(data.roles) ? data.roles : []), data.role].filter(Boolean))];
const isAdmin = data => roles(data).some(role => ['admin', 'platform_admin'].includes(role));
const isBlocked = data => ['suspended', 'disabled', 'rejected'].includes(data.account_status);
const activeChurch = church => !!church && church.listing_status === 'active';

function entityIdentity(type, id) {
  if (!ENTITY_TYPES.includes(type) || typeof id !== 'string' || !id || id.includes('/') || id.length > 128) {
    throw Object.assign(new Error('A valid entity type and permanent record ID are required.'), { status: 400 });
  }
  return { entityType: type, entityId: id, storeOwner: { ownerType: type, ownerId: id },
    channelId: `${type}_${id}` };
}

function businessState(business, church) {
  const platformApproved = business.platform_approved === true ||
    (business.platform_approved === undefined && business.listing_status === 'active');
  const churchApproved = business.church_approved === true ||
    (business.church_approved === undefined && !!business.church_id && business.listing_status === 'active');
  const suspended = business.platform_suspended === true || business.church_suspended === true ||
    (business.listing_status === 'suspended' && business.platform_suspended === undefined && business.church_suspended === undefined);
  const visible = !suspended && platformApproved && churchApproved && !!business.church_id && activeChurch(church);
  return { platform_approved: platformApproved, church_approved: churchApproved,
    listing_status: suspended ? 'suspended' : visible ? 'active' : 'pending', is_visible: visible };
}

function assertStoreAllowed({ type, entity, church, settings }) {
  if (settings?.enabled !== true) throw Object.assign(new Error('QR Gear stores are not enabled yet.'), { status: 503 });
  if (type === 'church' ? !activeChurch(entity) : !activeChurch(church)) {
    throw Object.assign(new Error('An active controlling church is required.'), { status: 403 });
  }
  if (type === 'business' && !businessState(entity, church).is_visible) {
    throw Object.assign(new Error('This business is not approved for store access.'), { status: 403 });
  }
  if (type === 'member' && (entity.account_status !== 'active' || entity.church_membership_status !== 'approved')) {
    throw Object.assign(new Error('Approved membership is required for store access.'), { status: 403 });
  }
  const parent = type === 'church' ? entity : church;
  if (parent.page_settings?.allow_qr_gear === false || entity.allow_store === false) {
    throw Object.assign(new Error('Store access has been disabled.'), { status: 403 });
  }
}

module.exports = { roles, isAdmin, isBlocked, activeChurch, entityIdentity, businessState, assertStoreAllowed };
