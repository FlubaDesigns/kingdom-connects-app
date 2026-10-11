import { changeHierarchy } from '../../js/services/hierarchy-service.js';
import { db } from "../../js/firebase-config.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAdmin } from "./admin-auth-guard.js";

let currentMember = null;
let allMembers = [];
let editingMemberId = null;

requireAdmin((userContext, firebaseUser) => {
  currentMember = firebaseUser;
  loadMembers();
});

document.getElementById('btnCreateMember').addEventListener('click', openCreateModal);
document.getElementById('btnCancelModal').addEventListener('click', closeModal);
document.getElementById('searchInput').addEventListener('input', renderMembers);
document.getElementById('filterRole').addEventListener('change', renderMembers);
document.getElementById('filterStatus').addEventListener('change', renderMembers);
document.getElementById('sortFilter').addEventListener('change', renderMembers);
document.getElementById('clearFilters').addEventListener('click', clearFilters);
document.getElementById('memberForm').addEventListener('submit', saveMember);
document.getElementById('memberRole').addEventListener('change', toggleSalesSection);
document.getElementById('memberIsPro').addEventListener('change', toggleProFields);

function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterRole').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('sortFilter').value = '';
  renderMembers();
}

function toggleSalesSection() {
  const role = document.getElementById('memberRole').value;
  if (role === 'sales_agent') {
    document.getElementById('salesSection').classList.remove('hidden');
  } else {
    document.getElementById('salesSection').classList.add('hidden');
  }
}

function toggleProFields() {
  const isPro = document.getElementById('memberIsPro').checked;
  if (isPro) {
    document.getElementById('proFields').classList.remove('hidden');
  } else {
    document.getElementById('proFields').classList.add('hidden');
  }
}

async function loadMembers() {
  try {
    const membersQuery = query(collection(db, "users"), orderBy("created_at", "desc"));
    const membersSnapshot = await getDocs(membersQuery);

    if (membersSnapshot.empty) {
      document.getElementById('loadingMessage').classList.add('hidden');
      document.getElementById('emptyState').classList.remove('hidden');
      return;
    }

    allMembers = membersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    updateStats();
    renderMembers();

    document.getElementById('loadingMessage').classList.add('hidden');
    document.getElementById('contentArea').classList.remove('hidden');

  } catch (error) {
    console.error('Error loading members:', error);
    document.getElementById('loadingMessage').classList.add('hidden');
    document.getElementById('errorMessage').classList.remove('hidden');
  }
}

function updateStats() {
  const totalMembers = allMembers.length;
  const churchAdmins = allMembers.filter(m => {
    const roles = Array.isArray(m.roles) ? m.roles : (m.role ? [m.role] : []);
    return roles.includes('church_admin');
  }).length;
  const businessOwners = allMembers.filter(m => {
    const roles = Array.isArray(m.roles) ? m.roles : (m.role ? [m.role] : []);
    return roles.includes('business_owner');
  }).length;
  const proMembers = allMembers.filter(m => m.is_pro_user === true).length;

  document.getElementById('totalMembers').textContent = totalMembers;
  document.getElementById('churchAdmins').textContent = churchAdmins;
  document.getElementById('businessOwners').textContent = businessOwners;
  document.getElementById('proMembers').textContent = proMembers;
}

