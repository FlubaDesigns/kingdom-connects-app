const { test } = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../functions/hierarchy-policy');
const church = { listing_status: 'active', page_settings: { allow_qr_gear: true } };
const business = { church_id: 'church-one', platform_approved: true, church_approved: true, listing_status: 'active' };

test('all three entity types have independent stable store identities', () => {
  const identities = ['member', 'church', 'business'].map(type => policy.entityIdentity(type, 'same-ID'));
  assert.equal(new Set(identities.map(entity => entity.channelId)).size, 3);
  assert.equal(identities[0].entityId, 'same-ID');
  for (const invalid of ['', null, 'one/two']) assert.throws(() => policy.entityIdentity('member', invalid));
  assert.throws(() => policy.entityIdentity('admin', 'one'));
});
test('both approvals and an active controlling church are required for publication', () => {
  assert.equal(policy.businessState(business, church).is_visible, true);
  for (const change of [{ platform_approved: false }, { church_approved: false }, { church_id: null }, { platform_suspended: true }, { church_suspended: true }]) {
    assert.equal(policy.businessState({ ...business, ...change }, church).is_visible, false);
  }
  assert.equal(policy.businessState(business, { listing_status: 'suspended' }).is_visible, false);
});
test('parent suspension preserves approvals so parent restoration can recover visibility', () => {
  const paused = policy.businessState(business, { listing_status: 'suspended' });
  assert.equal(paused.is_visible, false);
  assert.equal(policy.businessState({ ...business, ...paused }, church).is_visible, true);
});
test('stores remain gated and respect parent permission for every group', () => {
  for (const type of ['member', 'church', 'business']) {
    const entity = type === 'business' ? business : type === 'church' ? church : { account_status: 'active', church_membership_status: 'approved' };
    assert.throws(() => policy.assertStoreAllowed({ type, entity, church, settings: { enabled: false } }), { status: 503 });
    assert.doesNotThrow(() => policy.assertStoreAllowed({ type, entity, church, settings: { enabled: true } }));
    const disabled = { ...church, page_settings: { allow_qr_gear: false } };
    assert.throws(() => policy.assertStoreAllowed({ type, entity: type === 'church' ? disabled : entity, church: disabled, settings: { enabled: true } }), { status: 403 });
  }
});
test('member approval and individual opt-out both affect store access', () => {
  for (const entity of [{ account_status: 'pending', church_membership_status: 'pending' }, { account_status: 'active', church_membership_status: 'approved', allow_store: false }]) {
    assert.throws(() => policy.assertStoreAllowed({ type: 'member', entity, church, settings: { enabled: true } }), { status: 403 });
  }
});
