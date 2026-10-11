import { fetchChurchTithes } from '../../js/services/church-tithes.js';
import { changeHierarchy } from '../../js/services/hierarchy-service.js';
import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, getDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";
import { sendTemplate } from "../../js/email/email-service.js";
import { isBusinessPro } from "../../js/role-utils.js";

console.log('🏛️ Church Admin Dashboard JS loaded');

let churchId = null;
let churchData = null;
let currentUserId = null;

requireAuth({ requireChurch: true }, async (userContext, firebaseUser, churchContext) => {
  currentUserId = firebaseUser.uid;
  console.log('🔐 Auth verified:', firebaseUser.email);
  console.log('🏛️ Church context from auth:', churchContext ? churchContext.id : 'null');
  
  // Check for URL parameter first (for admins accessing specific church)
  const urlParams = new URLSearchParams(window.location.search);
  const urlChurchId = urlParams.get('id');
  
  const isAdmin = userContext.roles.includes('admin') || userContext.roles.includes('platform_admin');
  
  if (urlChurchId) {
    // Load specific church by ID (admin accessing a specific church)
    loadChurchById(urlChurchId, firebaseUser, isAdmin);
  } else if (churchContext) {
    // Use church from auth engine directly - no re-query needed
    churchId = churchContext.id;
    churchData = churchContext;
    console.log('✅ Using church from auth:', churchId, churchData.church_name);
    initDashboard();
  } else if (isAdmin) {
    // Admin without specific church - show church selector
    showChurchSelector();
  } else {
    // No church found
    showNoChurchMessage();
  }
});

async function loadChurchById(id, firebaseUser, isAdmin) {
  console.log('📥 Loading church by ID:', id);
  const loadingMessage = document.getElementById('loadingMessage');
  const noChurchMessage = document.getElementById('noChurchMessage');
  
  try {
    const churchDoc = await getDoc(doc(db, 'churches', id));
    
    if (!churchDoc.exists()) {
      if (loadingMessage) loadingMessage.classList.add('hidden');
      if (noChurchMessage) noChurchMessage.classList.remove('hidden');
      noChurchMessage.innerHTML = '<h2 class="gold-metallic">Church Not Found</h2><p>The requested church does not exist.</p><a href="/" class="btn btn-gold">← Back to Home</a>';
      return;
    }
    
    const data = churchDoc.data();
    
    // Verify access - must be admin, church contact by email, or church admin by UID
    if (!isAdmin && data.admin_uid !== firebaseUser.uid) {
      if (loadingMessage) loadingMessage.classList.add('hidden');
      if (noChurchMessage) noChurchMessage.classList.remove('hidden');
      noChurchMessage.innerHTML = '<h2 class="gold-metallic">Access Denied</h2><p>You do not have permission to view this church dashboard.</p><a href="/" class="btn btn-gold">← Back to Home</a>';
      return;
    }
    
    churchId = id;
    churchData = { id, ...data };
    
    initDashboard();
    
  } catch (error) {
    console.error('Error loading church by ID:', error);
    if (loadingMessage) loadingMessage.classList.add('hidden');
    if (noChurchMessage) {
      noChurchMessage.classList.remove('hidden');
      noChurchMessage.innerHTML = '<h2 class="gold-metallic">Error</h2><p>Failed to load church dashboard.</p><a href="/" class="btn btn-gold">← Back to Home</a>';
    }
  }
}

function initDashboard() {
  const loadingMessage = document.getElementById('loadingMessage');
  const noChurchMessage = document.getElementById('noChurchMessage');
  const dashboardContent = document.getElementById('dashboardContent');
  
  if (loadingMessage) loadingMessage.classList.add('hidden');
  if (noChurchMessage) noChurchMessage.classList.add('hidden');
  if (dashboardContent) dashboardContent.classList.remove('hidden');
  
  document.getElementById('churchName').textContent = churchData.church_name || 'Your Church';
  const viewLink = document.getElementById('viewPublicListing');
  if (viewLink) {
    viewLink.href = (churchData.slug && churchData.slug.trim())
      ? `../church?slug=${churchData.slug}` 
      : `../church?id=${churchId}`;
  }
  
  loadStats();
  loadPendingMembers();
  loadAffiliationRequests();
  calculateChurchProfileCompletion(churchData);
  loadWeeklyActivity();
}

