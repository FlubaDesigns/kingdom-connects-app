const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDocs,updateDoc,deleteDoc,collection,query,where}=require('firebase/firestore');
const admin=require(require.resolve('firebase-admin',{paths:[require('node:path').join(__dirname,'../functions')]}));
const {createMemberService}=require('../functions/member-service');
const {createHierarchyService}=require('../functions/hierarchy-service');
const {createMemberMailDelivery}=require('../functions/member-mail');
let env,app,db,service,hierarchy,records,auth,removed;
const actor=uid=>({uid,email:uid+'@example.test',email_verified:false,auth_time:Math.floor(Date.now()/1000)});
const client=uid=>env.authenticatedContext(uid,{email:uid+'@example.test',email_verified:false}).firestore();
const change=(uid,action,input={})=>service.execute(actor(uid),{action,...input});
before(async()=>{
 assert(process.env.FIRESTORE_EMULATOR_HOST,'Emulator required.');
 env=await initializeTestEnvironment({projectId:'demo-kingdom-members',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
 app=admin.initializeApp({projectId:'demo-kingdom-members'},'member-tests');db=app.firestore();
});
after(async()=>{await env?.cleanup();await app?.delete()});
beforeEach(async()=>{
 await env.clearFirestore();records=new Map();removed=[];
 auth={getUser:async uid=>{if(!records.has(uid))throw Object.assign(Error('missing'),{code:'auth/user-not-found'});return records.get(uid)},
 createUser:async data=>{const uid='created';records.set(uid,{...data,uid,emailVerified:false});return records.get(uid)},
 updateUser:async(uid,data)=>{Object.assign(await auth.getUser(uid),data)},revokeRefreshTokens:async()=>{},deleteUser:async uid=>{records.delete(uid)},
 generateEmailVerificationLink:async()=> 'https://example.test/verify',generatePasswordResetLink:async()=> 'https://example.test/reset'};
 service=createMemberService(db,auth,{deleteFiles:async options=>removed.push(options.prefix)},()=>admin.firestore.FieldValue.serverTimestamp());
 hierarchy=createHierarchyService(db,()=>admin.firestore.FieldValue.serverTimestamp());
 const batch=db.batch();
 for(const [uid,role,status]of [['member','member','active'],['other','member','active'],['suspended','member','suspended'],['platform','admin','active'],['pastor','church_admin','active']]) {
  batch.set(db.doc('users/'+uid),{roles:[role],email:uid+'@example.test',account_status:status,church_membership_status:'approved',name:uid});records.set(uid,{...actor(uid),emailVerified:false});
 }
 for(const uid of ['new','automatic','nominate'])records.set(uid,{...actor(uid),emailVerified:false});
 batch.set(db.doc('churches/church'),{church_name:'Audit church',admin_uid:'pastor',listing_status:'active',membership_approval_mode:'manual'});
 batch.set(db.doc('churches/auto'),{church_name:'Automatic',admin_uid:'pastor',listing_status:'active',membership_approval_mode:'automatic'});
 batch.set(db.doc('business_listings_public/business'),{business_name:'Business',is_visible:true,church_id:'church',listing_status:'active',pro_status:'pro'});
 batch.set(db.doc('business_listings_private/business'),{owner_uid:'other'});
 batch.set(db.doc('favorite_businesses/other'),{user_id:'other',business_id:'business'});await batch.commit();
});
test('signup handles manual, automatic, unaffiliated, nomination, and retries without granting church ownership',async()=>{
 let r=await change('new','completeMemberSignup',{name:'New member',churchId:'church'});assert.equal(r.status,'pending');
 r=await change('new','completeMemberSignup',{name:'New member',churchId:'auto'});assert(r.alreadyComplete);
 assert.equal((await db.doc('users/new').get()).data().home_church_id,'church');
 assert.equal((await change('automatic','completeMemberSignup',{name:'Automatic member',churchId:'auto'})).status,'active');
 await change('nominate','completeMemberSignup',{name:'Nominating member',nomination:{church_name:'New church',contact_email:'church@example.test',state:'NY'}});
 const nominated=(await db.doc('churches/nomination-nominate').get()).data();assert.equal(nominated.admin_uid,null);assert.equal(nominated.listing_status,'pending');
 assert.equal((await db.doc('users/nominate').get()).data().account_status,'pending');
 const mail=await db.collection('member_mail').where('uid','==','new').get();assert.equal(mail.size,2);
});
test('only the controlling church can approve membership and notification is committed with approval',async()=>{
 await change('new','completeMemberSignup',{name:'New member',churchId:'church'});
 await assert.rejects(hierarchy.execute(actor('member'),{action:'reviewMember',memberId:'new',churchId:'church',decision:'approve'}),{status:403});
 await hierarchy.execute(actor('pastor'),{action:'reviewMember',memberId:'new',churchId:'church',decision:'approve'});
 assert.equal((await db.doc('users/new').get()).data().account_status,'active');
 assert((await db.collection('member_mail').where('uid','==','new').get()).docs.some(d=>d.data().kind==='approved'));
});
test('reviews use canonical fields, require owner and active account, and return to moderation on edits',async()=>{
 const input={businessId:'business',rating:5,reviewText:'A useful review of this business.'};
 const r=await change('member','saveMemberReview',input);const ref=db.doc('reviews/'+r.reviewId);
 assert.equal((await ref.get()).data().rating,5);assert(!(await ref.get()).data().user_email);
 await ref.update({status:'approved'});
 await change('member','saveMemberReview',{...input,reviewId:r.reviewId,reviewText:'Updated useful review text.'});assert.equal((await ref.get()).data().status,'pending');
 await assert.rejects(change('other','deleteMemberReview',{reviewId:r.reviewId}),{status:403});
 await assert.rejects(change('suspended','saveMemberReview',input),{status:403});
 await assert.rejects(change('member','saveMemberReview',{...input,rating:7}),{status:400});
 await change('member','deleteMemberReview',{reviewId:r.reviewId});assert(!(await ref.get()).exists);
 await assertFails(setDoc(doc(client('member'),'reviews/direct'),{user_id:'member',rating:5,review_text:input.reviewText,status:'pending'}));
});
test('favorites are private and suspended writes fail; visible dashboard queries succeed',async()=>{
 await assertFails(getDocs(query(collection(client('member'),'favorite_businesses'),where('user_id','==','other'))));
 await assertFails(setDoc(doc(client('suspended'),'favorite_businesses/suspended'),{user_id:'suspended',business_id:'business'}));
 await assertSucceeds(setDoc(doc(client('member'),'favorite_businesses/member'),{user_id:'member',business_id:'business'}));
 await assertSucceeds(getDocs(query(collection(client('member'),'favorite_businesses'),where('user_id','==','member'))));
 await assertSucceeds(deleteDoc(doc(client('member'),'favorite_businesses/member')));
 for(const [field,value]of [['church_id','church'],['pro_status','pro']])await assertSucceeds(getDocs(query(collection(client('member'),'business_listings_public'),where(field,'==',value),where('is_visible','==',true))));
});
test('verification state comes from Auth; members cannot forge it or read/write the mail queue',async()=>{
 await assertFails(updateDoc(doc(client('member'),'users/member'),{email_verified:true}));
 await assertFails(setDoc(doc(client('member'),'member_mail/forged'),{uid:'other',kind:'verification'}));
 await assertFails(getDocs(collection(client('member'),'member_mail')));
 assert.equal((await change('member','syncEmailVerification')).emailVerified,false);
 records.get('member').emailVerified=true;assert.equal((await change('member','syncEmailVerification')).emailVerified,true);
});
test('admin creation uses the Auth UID, status controls access, and members cannot change another account',async()=>{
 const values={name:'New member',email:'new@example.test',role:'member',account_status:'active'};
 await assert.rejects(change('member','saveMemberAdmin',{values}),{status:403});
 const created=await change('platform','saveMemberAdmin',{values});assert.equal(created.memberId,'created');
 assert.equal((await db.doc('users/created').get()).data().account_status,'active');
 await change('platform','saveMemberAdmin',{memberId:'member',values:{...values,email:'member@example.test',account_status:'suspended'}});
 await assert.rejects(change('member','saveMemberReview',{businessId:'business',rating:5,reviewText:'A sufficiently long review.'}),{status:403});
});
test('account closure requires recent sign-in, preserves managed entities, removes Auth and owned data',async()=>{
 await assert.rejects(service.execute({...actor('member'),auth_time:1},{action:'closeMemberAccount'}),{status:401});
 await assert.rejects(change('other','closeMemberAccount'),{status:409});
 await assert.rejects(change('member','deleteMemberAccount',{memberId:'other'}),{status:403});
 await db.doc('favorite_businesses/member').set({user_id:'member',business_id:'business'});
 await db.doc('reviews/member').set({user_id:'member'});
 await change('member','closeMemberAccount');assert(!records.has('member'));assert(!(await db.doc('users/member').get()).exists);assert(!(await db.doc('reviews/member').get()).exists);assert(!(await db.doc('favorite_businesses/member').get()).exists);assert.deepEqual(removed,['users/member/']);
});
test('mail retries reuse the saved content and idempotency key; recipients come from Auth',async()=>{
 await change('new','completeMemberSignup',{name:'New member',churchId:'church'});
 const ref=db.doc('member_mail/verification-signup-new');const attempts=[];let failed=true;
 const deliver=createMemberMailDelivery(db,auth,{emails:{send:async(payload,options)=>{attempts.push({payload,options});if(failed){failed=false;return {error:{name:'temporary'}}}return {data:{id:'test-message'}}}}},()=>admin.firestore.FieldValue.serverTimestamp());
 await assert.rejects(deliver(ref));await deliver(ref);await deliver(ref);
 assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.equal(attempts[0].payload.to,'new@example.test');assert.equal((await ref.get()).data().status,'sent');
});

test('admin role and status actions share canonical membership and protect self access', async () => {
 await db.doc('users/other').update({role:'admin',roles:['admin']});
 await assert.rejects(change('member','setAdminUserRoles',{memberId:'other',roles:['admin']}),{status:403});
 await assert.rejects(change('platform','setAdminUserRoles',{memberId:'other',roles:['super_admin']}),{status:400});
 await assert.rejects(change('platform','setAdminUserRoles',{memberId:'platform',roles:['member']}),{status:409});
 await assert.rejects(change('platform','setAdminUserStatus',{memberId:'platform',status:'disabled'}),{status:409});
 await change('platform','setAdminUserRoles',{memberId:'other',roles:['church_admin','business_owner']});
 const profile=(await db.doc('users/other').get()).data();
 assert.deepEqual(profile.roles,['member','church_admin','business_owner']);assert.equal(profile.role,'church_admin');
 await change('platform','saveMemberAdmin',{memberId:'other',values:{name:'Other Member',email:'other@example.test',role:'church_admin',account_status:'active'}});
 assert.deepEqual((await db.doc('users/other').get()).data().roles,profile.roles);
 await change('platform','setAdminUserStatus',{memberId:'other',status:'suspended'});
 await assert.rejects(change('other','saveMemberReview',{businessId:'business',rating:5,reviewText:'A sufficiently long review.'}),{status:403});
 await change('platform','setAdminUserStatus',{memberId:'other',status:'active'});
 assert.equal((await db.doc('users/other').get()).data().church_membership_status,'approved');
 assert.equal((await db.collection('activity_log').where('target_id','==','other').get()).size,3);
});

test('moderation, member edits and deletions keep the directory rating projection consistent', async () => {
 const first=await change('member','saveMemberReview',{businessId:'business',rating:5,reviewText:'First detailed business review.'});
 const second=await change('other','saveMemberReview',{businessId:'business',rating:3,reviewText:'Second detailed business review.'});
 await assert.rejects(change('member','moderateMemberReview',{reviewId:first.reviewId,decision:'approved'}),{status:403});
 await assertFails(updateDoc(doc(client('platform'),'reviews/'+first.reviewId),{status:'approved'}));
 await Promise.all([first,second].map(review=>change('platform','moderateMemberReview',{reviewId:review.reviewId,decision:'approved'})));
 let business=(await db.doc('business_listings_public/business').get()).data();assert.equal(business.review_count,2);assert.equal(business.average_rating,4);
 await change('member','saveMemberReview',{reviewId:first.reviewId,rating:4,reviewText:'Edited detailed business review.'});
 business=(await db.doc('business_listings_public/business').get()).data();assert.equal(business.review_count,1);assert.equal(business.average_rating,3);
 await change('platform','moderateMemberReview',{reviewId:second.reviewId,decision:'notes',notes:'Follow up later'});
 assert.equal((await db.doc('reviews/'+second.reviewId).get()).data().admin_notes,'Follow up later');
 await change('platform','moderateMemberReview',{reviewId:second.reviewId,decision:'delete'});
 business=(await db.doc('business_listings_public/business').get()).data();assert.equal(business.review_count,0);assert.equal(business.average_rating,0);
});