function renderMembers() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const filterRole = document.getElementById('filterRole').value;
  const filterStatus = document.getElementById('filterStatus').value;
  const sortValue = document.getElementById('sortFilter').value;
  let filtered = [...allMembers];

  if (searchTerm) {
    filtered = filtered.filter(m => 
      (m.name || '').toLowerCase().includes(searchTerm) ||
      (m.email || '').toLowerCase().includes(searchTerm)
    );
  }

  if (filterRole) {
    filtered = filtered.filter(m => {
      const roles = Array.isArray(m.roles) ? m.roles : (m.role ? [m.role] : []);
      return roles.includes(filterRole);
    });
  }
  if (filterStatus) {
    filtered = filtered.filter(m => (m.account_status || 'pending') === filterStatus);
  }

  if (sortValue) {
    const [field, direction] = sortValue.split('-');
    const asc = direction === 'asc';
    filtered.sort((a, b) => {
      let aVal = a[field] || '';
      let bVal = b[field] || '';
      if (field === 'created_at') {
        aVal = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
        bVal = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
      }
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return asc ? -1 : 1;
      if (aVal > bVal) return asc ? 1 : -1;
      return 0;
    });
  }

  const tbody = document.getElementById('memberTableBody');
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="8" class="empty-state-table">No members match the selected filters</td>';
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach(member => {
    const tr = document.createElement('tr');
    tr.className = 'business-row';
    
    const displayRole = Array.isArray(member.roles) ? member.roles.join(', ') : (member.role || 'member');
    const roleClass = `role-${member.role || (Array.isArray(member.roles) && member.roles[0]) || 'member'}`;
    
    const displayStatus = member.account_status || 'pending';
    const statusClass = `status-${displayStatus}`;
    
    const createdDate = member.created_at?.toDate ? member.created_at.toDate().toLocaleDateString() : 'N/A';
    const proIcon = member.is_pro_user ? '⭐' : '-';
    const listingCount = member.listing_count || 0;

    tr.innerHTML = `
      <td data-label="Email">${escapeHtml(member.email || 'No email')}</td>
      <td data-label="Name">${escapeHtml(member.name || 'N/A')}</td>
      <td data-label="Role"><span class="role-badge ${roleClass}">${escapeHtml(displayRole)}</span></td>
      <td data-label="Status"><span class="status-badge ${statusClass}">${escapeHtml(displayStatus)}</span></td>
      <td data-label="Pro" class="text-center">${proIcon}</td>
      <td data-label="Listings" class="text-center">${listingCount}</td>
      <td data-label="Created">${createdDate}</td>
      <td data-label="Actions">
        <div class="action-buttons">
          <button class="btn btn-small btn-secondary" data-action="editMember" data-id="${member.id}">Edit</button>
          <button class="btn btn-small btn-danger" data-action="deleteMember" data-id="${member.id}" data-email="${escapeHtml(member.email || 'this member')}">Delete</button>
        </div>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
}

function openCreateModal() {
  editingMemberId = null;
  document.getElementById('modalTitle').textContent = 'Create Member';
  document.getElementById('memberForm').reset();
  document.getElementById('memberEmail').readOnly=false;
  document.getElementById('memberStatus').value = 'active';
  document.getElementById('memberNotificationsEnabled').checked = true;
  document.getElementById('modalStatus').textContent = '';
  document.getElementById('salesSection').classList.add('hidden');
  document.getElementById('proFields').classList.add('hidden');
  document.getElementById('memberModal').classList.remove('hidden');
}

window.editMember = function(memberId) {
  const member = allMembers.find(m => m.id === memberId);
  if (!member) return;

  editingMemberId = memberId;
  document.getElementById('modalTitle').textContent = 'Edit Member';
  
  document.getElementById('memberEmail').value = member.email || '';
  document.getElementById('memberEmail').readOnly=true;
  document.getElementById('memberName').value = member.name || '';
  document.getElementById('memberPhone').value = member.phone_number || '';
  document.getElementById('memberPhoto').value = member.profile_photo_url || '';
  document.getElementById('memberRole').value = member.role || member.roles?.find(role=>role!=='member') || 'member';
  document.getElementById('memberStatus').value = member.account_status || 'pending';
  document.getElementById('memberReferralCode').value = member.referral_code || '';
  document.getElementById('memberIsPro').checked = member.is_pro_user || false;
  document.getElementById('memberListingCount').value = member.listing_count || 0;
  document.getElementById('memberReviewCount').value = member.review_count || 0;
  document.getElementById('memberNotificationsEnabled').checked = member.notifications_enabled !== false;
  document.getElementById('memberEmailVerified').checked = member.email_verified || false;
  document.getElementById('memberAdminNotes').value = member.admin_notes || '';
  
  if (member.pro_start_date?.toDate) {
    document.getElementById('memberProStart').value = member.pro_start_date.toDate().toISOString().split('T')[0];
  }
  if (member.pro_end_date?.toDate) {
    document.getElementById('memberProEnd').value = member.pro_end_date.toDate().toISOString().split('T')[0];
  }
  
  toggleSalesSection();
  toggleProFields();
  document.getElementById('modalStatus').textContent = '';
  document.getElementById('memberModal').classList.remove('hidden');
};

window.deleteMember = async function(memberId, memberEmail) {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Delete Member', `Delete ${memberEmail}? This action cannot be undone.`, 'Delete', 'danger')
    : confirm(`Are you sure you want to delete ${memberEmail}? This action cannot be undone.`);
  if (!confirmed) return;

  try {
    await changeHierarchy('deleteMemberAccount', {memberId});

    window.showToast('Member deleted completely', 'success');
    await loadMembers();
  } catch (error) {
    console.error('Error deleting member:', error);
    window.showToast('Error deleting member: ' + error.message, 'error');
  }
};

function closeModal() {
  document.getElementById('memberModal').classList.add('hidden');
  document.getElementById('memberForm').reset();
  editingMemberId = null;
}

async function saveMember(e) {
  e.preventDefault();

  const statusDiv = document.getElementById('modalStatus');
  statusDiv.className = 'text-muted';
  statusDiv.textContent = 'Saving...';

  const memberData = {
    email: document.getElementById('memberEmail').value.trim(),
    name: document.getElementById('memberName').value.trim(),
    phone_number: document.getElementById('memberPhone').value.trim() || null,
    profile_photo_url: document.getElementById('memberPhoto').value.trim() || null,
    role: document.getElementById('memberRole').value,
    account_status: document.getElementById('memberStatus').value,
    is_pro_user: document.getElementById('memberIsPro').checked,
    listing_count: parseInt(document.getElementById('memberListingCount').value) || 0,
    review_count: parseInt(document.getElementById('memberReviewCount').value) || 0,
    notifications_enabled: document.getElementById('memberNotificationsEnabled').checked,
    admin_notes: document.getElementById('memberAdminNotes').value.trim() || null,
    updated_at: serverTimestamp()
  };

  if (document.getElementById('memberRole').value === 'sales_agent') {
    let referralCode = document.getElementById('memberReferralCode').value.trim();
    if (!referralCode && !editingMemberId) {
      referralCode = memberData.name.substring(0, 4).toUpperCase() + Math.floor(Math.random() * 10000);
    }
    memberData.referral_code = referralCode || null;
  }

  if (memberData.is_pro_user) {
    const startDate = document.getElementById('memberProStart').value;
    const endDate = document.getElementById('memberProEnd').value;
    memberData.pro_start_date = startDate ? new Date(startDate).toISOString() : null;
    memberData.pro_end_date = endDate ? new Date(endDate).toISOString() : null;
  } else {
    memberData.pro_start_date = null;
    memberData.pro_end_date = null;
  }

  try {
    await changeHierarchy('saveMemberAdmin', {memberId:editingMemberId,values:memberData});
    statusDiv.className='text-success';
    statusDiv.textContent=editingMemberId?'Member updated.':'Member created; password setup email queued.';

    setTimeout(() => {
      closeModal();
      loadMembers();
    }, 1000);

  } catch (error) {
    console.error('Error saving member:', error);
    statusDiv.className = 'text-error';
    statusDiv.textContent = 'Error: ' + error.message;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.addEventListener('click', (e) => {
  if (e.target.id === 'memberModal') {
    closeModal();
  }
});

document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.getAttribute('data-action');
  const id = button.getAttribute('data-id');
  
  switch(action) {
    case 'editMember':
      if (window.editMember) window.editMember(id);
      break;
    case 'deleteMember':
      const email = button.getAttribute('data-email');
      if (window.deleteMember) window.deleteMember(id, email);
      break;
  }
});