function showNoChurchMessage() {
  const loadingMessage = document.getElementById('loadingMessage');
  const noChurchMessage = document.getElementById('noChurchMessage');
  
  if (loadingMessage) loadingMessage.classList.add('hidden');
  if (noChurchMessage) {
    noChurchMessage.classList.remove('hidden');
    noChurchMessage.innerHTML = '<div class="card p-lg text-center"><h2 class="gold-metallic mb-sm">No Church Found</h2><p class="text-muted mb-md">No church is associated with your account.</p><div class="button-row"><a href="/" class="btn btn-gold">← Back to Home</a></div></div>';
  }
}

async function showChurchSelector() {
  console.log('📋 Showing church selector for admin');
  const loadingMessage = document.getElementById('loadingMessage');
  const noChurchMessage = document.getElementById('noChurchMessage');
  
  try {
    const q = query(collection(db, 'churches'), where('listing_status', '==', 'active'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      if (loadingMessage) loadingMessage.classList.add('hidden');
      if (noChurchMessage) {
        noChurchMessage.classList.remove('hidden');
        noChurchMessage.innerHTML = '<div class="card p-lg text-center"><h2 class="gold-metallic mb-sm">No Churches Found</h2><p class="text-muted mb-md">There are no active churches in the system yet.</p><div class="button-row"><a href="/" class="btn btn-gold">← Back to Home</a></div></div>';
      }
      return;
    }
    
    let html = '<div class="card p-lg">';
    html += '<h2 class="gold-metallic mb-sm">Select a Church</h2>';
    html += '<p class="text-muted mb-md">Choose a church to manage its dashboard:</p>';
    html += '<div class="card-list" id="churchSelectorList"></div>';
    html += '<div class="button-row mt-lg"><a href="/" class="btn btn-secondary">← Back to Home</a></div>';
    html += '</div>';
    
    if (loadingMessage) loadingMessage.classList.add('hidden');
    if (noChurchMessage) {
      noChurchMessage.classList.remove('hidden');
      noChurchMessage.innerHTML = html;
    }
    
    const listContainer = document.getElementById('churchSelectorList');
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const card = document.createElement('div');
      card.className = 'card card-clickable mb-sm';
      card.style.cursor = 'pointer';
      card.innerHTML = `<h3 class="gold">${data.church_name || 'Unnamed Church'}</h3><p class="text-sm text-muted">${data.city || ''}, ${data.state || ''}</p>`;
      card.addEventListener('click', () => selectAndSaveChurch(docSnap.id, data.church_name));
      listContainer.appendChild(card);
    });
    
  } catch (error) {
    console.error('Error loading church list:', error);
    if (loadingMessage) loadingMessage.classList.add('hidden');
    if (noChurchMessage) {
      noChurchMessage.classList.remove('hidden');
      noChurchMessage.innerHTML = '<div class="card p-lg text-center"><h2 class="gold-metallic mb-sm">Error</h2><p class="text-muted mb-md">Failed to load churches. Please try again.</p><div class="button-row"><a href="/" class="btn btn-gold">← Back to Home</a></div></div>';
    }
  }
}

async function selectAndSaveChurch(selectedChurchId, churchName) {
  console.log('💾 Saving church selection:', selectedChurchId, churchName);
  
  if (!currentUserId) {
    console.error('No current user ID available');
    window.location.href = `?id=${selectedChurchId}`;
    return;
  }
  
  window.location.href = `?id=${encodeURIComponent(selectedChurchId)}`;
}

