const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteField, getDoc, collection, query, where, getDocs, writeBatch } = require('firebase/firestore');
const { ref: storageRef, uploadBytes } = require('firebase/storage');
// Resolve the backend's locked SDK even when test tooling is installed separately.
const admin = require(require.resolve('firebase-admin', { paths: [require('node:path').join(__dirname, '../functions')] }));
const { createHierarchyService } = require('../functions/hierarchy-service');
let env, db, service, app;
const projectId = 'demo-kingdom-hierarchy';
const actor = uid => ({ uid, email: `${uid}@example.test` });
const client = uid => env.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
const change = (uid, action, values = {}) => service.execute(actor(uid), { action, ...values });

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through the Firebase emulator; never against a real project.');
  env = await initializeTestEnvironment({ projectId,
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    storage: { rules: fs.readFileSync('storage.rules', 'utf8') } });
  app = admin.initializeApp({ projectId }, 'hierarchy-tests');
  db = app.firestore();
  service = createHierarchyService(db, () => admin.firestore.FieldValue.serverTimestamp());
});
after(async () => { await env?.cleanup(); await app?.delete(); });
beforeEach(async () => {
  await env.clearFirestore();
  const batch = db.batch();
  for (const [uid, role] of [['platform','admin'],['pastor','church_admin'],['otherPastor','church_admin'],['owner','business_owner'],['stranger','member'],['member','member']]) {
    batch.set(db.doc(`users/${uid}`), { roles: ['member',role], email: `${uid}@example.test`, account_status: 'active' });
  }
  for (const [churchId, uid] of [['church-one','pastor'],['church-two','otherPastor']]) {
    batch.set(db.doc(`churches/${churchId}`), { church_name: churchId, admin_uid: uid, contact_email: `${uid}@example.test`,
      listing_status: 'active', membership_approval_mode: 'manual', auto_approve_businesses: false });
  }
  batch.set(db.doc('business_listings_public/business-one'), { business_name: 'Fixture', church_id: 'church-one',
    platform_approved: true, church_approved: true, listing_status: 'active', is_visible: true, created_by_uid: 'owner' });
  batch.set(db.doc('business_listings_private/business-one'), { owner_uid: 'owner' });
  await batch.commit();
});

