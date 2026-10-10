import { changeHierarchy } from '../../js/services/hierarchy-service.js';
import { db } from '../../js/firebase-config.js';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';

let churchId = null;
let churchData = null;

console.log('👥 Members module loaded');

requireAuth({ requireChurch: true }, async (userContext, firebaseUser, churchContext) => {
  console.log('🔐 Auth verified:', firebaseUser.email);
  
  if (!churchContext) {
    showError('No church found for your account.');
    return;
  }
  
  churchId = churchContext.id;
  churchData = churchContext;
  console.log('✅ Church:', churchId, churchData.church_name);
  
  initPage();
});

function initPage() {
  setupTabs();
  loadAllMembers();
  
  document.getElementById('loadingMessage').classList.add('hidden');
  document.getElementById('contentArea').classList.remove('hidden');
}

function showError(message) {
  console.error('❌', message);
  document.getElementById('loadingMessage').classList.add('hidden');
  const errorEl = document.getElementById('errorMessage');
  if (errorEl) {
    errorEl.querySelector('.error-text').textContent = message;
    errorEl.classList.remove('hidden');
  }
}

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
    });
  });
}

async function loadAllMembers() {
  try {
    const { members } = await changeHierarchy('listMembers', { churchId });
    const pending = [];
    const approved = [];
    const rejected = [];
    
    members.forEach(data => {
      const status = data.church_membership_status || 'pending';
      
      if (status === 'pending') pending.push(data);
      else if (status === 'approved') approved.push(data);
      else if (status === 'rejected') rejected.push(data);
    });
    
    document.getElementById('pendingCount').textContent = pending.length;
    document.getElementById('approvedCount').textContent = approved.length;
    document.getElementById('rejectedCount').textContent = rejected.length;
    
    renderMemberList('pendingList', pending, 'pending');
    renderMemberList('approvedList', approved, 'approved');
    renderMemberList('rejectedList', rejected, 'rejected');
    
    console.log(`📊 Members loaded: ${pending.length} pending, ${approved.length} approved, ${rejected.length} rejected`);
    
  } catch (err) {
    console.error('Error loading members:', err);
    showError('Failed to load members: ' + err.message);
  }
}

function renderMemberList(containerId, members, status) {
  const container = document.getElementById(containerId);
  
  if (members.length === 0) {
    const emptyMsg = status === 'pending' ? 'No pending requests' :
                     status === 'approved' ? 'No approved members yet' :
                     'No rejected requests';
    container.innerHTML = `<p class="text-muted text-center">${emptyMsg}</p>`;
    return;
  }
  
  container.innerHTML = members.map(member => {
    const name = member.name || member.email?.split('@')[0] || 'Unknown';
    const email = member.email || '';
    const joinDate = member.created_at ? new Date(member.created_at) : new Date();
    const dateStr = joinDate.toLocaleDateString();
    
    let actions = '';
    if (status === 'pending') {
      actions = `
        <button class="btn btn-gold btn-small" onclick="window.approveMember('${member.id}')">Approve</button>
        <button class="btn btn-danger btn-small" onclick="window.rejectMember('${member.id}')">Reject</button>
      `;
    } else if (status === 'approved') {
      actions = `
        <button class="btn btn-danger btn-small" onclick="window.rejectMember('${member.id}')">Remove</button>
      `;
    } else if (status === 'rejected') {
      actions = `
        <button class="btn btn-gold btn-small" onclick="window.approveMember('${member.id}')">Re-approve</button>
      `;
    }
    
    return `
      <div class="member-card">
        <div class="member-info">
          <div class="member-name">${escapeHtml(name)}</div>
          <div class="member-email">${escapeHtml(email)}</div>
          <div class="member-date">Requested: ${dateStr}</div>
        </div>
        <div class="member-actions">
          ${actions}
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.approveMember = async function(userId) {
  try {
    await changeHierarchy('reviewMember', { memberId: userId, churchId, decision: 'approve' });
    console.log('✅ Member approved:', userId);
    loadAllMembers();
  } catch (err) {
    console.error('Error approving member:', err);
    alert('Failed to approve member: ' + err.message);
  }
};

window.rejectMember = async function(userId) {
  if (!confirm('Are you sure you want to reject/remove this member?')) return;
  
  try {
    await changeHierarchy('reviewMember', { memberId: userId, churchId, decision: 'reject' });
    console.log('❌ Member rejected:', userId);
    loadAllMembers();
  } catch (err) {
    console.error('Error rejecting member:', err);
    alert('Failed to reject member: ' + err.message);
  }
};