async function loadChurch(userEmail) {
  console.log('📥 Loading church for email:', userEmail);
  const loadingMessage = document.getElementById('loadingMessage');
  const noChurchMessage = document.getElementById('noChurchMessage');
  const dashboardContent = document.getElementById('dashboardContent');

  try {
    // Query all churches for this user's email
    const q = query(collection(db, "churches"), where("contact_email", "==", userEmail));
    console.log('🔍 Querying churches collection...');
    const querySnapshot = await getDocs(q);
    console.log('📊 Query result:', querySnapshot.size, 'churches found');

    // Find active or pending churches
    let activeChurch = null;
    let pendingChurch = null;
    
    querySnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.listing_status === 'active') {
        activeChurch = { id: docSnap.id, ...data };
      } else if (data.listing_status === 'pending') {
        pendingChurch = { id: docSnap.id, ...data };
      }
    });

    if (!activeChurch) {
      console.log('❌ No active church found for', userEmail);
      
      if (pendingChurch) {
        const submission = pendingChurch;
        console.log('⏳ Found pending church with status:', submission.listing_status);
          // Create elements safely without innerHTML
          const heading = document.createElement('h2');
          heading.className = 'gold-metallic mb-md';
          heading.textContent = '⏳ Your Church Submission is Pending';
          
          const p1 = document.createElement('p');
          p1.className = 'mb-md';
          p1.textContent = 'Thank you for submitting ';
          const strong = document.createElement('strong');
          strong.textContent = submission.church_name || 'your church';
          p1.appendChild(strong);
          p1.appendChild(document.createTextNode('!'));
          
          const p2 = document.createElement('p');
          p2.className = 'mb-md';
          p2.textContent = 'Your church is currently under review by our admin team. You\'ll receive an email once it\'s approved, or you can check back here later.';
          
          const p3 = document.createElement('p');
          p3.className = 'text-sm';
          p3.textContent = 'Submissions are typically reviewed within 24 hours.';
          
          const div = document.createElement('div');
          div.className = 'mt-lg';
          const link = document.createElement('a');
          link.href = '/';
          link.className = 'btn btn-gold';
          link.textContent = '← Back to Home';
          div.appendChild(link);
          
        noChurchMessage.textContent = '';
        noChurchMessage.appendChild(heading);
        noChurchMessage.appendChild(p1);
        noChurchMessage.appendChild(p2);
        noChurchMessage.appendChild(p3);
        noChurchMessage.appendChild(div);
      } else {
        // No submission found at all
        const heading = document.createElement('h2');
        heading.className = 'gold-metallic mb-md';
        heading.textContent = 'No Church Connected';
        
        const p1 = document.createElement('p');
        p1.className = 'mb-md';
        p1.textContent = 'Your email is not connected to any church in Kingdom Connects.';
        
        const p2 = document.createElement('p');
        p2.className = 'mb-md';
        p2.textContent = 'To get started, you can submit a church to be added to our directory.';
        
        const div = document.createElement('div');
        div.className = 'mt-lg';
        const link1 = document.createElement('a');
        link1.href = '/add_to_directory?role=church';
        link1.className = 'btn btn-gold';
        link1.textContent = 'Add a Church';
        const link2 = document.createElement('a');
        link2.href = '/';
        link2.className = 'action-button';
        link2.textContent = '← Back to Home';
        div.appendChild(link1);
        div.appendChild(document.createTextNode(' '));
        div.appendChild(link2);
        
        noChurchMessage.textContent = '';
        noChurchMessage.appendChild(heading);
        noChurchMessage.appendChild(p1);
        noChurchMessage.appendChild(p2);
        noChurchMessage.appendChild(div);
      }
      
      loadingMessage.classList.add('hidden');
      noChurchMessage.classList.remove('hidden');
      return;
    }

    // Use the active church we found
    churchId = activeChurch.id;
    churchData = activeChurch;
    console.log('✅ Church loaded:', churchData.church_name, '(ID:', churchId + ')');

    document.getElementById('viewPublicListing').href = (churchData.slug && churchData.slug.trim())
      ? `../church?slug=${churchData.slug}` 
      : `../church?id=${churchId}`;

    await loadStats();
    await loadPendingMembers();
    await loadAffiliationRequests();
    calculateChurchProfileCompletion(churchData);
    await loadWeeklyActivity();

    document.getElementById('churchName').textContent = churchData.church_name || 'Unknown Church';

    loadingMessage.classList.add('hidden');
    noChurchMessage.classList.add('hidden');
    dashboardContent.classList.remove('hidden');
    console.log('✅ Dashboard displayed');

  } catch (error) {
    console.error('❌ Error loading church:', error);
    loadingMessage.textContent = 'Error loading dashboard: ' + error.message;
    loadingMessage.classList.add('text-error');
  }
}