test('new accounts cannot claim platform powers or approved membership', async () => {
  const profile = { email: 'new@example.test', roles: ['member'], account_status: 'pending' };
  await assertFails(setDoc(doc(client('new'),'users/new'), { ...profile, roles: ['member','admin'] }));
  await assertFails(setDoc(doc(client('new'),'users/new'), { ...profile, role: 'platform_admin' }));
  await assertFails(setDoc(doc(client('new'),'users/new'), { ...profile, account_status: 'active' }));
  await assertFails(setDoc(doc(client('new'),'users/new'), { ...profile, managed_church_ids: ['church-one'] }));
  await assertSucceeds(setDoc(doc(client('new'),'users/new'), profile));
});
test('member cannot grant roles, approval, or direct church transfer; profile editing works', async () => {
  const member = doc(client('member'), 'users/member');
  await assertSucceeds(updateDoc(member, { display_name: 'Changed' }));
  for (const change of [{ roles: ['admin'] }, { roles: deleteField() }, { home_church_id: 'church-one' }, { church_membership_status: 'approved' }, { account_status: 'active', managed_church_ids: ['church-one'] }]) {
    await assertFails(updateDoc(member, change));
  }
});
test('a member transfer resets approval and only the new church can decide it', async () => {
  await change('member','setMemberChurch',{churchId:'church-one'});
  await assert.rejects(change('otherPastor','reviewMember',{memberId:'member',churchId:'church-one',decision:'approve'}), { status:403 });
  await change('pastor','reviewMember',{memberId:'member',churchId:'church-one',decision:'approve'});
  await change('member','setMemberChurch',{churchId:'church-two'});
  assert.equal((await db.doc('users/member').get()).data().church_membership_status,'pending');
  await assert.rejects(change('pastor','reviewMember',{memberId:'member',churchId:'church-one',decision:'approve'}), { status:403 });
});
test('church membership lists omit private billing and roles', async () => {
  await db.doc('users/member').update({ home_church_id:'church-one', stripeCustomerId:'private', roles:['member','business_owner'] });
  await assertFails(getDoc(doc(client('pastor'),'users/member')));
  const result = await change('pastor','listMembers',{churchId:'church-one'});
  assert.equal(result.members.length,1);
  assert.equal(result.members[0].stripeCustomerId,undefined);
  assert.equal(result.members[0].roles,undefined);
  await assert.rejects(change('otherPastor','listMembers',{churchId:'church-one'}),{status:403});
});
test('business owner cannot self-publish, transfer, or take another business; own editing works', async () => {
  const business = doc(client('owner'),'business_listings_public/business-one');
  await assertSucceeds(updateDoc(business,{description:'Edited'}));
  for (const change of [{church_id:'church-two'},{church_id:deleteField()},{listing_status:'pending'},{is_visible:false},{platform_approved:false}]) await assertFails(updateDoc(business,change));
  await assertFails(updateDoc(doc(client('stranger'),'business_listings_public/business-one'),{description:'Not mine'}));
  await assertFails(setDoc(doc(client('stranger'),'business_listings_private/orphan'),{owner_uid:'stranger'}));
});
test('new business public/private records must be created together under the same owner', async () => {
  const store = client('owner');
  const publicData = { business_name:'New business',listing_status:'pending',is_visible:false,created_by_uid:'owner',church_id:null };
  await assertFails(setDoc(doc(store,'business_listings_public/new-business'),publicData));
  const batch = writeBatch(store);
  batch.set(doc(store,'business_listings_public/new-business'),publicData);
  batch.set(doc(store,'business_listings_private/new-business'),{owner_uid:'owner'});
  await assertSucceeds(batch.commit());
});
test('affiliation release requires church consent, then new church and platform approvals persist', async () => {
  await change('owner','requestAffiliation',{businessId:'business-one',kind:'leave'});
  assert.equal((await db.doc('business_listings_public/business-one').get()).data().church_id,'church-one');
  await assert.rejects(change('otherPastor','reviewAffiliation',{businessId:'business-one',churchId:'church-one',decision:'approve'}),{status:403});
  await change('pastor','reviewAffiliation',{businessId:'business-one',churchId:'church-one',decision:'approve'});
  assert.equal((await db.doc('business_listings_public/business-one').get()).data().is_visible,false);
  await change('owner','requestAffiliation',{businessId:'business-one',churchId:'church-two'});
  await assertSucceeds(getDoc(doc(client('otherPastor'),'business_listings_public/business-one')));
  await change('otherPastor','reviewAffiliation',{businessId:'business-one',churchId:'church-two',decision:'approve'});
  assert.equal((await db.doc('business_listings_public/business-one').get()).data().is_visible,true);
});
test('church cannot reverse a platform suspension; unrelated church cannot manage a business', async () => {
  await change('platform','reviewBusiness',{businessId:'business-one',decision:'suspend'});
  await change('pastor','reviewBusiness',{businessId:'business-one',decision:'activate'});
  assert.equal((await db.doc('business_listings_public/business-one').get()).data().is_visible,false);
  await assert.rejects(change('otherPastor','reviewBusiness',{businessId:'business-one',decision:'approve'}),{status:403});
  await assert.rejects(change('owner','reviewBusiness',{businessId:'business-one',decision:'approve'}),{status:403});
});
test('platform church suspension hides child listings, blocks editing, and restores eligible children', async () => {
  await assert.rejects(change('pastor','setChurchStatus',{churchId:'church-one',status:'suspended'}),{status:403});
  await change('platform','setChurchStatus',{churchId:'church-one',status:'suspended'});
  await service.syncChurchBusinesses('church-one');
  assert.equal((await db.doc('business_listings_public/business-one').get()).data().is_visible,false);
  await assertFails(updateDoc(doc(client('owner'),'business_listings_public/business-one'),{description:'Blocked'}));
  await assert.rejects(change('pastor','featureBusiness',{businessId:'business-one',featured:true}),{status:403});
  await change('platform','setChurchStatus',{churchId:'church-one',status:'active'});
  await service.syncChurchBusinesses('church-one');
  assert.equal((await db.doc('business_listings_public/business-one').get()).data().is_visible,true);
});
test('owner and church queries work without exposing another church’s pending records', async () => {
  await db.doc('business_listings_public/business-one').update({is_visible:false,listing_status:'pending'});
  await assertSucceeds(getDocs(query(collection(client('pastor'),'business_listings_public'),where('church_id','==','church-one'))));
  await assertFails(getDocs(query(collection(client('otherPastor'),'business_listings_public'),where('church_id','==','church-one'))));
  await assertSucceeds(getDocs(query(collection(env.unauthenticatedContext().firestore(),'business_listings_public'),where('is_visible','==',true))));
});
test('matching a public contact email does not confer church ownership', async () => {
  const forged = env.authenticatedContext('stranger',{email:'pastor@example.test'}).firestore();
  await assertFails(updateDoc(doc(forged,'churches/church-one'),{church_name:'Taken'}));
  await assertSucceeds(updateDoc(doc(client('pastor'),'churches/church-one'),{church_name:'Updated'}));
});
test('business and church uploads require the actual owner or platform administrator', async () => {
  for (const path of ['businesses/business-one/logo.png','churches/church-one/logo.png']) {
    await assertFails(uploadBytes(storageRef(env.authenticatedContext('stranger').storage(),path),new Uint8Array([1])));
  }
  await assertFails(uploadBytes(storageRef(env.authenticatedContext('owner').storage(),'businesses/business-one/logo.png'),new Uint8Array([1])));
  await assertSucceeds(uploadBytes(storageRef(env.authenticatedContext('platform').storage(),'businesses/business-one/logo.png'),new Uint8Array([1])));
  await assertSucceeds(uploadBytes(storageRef(env.authenticatedContext('pastor').storage(),'churches/church-one/logo.png'),new Uint8Array([1])));
});


