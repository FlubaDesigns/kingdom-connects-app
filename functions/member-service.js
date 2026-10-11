'use strict';
const policy=require('./hierarchy-policy');
const { writeReview, runReviewTransaction } = require('./review-service');
const {queueMemberMail}=require('./member-mail');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const id=value=>{if(typeof value!=='string'||!value||value.includes('/')||value.length>128)fail(400,'Invalid record ID.');return value};
const text=(value,min,max,label)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(400,'Invalid '+label+'.');return value.trim()};
const actions=['completeMemberSignup','saveMemberReview','deleteMemberReview','syncEmailVerification','saveMemberAdmin','closeMemberAccount','deleteMemberAccount','setAdminUserRoles','setAdminUserStatus','moderateMemberReview'];
function createMemberService(db,auth,bucket,timestamp) {
 async function execute(actor,input) {
  if(!actions.includes(input?.action))fail(400,'Unknown member action.');
  if(input.action==='completeMemberSignup') {
   const name=text(input.name,2,100,'name');if(!actor.email)fail(400,'An email account is required.');
   const churchId=input.churchId ? id(input.churchId) : null;
   let nomination=null;
   if(input.nomination) {
    if(churchId)fail(400,'Choose an existing church or nominate one.');
    nomination={church_name:text(input.nomination.church_name,2,200,'church name'),contact_email:text(input.nomination.contact_email,3,254,'church email'),state:text(input.nomination.state,2,100,'state'),contact_phone:String(input.nomination.contact_phone||'').slice(0,30)};
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nomination.contact_email))fail(400,'Invalid church email.');
   }
   const userRef=db.doc('users/'+id(actor.uid));
   return db.runTransaction(async tx=>{
    const current=(await tx.get(userRef)).data();
    const church=churchId ? (await tx.get(db.doc('churches/'+churchId))).data():null;
    if(current&&policy.isBlocked(current))fail(403,'Account access is suspended.');
    if(current?.member_signup_complete)return {ok:true,status:current.account_status,alreadyComplete:true};
    if(current&&current.account_status==='active')return {ok:true,status:'active',alreadyComplete:true};
    if(churchId&&!policy.activeChurch(church))fail(409,'Choose an active church.');
    const approved=!!church&&church.membership_approval_mode!=='manual';
    tx.set(userRef,{name,display_name:name,email:actor.email,roles:current?policy.roles(current):['member'],
     account_status:approved?'active':'pending',church_membership_status:approved?'approved':'pending',home_church_id:churchId,
     email_verified:actor.email_verified===true,member_signup_complete:true,
     business_name:String(input.businessName||'').slice(0,200),business_phone:String(input.businessPhone||'').slice(0,30),
     ...(current?{}:{created_at:timestamp()}),updated_at:timestamp()}, {merge:true});
    if(nomination)tx.set(db.doc('churches/nomination-'+actor.uid),{...nomination,admin_uid:null,listing_status:'pending',submission_type:'community_nomination',submitter_uid:actor.uid,submitter_email:actor.email,submission_date:timestamp()});
    queueMemberMail(db,tx,actor.uid,'welcome',timestamp,'welcome-'+actor.uid);
    if(!actor.email_verified)queueMemberMail(db,tx,actor.uid,'verification',timestamp,'verification-signup-'+actor.uid);
    return {ok:true,status:approved?'active':'pending',nominationSubmitted:!!nomination};
   });
  }
  const user=(await db.doc('users/'+id(actor.uid)).get()).data();
  if(!user||policy.isBlocked(user))fail(403,'Account access is suspended.');
  const isAdmin=policy.isAdmin(user);
  if (['setAdminUserRoles','setAdminUserStatus','moderateMemberReview'].includes(input.action)) {
   if (!isAdmin) fail(403, 'Administrator access required.');
   return runReviewTransaction(db, async tx => {
    const latest = (await tx.get(db.doc('users/'+actor.uid))).data();
    if (!latest || policy.isBlocked(latest) || !policy.isAdmin(latest)) fail(403, 'Administrator access required.');
    if (input.action === 'moderateMemberReview') {
     const ref = db.doc('reviews/'+id(input.reviewId)), review = (await tx.get(ref)).data();
     if (!review) fail(404, 'Review not found.');
     if (!['approved','flagged','pending','delete','notes'].includes(input.decision)) fail(400, 'Invalid moderation decision.');
     const next = input.decision === 'delete' ? null : { ...review,
      ...(input.decision === 'notes' ? {} : {status: input.decision}),
      ...(input.notes === undefined ? {} : {admin_notes: text(input.notes,0,5000,'notes')}),
      moderated_by: actor.uid, moderated_at: timestamp() };
     await writeReview(tx, db, ref, review, next, timestamp);
     tx.create(db.collection('activity_log').doc(), {user_id:actor.uid, activity_type:'review_moderation', details:'Review decision: '+input.decision, target_id:input.reviewId, target_type:'review', timestamp:timestamp()});
     return {ok:true};
    }
    const ref = db.doc('users/'+id(input.memberId)), target = (await tx.get(ref)).data();
    if (!target) fail(404, 'Member not found.');
    let changes;
    if (input.action === 'setAdminUserRoles') {
     const roles = policy.validateRoles(input.roles);
     if (input.memberId === actor.uid && !policy.isAdmin({roles})) fail(409, 'You cannot remove your own administrator access.');
     changes = {roles, is_sales_director:roles.includes('sales_director'), role: roles.includes(target.role) ? target.role : roles.find(role => role !== 'member') || 'member'};
    } else {
     if (!['active','pending','suspended','disabled','rejected'].includes(input.status)) fail(400, 'Invalid account status.');
     if (input.memberId === actor.uid && input.status !== 'active') fail(409, 'You cannot disable your own administrator access.');
     changes = {account_status: input.status, ...(input.status === 'active' ? {church_membership_status:'approved'} : {})};
    }
    tx.update(ref, {...changes, updated_at:timestamp()});
    tx.create(db.collection('activity_log').doc(), {user_id:actor.uid, activity_type:input.action, details:input.action === 'setAdminUserRoles' ? 'Account roles updated' : 'Account status changed to '+input.status, target_id:input.memberId, target_type:'user', timestamp:timestamp()});
    return {ok:true};
   });
  }
  if(input.action==='syncEmailVerification') {
   const record=await auth.getUser(actor.uid);
   await db.doc('users/'+actor.uid).update({email_verified:record.emailVerified,updated_at:timestamp()});return {ok:true,emailVerified:record.emailVerified};
  }
  if(input.action==='saveMemberReview'||input.action==='deleteMemberReview') {
   if(user.account_status!=='active')fail(403,'Approved membership is required to manage reviews.');
   const reviewRef=input.reviewId?db.doc('reviews/'+id(input.reviewId)):db.collection('reviews').doc();
   return runReviewTransaction(db, async tx=>{
    const latest=(await tx.get(db.doc('users/'+actor.uid))).data();
    if(!latest || latest.account_status!=='active')fail(403,'Approved membership is required to manage reviews.');
    const current=(await tx.get(reviewRef)).data();
    if(input.reviewId&&(!current||current.user_id!==actor.uid))fail(403,'This is not your review.');
    if(input.action==='deleteMemberReview'){await writeReview(tx,db,reviewRef,current,null,timestamp);return {ok:true};}
    const businessId=current?.business_id||id(input.businessId);
    const business=(await tx.get(db.doc('business_listings_public/'+businessId))).data();
    if(!business?.is_visible)fail(409,'This business is not available for reviews.');
    const rating=Number(input.rating);if(!Number.isInteger(rating)||rating<1||rating>5)fail(400,'Choose a rating from 1 to 5.');
    const reviewText=text(input.reviewText,10,2000,'review text');
    await writeReview(tx,db,reviewRef,current,{business_id:businessId,user_id:actor.uid,reviewer_name:String(user.display_name||user.name||'Member').slice(0,100),
     rating,review_text:reviewText,status:'pending',created_at:current?.created_at||timestamp(),updated_at:timestamp()},timestamp);
    return {ok:true,reviewId:reviewRef.id,status:'pending'};
   });
  }
  if(input.action==='saveMemberAdmin') {
   if(!isAdmin)fail(403,'Administrator access required.');
   const values=input.values||{};const name=text(values.name,2,100,'name');
   const status=values.account_status;if(!['active','pending','suspended','disabled','rejected'].includes(status))fail(400,'Invalid account status.');
   const role=values.role==='sales'?'sales_agent':values.role;
   policy.validateRoles([role]);
   let uid=input.memberId? id(input.memberId):null,created=false;
   if(!uid){const record=await auth.createUser({email:text(values.email,3,254,'email'),displayName:name});uid=record.uid;created=true;}
   try {
    const record=await auth.getUser(uid);
    if(input.memberId&&values.email&&values.email.toLowerCase()!==record.email.toLowerCase())fail(400,'Account email changes require a separate verified email flow.');
    if(uid===actor.uid&&(status!=='active'||!['admin','platform_admin'].includes(role)))fail(409,'You cannot remove your own administrator access.');
    await db.runTransaction(async tx=>{
     const ref=db.doc('users/'+uid),old=(await tx.get(ref)).data();
     const payload={name,email:record.email,role,roles:[...new Set(['member', ...(old && role === (old.role || policy.roles(old).find(r=>r!=='member') || 'member') ? policy.roles(old) : [role])])],account_status:status,
      email_verified:record.emailVerified,phone_number:String(values.phone_number||'').slice(0,30),
      notifications_enabled:values.notifications_enabled!==false,
      profile_photo_url:typeof values.profile_photo_url==='string'&&/^https:\/\//.test(values.profile_photo_url)?values.profile_photo_url:null,
      is_pro_user:values.is_pro_user===true,listing_count:Math.max(0,Number(values.listing_count)||0),review_count:Math.max(0,Number(values.review_count)||0),
      referral_code:String(values.referral_code||'').slice(0,100),admin_notes:String(values.admin_notes||'').slice(0,5000),updated_at:timestamp()};
     for(const field of ['pro_start_date','pro_end_date']) { const value=values[field]; if(value&&Number.isNaN(new Date(value).getTime()))fail(400,'Invalid membership date.');payload[field]=value?new Date(value):null; }
     if(status==='active')payload.church_membership_status='approved';
     if(created)payload.created_at=timestamp();
     tx.set(ref,payload,{merge:true});
     if(created)queueMemberMail(db,tx,uid,'invitation',timestamp);
     else if(status==='active'&&old?.account_status!=='active')queueMemberMail(db,tx,uid,'approved',timestamp);
    });
    return {ok:true,memberId:uid};
   }catch(error){if(created)await auth.deleteUser(uid);throw error;}
  }
  const self=input.action==='closeMemberAccount';
  if(!self&&!isAdmin)fail(403,'Administrator access required.');
  const uid=self?actor.uid:id(input.memberId);
  if(!self&&uid===actor.uid)fail(409,'Use member account settings to close your own account.');
  if(self&&(!Number.isFinite(actor.auth_time)||Date.now()/1000-actor.auth_time>300))fail(401,'Sign in again before closing your account.');
  const profile=(await db.doc('users/'+uid).get()).data();
  if(self&&policy.roles(profile||{}).some(r=>r!=='member'))fail(409,'Contact support to close an account with additional responsibilities.');
  const [businesses,churches]=await Promise.all([db.collection('business_listings_private').where('owner_uid','==',uid).limit(1).get(),db.collection('churches').where('admin_uid','==',uid).limit(1).get()]);
  if(!businesses.empty||!churches.empty)fail(409,'Transfer business and church ownership before closing this account.');
  // Disable access before cleanup. A failed cleanup can be safely retried by an administrator.
  try{await auth.updateUser(uid,{disabled:true});await auth.revokeRefreshTokens(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
  if(profile)await db.doc('users/'+uid).update({account_status:'disabled'});
  for(const [collection,field]of [['favorite_businesses','user_id'],['reviews','user_id'],['member_mail','uid']]) {
   while(true){const page=await db.collection(collection).where(field,'==',uid).limit(100).get();if(page.empty)break;if(collection==='reviews'){for(const review of page.docs)await runReviewTransaction(db, async tx=>{const latest=await tx.get(review.ref);if(latest.exists)await writeReview(tx,db,review.ref,latest.data(),null,timestamp)});}else{const batch=db.batch();page.docs.forEach(d=>batch.delete(d.ref));await batch.commit();}}
  }
  await bucket.deleteFiles({prefix:'users/'+uid+'/'});
  await db.recursiveDelete(db.doc('users/'+uid));
  try{await auth.deleteUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
  return {ok:true,closed:true};
 }
 return {execute};
}
module.exports={createMemberService,memberActions:actions};