async function loadStats() {
  try {
    const [businesses, tithes] = await Promise.all([
      getDocs(query(collection(db, 'business_listings_public'), where('church_id', '==', churchId))), fetchChurchTithes(churchId)
    ]);
    document.getElementById('totalBusinesses').textContent = businesses.size;
    document.getElementById('proMembers').textContent = businesses.docs.filter(item => isBusinessPro(item.data())).length;
    document.getElementById('thisMonthTithe').textContent = '$' + tithes.month.toFixed(2);
    document.getElementById('totalTithe').textContent = '$' + tithes.total.toFixed(2);
  } catch (error) {
    for (const id of ['totalBusinesses','proMembers','thisMonthTithe','totalTithe']) document.getElementById(id).textContent = 'Unavailable';
    window.showToast('Could not load church statistics: ' + error.message, 'error');
  }
}

async function loadAffiliationRequests() {
  console.log('📬 Loading affiliation requests for church ID:', churchId);
  try {
    const requestsQuery = query(
      collection(db, "business_affiliation_requests"),
      where("church_id", "==", churchId),
      where("status", "==", "pending")
    );
    const requestsSnapshot = await getDocs(requestsQuery);
    
    const requestsCard = document.getElementById('affiliationRequestsCard');
    const requestsList = document.getElementById('pendingRequestsList');
    const noRequestsMessage = document.getElementById('noRequestsMessage');
    
    const pendingBadge = document.getElementById('pendingAffiliationBadge');
    
    if (requestsSnapshot.empty) {
      requestsCard.classList.add('hidden');
      noRequestsMessage.classList.remove('hidden');
      if (pendingBadge) pendingBadge.classList.add('hidden');
      console.log('No pending affiliation requests');
      return;
    }
    
    if (pendingBadge) {
      pendingBadge.textContent = requestsSnapshot.size;
      pendingBadge.classList.remove('hidden');
    }
    
    requestsCard.classList.remove('hidden');
    noRequestsMessage.classList.add('hidden');
    requestsList.innerHTML = '';
    
    requestsSnapshot.forEach((requestDoc) => {
      const request = requestDoc.data();
      
      const card = document.createElement('div');
      card.className = 'card';
      
      const heading = document.createElement('h4');
      heading.className = 'gold';
      heading.textContent = `${request.business_name || 'Business'} — ${request.kind === 'leave' ? 'Release request' : 'Join request'}`;
      
      const date = document.createElement('p');
      date.className = 'text-sm text-muted';
      const requestedDate = request.requested_date?.toDate ? request.requested_date.toDate() : new Date(request.requested_date);
      date.textContent = `Requested: ${requestedDate.toLocaleDateString()}`;
      
      const notes = document.createElement('p');
      notes.className = 'mt-sm';
      notes.textContent = request.notes || 'No additional notes.';
      
      const btnContainer = document.createElement('div');
      btnContainer.className = 'mt-md';
      
      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn btn-gold mr-sm';
      approveBtn.textContent = 'Approve';
      approveBtn.onclick = () => handleApproveRequest(requestDoc.id, request);
      
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn btn-danger';
      rejectBtn.textContent = 'Reject';
      rejectBtn.onclick = () => handleRejectRequest(requestDoc.id, request);
      
      btnContainer.appendChild(approveBtn);
      btnContainer.appendChild(rejectBtn);
      
      card.appendChild(heading);
      card.appendChild(date);
      card.appendChild(notes);
      card.appendChild(btnContainer);
      
      requestsList.appendChild(card);
    });
    
    console.log(`✅ Loaded ${requestsSnapshot.size} pending affiliation requests`);
    
  } catch (error) {
    console.error('❌ Error loading affiliation requests:', error);
  }
}