test('business media backend checks live owner, parent, and account authority before writing or deleting', async () => {
  const { createBusinessMediaService } = require('../functions/business-media');
  const writes = [], deletes = [];
  const media = createBusinessMediaService(db, { name: 'test-bucket', file: path => ({
    save: async bytes => writes.push({path,size:bytes.length}), delete: async () => deletes.push(path)
  }) });
  const input = { action:'uploadBusinessMedia',businessId:'business-one',name:'photo.png',contentType:'image/png',data:'AQ==' };
  const result = await media.execute(actor('owner'),input);
  assert.equal(result.success,true); assert.equal(writes.length,1);
  for (const uid of ['stranger','otherPastor','pastor']) await assert.rejects(media.execute(actor(uid),input),{status:403});
  await db.doc('churches/church-one').update({listing_status:'suspended'});
  await assert.rejects(media.execute(actor('owner'),input),{status:403});
  await db.doc('churches/church-one').update({listing_status:'active'});
  await db.doc('business_listings_public/business-one').update({platform_suspended:true});
  await assert.rejects(media.execute(actor('owner'),input),{status:403});
  await db.doc('business_listings_public/business-one').update({platform_suspended:false});
  await db.doc('users/owner').update({account_status:'disabled'});
  await assert.rejects(media.execute(actor('owner'),input),{status:403});
  await db.doc('users/owner').update({account_status:'active'});
  assert.equal(writes.length,1);
  await assert.rejects(media.execute(actor('owner'),{...input,action:'deleteBusinessMedia',path:'businesses/someone-else/photo.png'}),{status:400});
  await assert.rejects(media.execute(actor('owner'),{...input,type:'../elsewhere'}),{status:400});
  await assert.rejects(media.execute(actor('owner'),{...input,contentType:'text/html'}),{status:400});
  await media.execute(actor('owner'),{...input,action:'deleteBusinessMedia',path:result.path});
  assert.deepEqual(deletes,[result.path]);
});
