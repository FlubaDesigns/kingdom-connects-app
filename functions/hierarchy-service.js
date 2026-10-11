'use strict';
const policy = require('./hierarchy-policy');
const { queueMemberMail } = require('./member-mail');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const id = value => {
  if (typeof value !== 'string' || !value || value.includes('/') || value.length > 128) fail(400, 'Invalid record ID.');
  return value;
};

function createHierarchyService(db, timestamp) {
  const ref = (collection, value) => db.collection(collection).doc(id(value));
  const data = snap => snap.exists ? snap.data() : null;

  async function execute(actor, input) {
    if (!input || typeof input.action !== 'string') fail(400, 'Action is required.');
    return db.runTransaction(async tx => {
      const userRef = ref('users', actor.uid);
      const user = data(await tx.get(userRef));
      if (!user || policy.isBlocked(user)) fail(403, 'Your account cannot make this change.');
      const admin = policy.isAdmin(user);
      const churchFor = async churchId => churchId ? data(await tx.get(ref('churches', churchId))) : null;
      const manages = church => admin || (policy.activeChurch(church) && church.admin_uid === actor.uid);
      const update = (target, changes) => tx.update(target, { ...changes, updated_at: timestamp() });

      if (input.action === 'listMembers') {
        const church = await churchFor(input.churchId);
        if (!manages(church)) fail(403, 'This church is not under your authority.');
        const members = await tx.get(db.collection('users').where('home_church_id', '==', id(input.churchId)));
        return { ok: true, members: members.docs.map(document => {
          const member = document.data();
          return { id: document.id, name: member.name || member.display_name || '', email: member.email || '',
            church_membership_status: member.church_membership_status || 'pending',
            created_at: member.created_at?.toDate?.().toISOString() || null };
        }) };
      }

      if (input.action === 'syncEntityRole') {
        if (!['business', 'church'].includes(input.entityType)) fail(400, 'Unsupported entity type.');
        const entity = data(await tx.get(ref(input.entityType === 'business' ? 'business_listings_private' : 'churches', input.entityId)));
        if (!entity || (input.entityType === 'business' ? entity.owner_uid : entity.admin_uid) !== actor.uid) fail(403, 'You do not own this record.');
        update(userRef, { roles: [...new Set([...policy.roles(user), 'member', input.entityType === 'business' ? 'business_owner' : 'church_admin'])] });
        return { ok: true };
      }

      if (input.action === 'setMemberChurch') {
        const churchId = input.churchId || null;
        const church = await churchFor(churchId);
        if (churchId && !policy.activeChurch(church)) fail(409, 'Choose an active church.');
        if ((user.home_church_id || null) === churchId && ['pending', 'approved'].includes(user.church_membership_status)) return { ok: true, status: user.church_membership_status };
        const approved = !!church && church.membership_approval_mode !== 'manual';
        update(userRef, { home_church_id: churchId, church_membership_status: approved ? 'approved' : 'pending',
          account_status: approved ? 'active' : 'pending', membership_approved_by: approved ? churchId : null,
          membership_approved_at: approved ? timestamp() : null });
        if (approved) queueMemberMail(db, tx, actor.uid, 'approved', timestamp);
        return { ok: true, status: approved ? 'approved' : 'pending' };
      }

      if (input.action === 'reviewMember') {
        if (!['approve', 'reject'].includes(input.decision)) fail(400, 'Invalid membership decision.');
        const targetRef = ref('users', input.memberId);
        const member = data(await tx.get(targetRef));
        if (!member || (!admin && (input.churchId !== member.home_church_id || !member.home_church_id))) fail(403, 'This member is not under your church.');
        const church = await churchFor(member.home_church_id);
        if (!manages(church) || (!admin && policy.isBlocked(member))) fail(403, 'Membership review is not permitted.');
        if (member.church_membership_status === (input.decision === 'approve' ? 'approved' : 'rejected')) fail(409, 'This decision has already been saved.');
        const approved = input.decision === 'approve';
        update(targetRef, { church_membership_status: approved ? 'approved' : 'rejected',
          account_status: approved ? 'active' : 'pending', home_church_id: member.home_church_id || null,
          membership_approved_by: approved ? actor.uid : null, membership_approved_at: approved ? timestamp() : null });
        queueMemberMail(db, tx, input.memberId, approved ? 'approved' : 'rejected', timestamp);
        return { ok: true };
      }

      if (input.action === 'setChurchStatus') {
        if (!admin) fail(403, 'Only the platform administrator can change church status.');
        if (!['active', 'suspended', 'rejected'].includes(input.status)) fail(400, 'Invalid church status.');
        const churchRef = ref('churches', input.churchId);
        if (!data(await tx.get(churchRef))) fail(404, 'Church not found.');
        update(churchRef, { listing_status: input.status, ...(input.notes === undefined ? {} : {admin_notes: String(input.notes).slice(0,5000)}) });
        return { ok: true, churchId: input.churchId };
      }

      const businessRef = ref('business_listings_public', input.businessId);
      const privateRef = ref('business_listings_private', input.businessId);
      const requestRef = ref('business_affiliation_requests', input.businessId);
      const [businessSnap, privateSnap, requestSnap] = await Promise.all([tx.get(businessRef), tx.get(privateRef), tx.get(requestRef)]);
      const business = data(businessSnap), privateBusiness = data(privateSnap), request = data(requestSnap);
      if (!business || !privateBusiness) fail(404, 'Business not found.');
      const church = await churchFor(business.church_id);
      const owns = privateBusiness.owner_uid === actor.uid;
      const saveBusiness = changes => {
        const next = { ...business, ...changes };
        update(businessRef, { ...changes, ...policy.businessState(next, church) });
      };

      if (input.action === 'requestAffiliation') {
        if (!owns && !admin) fail(403, 'Only the business owner can request affiliation.');
        if (business.listing_status === 'suspended' && !admin) fail(403, 'A suspended business cannot change churches.');
        if (request?.status === 'pending') fail(409, 'There is already a pending request.');
        const leaving = input.kind === 'leave';
        if (!leaving && business.church_id) fail(409, 'Your current church must release the business before it joins another church.');
        if (leaving && !business.church_id) fail(409, 'This business has no church affiliation.');
        const targetId = leaving ? business.church_id : id(input.churchId);
        const targetChurch = leaving ? church : await churchFor(targetId);
        if (!policy.activeChurch(targetChurch)) fail(409, 'The church is not active. Contact the platform administrator.');
        const approved = !leaving && targetChurch.auto_approve_businesses !== false;
        tx.set(requestRef, { business_id: input.businessId, business_name: business.business_name,
          church_id: targetId, church_name: targetChurch.church_name, requested_by_uid: actor.uid,
          kind: leaving ? 'leave' : 'join', status: approved ? 'approved' : 'pending', requested_date: timestamp() });
        if (approved) {
          const changes = { church_id: targetId, church_approved: true, church_suspended: false };
          update(businessRef, { ...changes, ...policy.businessState({ ...business, ...changes }, targetChurch) });
        }
        return { ok: true, status: approved ? 'approved' : 'pending' };
      }

      if (input.action === 'cancelAffiliation') {
        if ((!owns && !admin) || request?.requested_by_uid !== actor.uid && !admin) fail(403, 'This is not your request.');
        if (request?.status !== 'pending') fail(409, 'There is no pending request to cancel.');
        update(requestRef, { status: 'cancelled' });
        return { ok: true };
      }

      if (input.action === 'reviewAffiliation') {
        if (!['approve', 'reject'].includes(input.decision)) fail(400, 'Invalid affiliation decision.');
        if (request?.status !== 'pending') fail(409, 'This request is no longer pending.');
        const targetChurch = await churchFor(request.church_id);
        if (!manages(targetChurch) || (!admin && input.churchId !== request.church_id)) fail(403, 'This request belongs to another church.');
        if (input.decision === 'approve') {
          if (request.kind === 'leave' && business.church_id !== request.church_id) fail(409, 'The affiliation has changed.');
          if (request.kind !== 'leave' && business.church_id && business.church_id !== request.church_id) fail(409, 'The business already belongs to another church.');
          const changes = { church_id: request.kind === 'leave' ? null : request.church_id,
            church_approved: request.kind !== 'leave', church_suspended: false, is_featured: false };
          update(businessRef, { ...changes, ...policy.businessState({ ...business, ...changes }, targetChurch) });
        }
        update(requestRef, { status: input.decision === 'approve' ? 'approved' : 'rejected',
          reviewed_by_uid: actor.uid, reviewed_date: timestamp(), rejection_reason: String(input.reason || '').slice(0,1000) });
        return { ok: true };
      }

      if (!manages(church)) fail(403, 'This business is not under your authority.');
      if (input.action === 'removeBusiness') {
        saveBusiness({ church_id: null, church_approved: false, church_suspended: false, is_featured: false });
      } else if (input.action === 'featureBusiness') {
        if (typeof input.featured !== 'boolean') fail(400, 'Featured must be true or false.');
        update(businessRef, { is_featured: input.featured });
      } else if (input.action === 'reviewBusiness') {
        if (!['approve', 'suspend', 'activate', 'reject'].includes(input.decision)) fail(400, 'Invalid business decision.');
        const prefix = admin ? 'platform' : 'church';
        const changes = { [`${prefix}_suspended`]: input.decision === 'suspend' };
        if (admin) changes.platform_review_status = input.decision === 'reject' ? 'rejected' : input.decision === 'suspend' ? 'suspended' : 'approved';
        if (['approve', 'activate', 'reject'].includes(input.decision)) changes[`${prefix}_approved`] = input.decision !== 'reject';
        saveBusiness(changes);
        if (admin && input.notes !== undefined) update(privateRef, {admin_notes: String(input.notes).slice(0,5000)});
        if (input.decision === 'approve') update(privateRef, { approved_at: timestamp(), approved_by: actor.uid });
      } else fail(400, 'Unsupported hierarchy action.');
      return { ok: true };
    });
  }

  async function syncChurchBusinesses(churchId) {
    const snapshot = await db.collection('business_listings_public').where('church_id', '==', churchId).get();
    // Re-read each parent and child in a transaction so a concurrent transfer or reactivation wins correctly.
    for (const document of snapshot.docs) {
      await db.runTransaction(async tx => {
        const [businessSnap, churchSnap] = await Promise.all([tx.get(document.ref), tx.get(ref('churches', churchId))]);
        const business = data(businessSnap);
        if (business?.church_id === churchId) tx.update(document.ref, { ...policy.businessState(business, data(churchSnap)), updated_at: timestamp() });
      });
    }
  }
  return { execute, syncChurchBusinesses };
}
module.exports = { createHierarchyService };