async function handleApproveRequest(requestId, requestData) {
  const confirmed = confirm(
    `Approve ${requestData.business_name} to join your church?\n\n` +
    `If approved:\n` +
    `• They will be affiliated with your church\n` +
    `• You'll receive 10% tithing from their Pro subscriptions\n` +
    `• They'll appear in your business directory\n` +
    `• They will be notified`
  );
  
  if (!confirmed) return;
  
  try {
    const businessRef = doc(db, "business_listings_public", requestData.business_id);
    const businessSnap = await getDoc(businessRef);
    const businessEmail = businessSnap.data()?.email;
    
    await changeHierarchy('reviewAffiliation', { businessId: requestData.business_id, churchId, decision: 'approve' });
    
    if (businessEmail) {
      try {
        await sendTemplate('church_approved_business', businessEmail, {
          business_name: requestData.business_name,
          church_name: churchData.church_name,
          dashboard_link: 'https://kingdomconnects.org/business-admin/'
        });
      } catch (emailError) {
        console.error('Email sending failed (non-fatal):', emailError);
      }
    }
    
    window.showToast(`${requestData.business_name}: affiliation request approved.`, 'success');
    
    // Reload requests and stats
    await loadAffiliationRequests();
    await loadStats();
    
  } catch (error) {
    console.error('Error approving request:', error);
    window.showToast('Error approving request: ' + error.message, 'error');
  }
}

async function handleRejectRequest(requestId, requestData) {
  const reason = prompt(
    `Why are you rejecting ${requestData.business_name}'s request?\n\n` +
    `This message will be sent to the business owner:`
  );
  
  if (reason === null) return; // User cancelled
  
  try {
    const businessRef = doc(db, "business_listings_public", requestData.business_id);
    const businessSnap = await getDoc(businessRef);
    const businessEmail = businessSnap.data()?.email;
    
    await changeHierarchy('reviewAffiliation', { businessId: requestData.business_id, churchId, decision: 'reject', reason });
    
    if (businessEmail) {
      try {
        await sendTemplate('church_rejected_business', businessEmail, {
          business_name: requestData.business_name,
          church_name: churchData.church_name,
          rejection_reason: reason || 'The church chose not to provide a specific reason.'
        });
      } catch (emailError) {
        console.error('Email sending failed (non-fatal):', emailError);
      }
    }
    
    window.showToast(`Request rejected. ${requestData.business_name} has been notified.`, 'success');
    
    // Reload requests
    await loadAffiliationRequests();
    
  } catch (error) {
    console.error('Error rejecting request:', error);
    window.showToast('Error rejecting request: ' + error.message, 'error');
  }
}

