'use strict';
const { randomUUID } = require('node:crypto');
const { isBlocked } = require('./hierarchy-policy');
const BASE = 'https://kingdom-commerce.web.app';
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function queueMemberMail(db, writer, uid, kind, timestamp, key = randomUUID()) {
  writer.set(db.collection('member_mail').doc(key), { uid, kind, status:'pending', created_at:timestamp() });
  return key;
}
function createMemberMailDelivery(db, auth, client, timestamp) {
  return async function deliver(ref) {
    const snap = await ref.get();
    if (!snap.exists || ['sent','cancelled'].includes(snap.data().status)) return;
    const mail = snap.data();
    let user;
    try { user = await auth.getUser(mail.uid); } catch(error) {
      if (error.code !== 'auth/user-not-found') throw error;
      await ref.update({status:'cancelled',reason:'account_removed'}); return;
    }
    if (user.disabled) { await ref.update({status:'cancelled',reason:'account_disabled'}); return; }
    const profile = (await db.doc('users/' + mail.uid).get()).data();
    if (profile && (isBlocked(profile) || (mail.kind==='approved' && profile.account_status!=='active') || (mail.kind==='rejected' && profile.church_membership_status!=='rejected'))) { await ref.update({status:'cancelled',reason:'membership_changed'}); return; }
    if (!profile) { await ref.update({status:'cancelled',reason:'profile_removed'}); return; }
    if (!mail.payload) {
      let subject, message, link = BASE + '/member/', label = 'Open your account';
      const name = escape(profile.display_name || profile.name || 'Member');
      switch(mail.kind) {
        case 'welcome': subject='Welcome to Kingdom Connects'; message='Your account is ready. Your dashboard shows your current church approval status.'; break;
        case 'approved': subject='Your Kingdom Connects membership is approved'; message='Your membership has been approved. You can now open your member dashboard.'; break;
        case 'rejected': subject='Your Kingdom Connects membership request'; message='Your church membership request was not approved. You can choose another church from your account settings.'; link=BASE+'/member/settings'; break;
        case 'verification':
          if (user.emailVerified) { await ref.update({status:'cancelled',reason:'already_verified'}); return; }
          subject='Verify your Kingdom Connects email';message='Confirm that this email address belongs to you.';label='Verify email';
          link=await auth.generateEmailVerificationLink(user.email,{url:BASE+'/member/settings?verified=true'});break;
        case 'invitation':
          subject='Your Kingdom Connects member account';message='Your account has been created. Choose your password to sign in.';label='Choose password';
          link=await auth.generatePasswordResetLink(user.email,{url:BASE+'/login'});break;
        default: throw new Error('Unknown member email kind.');
      }
      // Freeze content before sending so retries reuse the exact idempotent request.
      mail.payload={from:'Kingdom Connects <support@kingdomconnects.org>',to:user.email,subject,
        html:`<h1>${subject}</h1><p>Hello ${name},</p><p>${message}</p><p><a href="${escape(link)}">${label}</a></p>`,
        text:`Hello ${profile.name || 'Member'},\n\n${message}\n\n${link}`};
      mail.payload=await db.runTransaction(async tx=>{
        const current=await tx.get(ref);
        if(!current.exists)return null;
        if(current.data().payload)return current.data().payload;
        tx.update(ref,{payload:mail.payload});return mail.payload;
      });
      if(!mail.payload)return;
    }
    const {data,error}=await client.emails.send(mail.payload,{idempotencyKey:'kc-member-'+ref.id});
    if(error) { await ref.update({status:'pending',last_error:String(error.name || 'delivery_error')}); throw new Error('Member email delivery failed.'); }
    await ref.update({status:'sent',message_id:data.id,sent_at:timestamp()});
  };
}
module.exports={queueMemberMail,createMemberMailDelivery};