async function loadPendingMembers() {
  console.log('👥 Loading pending members for church ID:', churchId);
  try {
    const { members } = await changeHierarchy('listMembers', { churchId });
    const pending = members.filter(member => member.church_membership_status === 'pending');
    const membersSnapshot = { empty: pending.length === 0, size: pending.length,
      forEach: callback => pending.forEach(member => callback({ id: member.id, data: () => member })) };

    const membersCard = document.getElementById('pendingMembersCard');
    const membersList = document.getElementById('pendingMembersList');
    const noMembersMessage = document.getElementById('noMembersMessage');
    
    if (!membersCard || !membersList) {
      console.warn('Pending members UI elements not found');
      return;
    }
    
    const pendingCount = membersSnapshot.size;
    const membersBadge = document.getElementById('pendingMembersBadge');
    
    if (membersBadge) {
      if (pendingCount > 0) {
        membersBadge.textContent = pendingCount;
        membersBadge.classList.remove('hidden');
      } else {
        membersBadge.classList.add('hidden');
      }
    }
    
    if (membersSnapshot.empty) {
      membersCard.classList.add('hidden');
      if (noMembersMessage) noMembersMessage.classList.remove('hidden');
      console.log('No pending member requests');
      return;
    }
    
    membersCard.classList.remove('hidden');
    if (noMembersMessage) noMembersMessage.classList.add('hidden');
    membersList.innerHTML = '';
    
    membersSnapshot.forEach((memberDoc) => {
      const member = memberDoc.data();
      
      const card = document.createElement('div');
      card.className = 'card';
      
      const heading = document.createElement('h4');
      heading.className = 'gold';
      heading.textContent = member.name || member.email || 'Member';
      
      const email = document.createElement('p');
      email.className = 'text-sm text-muted';
      email.textContent = member.email || '';
      
      const date = document.createElement('p');
      date.className = 'text-sm text-muted';
      const createdDate = member.created_at?.toDate ? member.created_at.toDate() : new Date(member.created_at || Date.now());
      date.textContent = `Joined: ${createdDate.toLocaleDateString()}`;
      
      const btnContainer = document.createElement('div');
      btnContainer.className = 'mt-md';
      
      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn btn-gold mr-sm';
      approveBtn.textContent = 'Approve';
      approveBtn.onclick = () => handleApproveMember(memberDoc.id, member);
      
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn btn-danger';
      rejectBtn.textContent = 'Reject';
      rejectBtn.onclick = () => handleRejectMember(memberDoc.id, member);
      
      btnContainer.appendChild(approveBtn);
      btnContainer.appendChild(rejectBtn);
      
      card.appendChild(heading);
      card.appendChild(email);
      card.appendChild(date);
      card.appendChild(btnContainer);
      
      membersList.appendChild(card);
    });
    
    console.log(`✅ Loaded ${membersSnapshot.size} pending member requests`);
    
  } catch (error) {
    console.error('❌ Error loading pending members:', error);
  }
}

async function handleApproveMember(memberId, memberData) {
  const confirmed = confirm(
    `Approve ${memberData.name || memberData.email} as a member of your church?`
  );
  
  if (!confirmed) return;
  
  try {
    await changeHierarchy('reviewMember', { memberId, churchId, decision: 'approve' });
    
    if (memberData.email) {
      try {
        await sendTemplate('member_approved', memberData.email, {
          user_name: memberData.name || 'Member',
          church_name: churchData.church_name,
          dashboard_url: `${window.location.origin}/member/index`
        });
      } catch (emailError) {
        console.error('Email sending failed (non-fatal):', emailError);
      }
    }
    
    window.showToast(`${memberData.name || 'Member'} has been approved!`, 'success');
    
    await loadPendingMembers();
    
  } catch (error) {
    console.error('Error approving member:', error);
    window.showToast('Error approving member: ' + error.message, 'error');
  }
}

async function handleRejectMember(memberId, memberData) {
  const confirmed = confirm(
    `Reject ${memberData.name || memberData.email}'s membership request?\n\nThey will be notified and can still browse the directory or try joining another church.`
  );
  
  if (!confirmed) return;
  
  try {
    await changeHierarchy('reviewMember', { memberId, churchId, decision: 'reject' });
    
    if (memberData.email) {
      try {
        await sendTemplate('member_rejected', memberData.email, {
          user_name: memberData.name || 'Member',
          church_name: churchData.church_name
        });
      } catch (emailError) {
        console.error('Email sending failed (non-fatal):', emailError);
      }
    }
    
    window.showToast(`Membership request rejected. ${memberData.name || 'Member'} has been notified.`, 'success');
    
    await loadPendingMembers();
    
  } catch (error) {
    console.error('Error rejecting member:', error);
    window.showToast('Error rejecting member: ' + error.message, 'error');
  }
}

function calculateChurchProfileCompletion(church) {
  const completionSection = document.getElementById('churchProfileCompletion');
  const completionFill = document.getElementById('churchCompletionFill');
  const completionPercent = document.getElementById('churchCompletionPercent');
  const completionTip = document.getElementById('churchCompletionTip');
  const taskList = document.getElementById('churchCompletionTasks');
  const completionStar = document.getElementById('churchCompletionStar');
  
  if (!completionSection || !completionFill || !completionPercent) {
    return;
  }

  const tasks = [
    { key: 'church_name', label: 'Add church name', link: '/church-admin/profile', check: c => !!c.church_name },
    { key: 'description', label: 'Add description', link: '/church-admin/profile', check: c => c.description && c.description.length >= 50 },
    { key: 'phone', label: 'Add phone number', link: '/church-admin/profile', check: c => !!c.contact_phone },
    { key: 'address', label: 'Add address', link: '/church-admin/profile', check: c => !!c.address_line1 },
    { key: 'website', label: 'Add website URL', link: '/church-admin/profile', check: c => !!c.website }
  ];

  let completed = 0;
  const incompleteTasks = [];

  tasks.forEach(task => {
    if (task.check(church)) {
      completed++;
    } else {
      incompleteTasks.push({ label: task.label, link: task.link });
    }
  });

  const percent = Math.round((completed / tasks.length) * 100);
  
  completionFill.style.width = percent + '%';
  completionPercent.textContent = percent + '%';

  if (taskList && completionTip) {
    if (incompleteTasks.length > 0 && incompleteTasks.length <= 3) {
      taskList.innerHTML = incompleteTasks.map(t => `<li><a href="${t.link}" class="completion-link">${t.label}</a></li>`).join('');
      completionTip.textContent = 'Complete these to attract more members:';
    } else if (incompleteTasks.length > 3) {
      taskList.innerHTML = incompleteTasks.slice(0, 3).map(t => `<li><a href="${t.link}" class="completion-link">${t.label}</a></li>`).join('');
      completionTip.textContent = `${incompleteTasks.length} items left to complete:`;
    } else {
      taskList.innerHTML = '';
      completionTip.textContent = 'Your church profile is fully optimized!';
    }
  }

  // Always show the section - at 100% show gold star reward
  completionSection.classList.remove('hidden');
  
  if (percent === 100 && completionStar) {
    completionStar.classList.remove('hidden');
    completionPercent.classList.add('hidden');
  } else if (completionStar) {
    completionStar.classList.add('hidden');
    completionPercent.classList.remove('hidden');
  }
}

async function loadWeeklyActivity() {
  const activitySection = document.getElementById('recentActivity');
  const newBizEl = document.getElementById('newBusinessesWeek');
  const proUpEl = document.getElementById('proUpgradesWeek');
  const titheEl = document.getElementById('titheWeek');
  
  if (!activitySection || !newBizEl || !proUpEl || !titheEl) {
    return;
  }

  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const q = query(collection(db, "business_listings_public"), where("church_id", "==", churchId));
    const querySnapshot = await getDocs(q);

    let newBusinesses = 0;
    let proUpgrades = 0;
    let weekTithe = 0;

    for (const bizDoc of querySnapshot.docs) {
      const business = bizDoc.data();
      
      if (business.created_at) {
        try {
          const createdDate = business.created_at.toDate ? business.created_at.toDate() : new Date(business.created_at);
          if (createdDate >= oneWeekAgo) {
            newBusinesses++;
          }
        } catch (e) { /* skip invalid date */ }
      }

      if (business.pro_start_date) {
        try {
          const proDate = business.pro_start_date.toDate ? business.pro_start_date.toDate() : new Date(business.pro_start_date);
          if (proDate >= oneWeekAgo) {
            proUpgrades++;
          }
        } catch (e) { /* skip invalid date */ }
      }

    }
    weekTithe = (await fetchChurchTithes(churchId)).week;

    newBizEl.textContent = newBusinesses;
    proUpEl.textContent = proUpgrades;
    titheEl.textContent = '$' + weekTithe.toFixed(2);

    if (newBusinesses > 0 || proUpgrades > 0 || weekTithe > 0) {
      activitySection.classList.remove('hidden');
    }

  } catch (error) {
    console.error('Error loading weekly activity:', error);
  }
}
