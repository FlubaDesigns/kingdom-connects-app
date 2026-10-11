import { escapeHtml } from '../../js/business-presentation.js';
import { mergeBusiness } from '../../js/services/business-service.js';
import { changeHierarchy } from '../../js/services/hierarchy-service.js';
import { db } from "../../js/firebase-config.js";
import { collection, getDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, arrayUnion, arrayRemove, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAdmin } from "./admin-auth-guard.js";
import { normalizeUserRoles } from "../../js/role-utils.js";

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

let currentUser = null;
let allUsers = [];
let allChurchSubmissions = [];
let allBusinessSubmissions = [];

const loadingMessage = document.getElementById('loadingMessage');
const contentArea = document.getElementById('contentArea');
const emptyState = document.getElementById('emptyState');
const errorMessage = document.getElementById('errorMessage');
const resultsList = document.getElementById('resultsList');
const filterRole = document.getElementById('filterRole');
const filterStatus = document.getElementById('filterStatus');
const searchInput = document.getElementById('searchInput');
const btnClearFilters = document.getElementById('btnClearFilters');

requireAdmin((userContext, firebaseUser) => {
  currentUser = firebaseUser;
  loadAllData();
});

filterRole.addEventListener('change', updateStatusOptions);
filterStatus.addEventListener('change', renderResults);
searchInput.addEventListener('input', debounce(renderResults, 300));
btnClearFilters.addEventListener('click', clearFilters);

async function loadAllData() {
  try {
    const [usersSnapshot, churchesSnapshot, businessesSnapshot] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(query(collection(db, "churches"), where("listing_status", "==", "pending"))),
      getDocs(query(collection(db, "business_listings_public"), where("listing_status", "==", "pending")))
    ]);

    allUsers = usersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'user' }));
    allChurchSubmissions = churchesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'church_submission' }));
    allBusinessSubmissions = businessesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, type: 'business_submission' })).filter(business => business.platform_approved !== true && business.platform_review_status !== 'rejected');

    allBusinessSubmissions = await Promise.all(allBusinessSubmissions.map(async business => {
      const privateDoc = await getDoc(doc(db, 'business_listings_private', business.id));
      return { ...mergeBusiness(business.id, business, privateDoc.data()), type:'business_submission' };
    }));
    allUsers.sort((a,b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
    updateStats();
    updateStatusOptions();
    renderResults();

    loadingMessage.classList.add('hidden');
    contentArea.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading data:', error);
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
  }
}

function updateStats() {
  const activeUsers = allUsers.filter(u => (u.account_status || 'active') === 'active').length;
  const pendingChurches = allChurchSubmissions.filter(s => s.listing_status === 'pending').length;
  const pendingBusinesses = allBusinessSubmissions.filter(s => s.listing_status === 'pending').length;
  const pendingUsers = allUsers.filter(u => u.account_status === 'pending').length;
  const totalPending = pendingChurches + pendingBusinesses + pendingUsers;
  
  const churchAdmins = allUsers.filter(u => {
    const roles = Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : []);
    return roles.includes('church_admin');
  }).length;
  
  const businessOwners = allUsers.filter(u => {
    const roles = Array.isArray(u.roles) ? u.roles : (u.role ? [u.role] : []);
    return roles.includes('business_owner');
  }).length;

  document.getElementById('totalUsers').textContent = activeUsers;
  document.getElementById('pendingSubmissions').textContent = totalPending;
  document.getElementById('businessOwners').textContent = businessOwners;
  document.getElementById('churchAdmins').textContent = churchAdmins;
}

function updateStatusOptions() {
  const role = filterRole.value;
  const currentStatus = filterStatus.value;
  
  filterStatus.innerHTML = `
    <option value="active">Active</option>
    <option value="suspended">Suspended</option>
    <option value="pending">Pending Submissions</option>
  `;
  
  if (currentStatus) {
    filterStatus.value = currentStatus;
  }
  
  renderResults();
}

function renderResults() {
  const role = filterRole.value;
  const status = filterStatus.value;
  const search = searchInput.value.toLowerCase().trim();
  
  let results = [];
  
  if (status === 'pending') {
    // Include pending church and business submissions
    if (!role || role === 'church_admin') {
      results = results.concat(allChurchSubmissions.filter(s => s.listing_status === 'pending'));
    }
    if (!role || role === 'business_owner') {
      results = results.concat(allBusinessSubmissions.filter(s => s.listing_status === 'pending'));
    }
    // Also include pending USERS (members awaiting approval)
    if (!role || role === 'member') {
      const pendingUsers = allUsers.filter(u => u.account_status === 'pending');
      results = results.concat(pendingUsers);
    }
  } else {
    results = allUsers.filter(u => {
      const userStatus = u.account_status || 'active';
      if (userStatus !== status) return false;
      
      if (role) {
        if (Array.isArray(u.roles)) {
          if (!u.roles.includes(role)) return false;
        } else if (u.role !== role) {
          return false;
        }
      }
      
      return true;
    });
  }
  
  if (search) {
    results = results.filter(item => {
      const name = (item.name || item.church_name || item.business_name || '').toLowerCase();
      const email = (item.email || '').toLowerCase();
      return name.includes(search) || email.includes(search);
    });
  }
  
  if (results.length === 0) {
    resultsList.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  resultsList.innerHTML = results.map(item => {
    if (item.type === 'user') {
      return renderUserCard(item);
    } else if (item.type === 'church_submission') {
      return renderChurchSubmissionCard(item);
    } else if (item.type === 'business_submission') {
      return renderBusinessSubmissionCard(item);
    }
  }).join('');
  
  attachEventListeners();
}

function renderUserCard(user) {
  const displayRole = Array.isArray(user.roles) ? user.roles.join(', ') : (user.role || 'member');
  const displayStatus = user.account_status || 'active';
  const createdDate = user.created_at?.toDate ? user.created_at.toDate().toLocaleDateString() : 'N/A';
  const proIcon = user.is_pro_user ? '⭐ PRO' : '';
  
  return `
    <div class="card">
      <div class="flex-between-center mb-sm">
        <h3 class="gold m-0">${escapeHtml(user.name || 'Unnamed User')}</h3>
        <span class="badge-gold">${escapeHtml(displayRole)}</span>
      </div>
      
      <div class="grid-2 gap-sm mb-md">
        <div>
          <p class="text-sm opacity-70 mb-xs"><strong>Email:</strong></p>
          <p class="text-md">${escapeHtml(user.email || 'No email')}</p>
        </div>
        <div>
          <p class="text-sm opacity-70 mb-xs"><strong>Status:</strong></p>
          <p class="text-md">${displayStatus} ${proIcon}</p>
        </div>
      </div>
      
      <div class="mb-md">
        <p class="text-sm opacity-70 mb-xs"><strong>Member Since:</strong> ${createdDate}</p>
      </div>
      
      <div class="flex-gap-sm">
        <button class="btn btn-small btn-gold" data-action="editUser" data-id="${user.id}">Edit Roles</button>
        <button class="btn btn-small btn-secondary" data-action="toggleStatus" data-id="${user.id}" data-current="${displayStatus}">
          ${displayStatus === 'active' ? 'Suspend' : 'Activate'}
        </button>
        <button class="btn btn-small btn-danger" data-action="deleteUser" data-id="${user.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderChurchSubmissionCard(sub) {
  const submittedDate = sub.submission_date ? new Date(sub.submission_date.seconds * 1000).toLocaleDateString() : 'Unknown';
  const submissionType = sub.submission_type === 'pastor_registration' ? 'Pastor Registration' : 'Community Nomination';
  
  return `
    <div class="card">
      <div class="flex-between-center mb-sm">
        <h3 class="gold m-0">⛪ ${escapeHtml(sub.church_name)}</h3>
        <span class="badge-secondary">Church</span>
      </div>
      
      <div class="grid-2 gap-sm mb-md">
        <div>
          <p class="text-sm opacity-70 mb-xs"><strong>Location:</strong></p>
          <p class="text-md">${escapeHtml(sub.state)}</p>
        </div>
        <div>
          <p class="text-sm opacity-70 mb-xs"><strong>Submitted:</strong></p>
          <p class="text-md">${submittedDate}</p>
        </div>
      </div>
      
      <div class="mb-md">
        <p class="text-sm opacity-70 mb-xs"><strong>Type:</strong> ${submissionType}</p>
        ${sub.submission_type === 'pastor_registration' 
          ? `<p class="text-sm opacity-70"><strong>${escapeHtml(sub.representative_title)}:</strong> ${escapeHtml(sub.representative_name)}</p>`
          : `<p class="text-sm opacity-70"><strong>Nominated by:</strong> ${escapeHtml(sub.nominator_name)}${sub.nominator_business ? ' (' + escapeHtml(sub.nominator_business) + ')' : ''}</p>`
        }
      </div>
      
      <div class="card-highlight mb-md">
        <p class="text-sm mb-xs"><strong>📞 Contact Info:</strong></p>
        <p class="text-sm"><strong>Phone:</strong> <a href="tel:${escapeHtml(sub.contact_phone || sub.phone_number || sub.phone || '')}">${escapeHtml(sub.contact_phone || sub.phone_number || sub.phone || '')}</a></p>
        <p class="text-sm"><strong>Email:</strong> <a href="mailto:${escapeHtml(sub.contact_email || sub.email || sub.owner_email || '')}">${escapeHtml(sub.contact_email || sub.email || sub.owner_email || '')}</a></p>
      </div>
      
      <div class="mb-md">
        <label for="notes-${sub.id}" class="form-label">Admin Notes (optional):</label>
        <textarea id="notes-${sub.id}" class="input-dark" rows="2" placeholder="Any notes about this submission..."></textarea>
      </div>
      
      <div class="flex-gap-sm">
        <button class="btn btn-gold flex-1" data-action="approveChurch" data-id="${sub.id}">✓ Approve</button>
        <button class="btn btn-danger flex-1" data-action="rejectChurch" data-id="${sub.id}">✗ Reject</button>
      </div>
    </div>
  `;
}

function renderBusinessSubmissionCard(sub) {
  const submittedDate = sub.submission_date ? new Date(sub.submission_date.seconds * 1000).toLocaleDateString() : 'Unknown';
  
  return `
    <div class="card">
      <div class="flex-between-center mb-sm">
        <h3 class="gold m-0">💼 ${escapeHtml(sub.business_name)}</h3>
        <span class="badge-secondary">Business</span>
      </div>
      
      <div class="grid-2 gap-sm mb-md">
        <div>
          <p class="text-sm opacity-70 mb-xs"><strong>Owner:</strong></p>
          <p class="text-md">${escapeHtml(sub.your_name || sub.owner_name || 'Unknown')}</p>
        </div>
        <div>
          <p class="text-sm opacity-70 mb-xs"><strong>Submitted:</strong></p>
          <p class="text-md">${submittedDate}</p>
        </div>
      </div>
      
      <div class="mb-md">
        <p class="text-sm opacity-70 mb-xs"><strong>Location:</strong> ${escapeHtml(sub.city)}, ${escapeHtml(sub.state)} ${escapeHtml(sub.zip_code || '')}</p>
        <p class="text-sm opacity-70"><strong>Category:</strong> ${escapeHtml(sub.primary_category || 'None')}</p>
      </div>
      
      ${sub.description ? `<div class="mb-md"><p class="text-sm">${escapeHtml(sub.description)}</p></div>` : ''}
      
      <div class="card-highlight mb-md">
        <p class="text-sm mb-xs"><strong>📞 Contact Info:</strong></p>
        <p class="text-sm"><strong>Phone:</strong> <a href="tel:${escapeHtml(sub.contact_phone || sub.phone_number || sub.phone || '')}">${escapeHtml(sub.contact_phone || sub.phone_number || sub.phone || '')}</a></p>
        <p class="text-sm"><strong>Email:</strong> <a href="mailto:${escapeHtml(sub.contact_email || sub.email || sub.owner_email || '')}">${escapeHtml(sub.contact_email || sub.email || sub.owner_email || '')}</a></p>
        ${sub.website_url || sub.website ? `<p class="text-sm"><strong>Website:</strong> ${escapeHtml(sub.website_url || sub.website)}</p>` : ''}
      </div>
      
      <div class="mb-md">
        <label for="notes-${sub.id}" class="form-label">Admin Notes (optional):</label>
        <textarea id="notes-${sub.id}" class="input-dark" rows="2" placeholder="Any notes about this submission..."></textarea>
      </div>
      
      <div class="flex-gap-sm">
        <button class="btn btn-gold flex-1" data-action="approveBusiness" data-id="${sub.id}">✓ Approve</button>
        <button class="btn btn-danger flex-1" data-action="rejectBusiness" data-id="${sub.id}">✗ Reject</button>
      </div>
    </div>
  `;
}

function attachEventListeners() {
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleAction);
  });
}

async function handleAction(e) {
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;
  
  if (action === 'editUser') {
    await editUserRoles(id);
  } else if (action === 'toggleStatus') {
    await toggleUserStatus(id, e.target.dataset.current);
  } else if (action === 'deleteUser') {
    await deleteUser(id);
  } else if (action === 'approveChurch') {
    await approveChurch(id);
  } else if (action === 'rejectChurch') {
    await rejectSubmission(id, 'churches');
  } else if (action === 'approveBusiness') {
    await approveBusiness(id);
  } else if (action === 'rejectBusiness') {
    await rejectSubmission(id, 'business_listings_public');
  }
}

async function editUserRoles(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  
  const currentRoles = normalizeUserRoles(user);
  const rolesStr = currentRoles.join(', ');
  
  const newRolesInput = await window.showInputDialog(
    'Edit User Roles',
    `Update roles for ${user.email}\n\nAvailable roles: member, business_owner, church_admin, sales_agent, sales_director, admin, platform_admin`,
    rolesStr,
    { placeholder: 'Enter roles (comma-separated)', confirmText: 'Update Roles' }
  );
  
  if (newRolesInput === null) return;
  
  const newRoles = newRolesInput.split(',').map(r => r.trim()).filter(r => r);
  
  try {
    await changeHierarchy('setAdminUserRoles', { memberId: userId, roles: newRoles });
    window.showToast('Roles updated!', 'success');
    await loadAllData();
  } catch (error) {
    console.error('Error updating roles:', error);
    window.showToast('Error updating roles: ' + error.message, 'error');
  }
}

async function toggleUserStatus(userId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
  
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog(
        newStatus === 'suspended' ? 'Suspend User' : 'Activate User',
        `${newStatus === 'suspended' ? 'Suspend' : 'Activate'} this user?`,
        newStatus === 'suspended' ? 'Suspend' : 'Activate',
        newStatus === 'suspended' ? 'warning' : 'success'
      )
    : confirm(`${newStatus === 'suspended' ? 'Suspend' : 'Activate'} this user?`);
  if (!confirmed) return;
  
  try {
    await changeHierarchy('setAdminUserStatus', { memberId: userId, status: newStatus });
    window.showToast(`User ${newStatus}`, 'success');
    await loadAllData();
  } catch (error) {
    console.error('Error updating status:', error);
    window.showToast('Error: ' + error.message, 'error');
  }
}

async function deleteUser(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;
  
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Delete User', `DELETE user ${user.email}?\n\nThis action cannot be undone!`, 'Delete Forever', 'danger')
    : confirm(`DELETE user ${user.email}?\n\nThis action cannot be undone!`);
  if (!confirmed) return;
  
  try {
    await changeHierarchy('deleteMemberAccount', { memberId: userId });

    window.showToast('User deleted completely', 'success');
    await loadAllData();
  } catch (error) {
    console.error('Error deleting user:', error);
    window.showToast('Error: ' + error.message, 'error');
  }
}

async function approveChurch(id) {
  try {
    await changeHierarchy('setChurchStatus', { churchId: id, status: 'active', notes: document.getElementById(`notes-${id}`).value });
    window.showToast('Church approved.', 'success');
    await loadAllData();
  } catch (error) { window.showToast(error.message, 'error'); }
}

async function approveBusiness(id) {
  try {
    await changeHierarchy('reviewBusiness', { businessId: id, decision: 'approve', notes: document.getElementById(`notes-${id}`).value });
    window.showToast('Platform approval saved. Church approval is also required for publication.', 'success');
    await loadAllData();
  } catch (error) { window.showToast(error.message, 'error'); }
}

async function rejectSubmission(submissionId, collectionName) {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Reject Submission', 'Reject this submission?\n\nThis action cannot be undone.', 'Reject', 'danger')
    : confirm('Reject this submission?\n\nThis action cannot be undone.');
  if (!confirmed) return;
  
  try {
    if (collectionName === 'churches') {
      await changeHierarchy('setChurchStatus', { churchId: submissionId, status: 'rejected', notes: document.getElementById(`notes-${submissionId}`).value });
    } else {
      await changeHierarchy('reviewBusiness', { businessId: submissionId, decision: 'reject', notes: document.getElementById(`notes-${submissionId}`).value });
    }
    window.showToast('Submission rejected', 'success');
    await loadAllData();
  } catch (error) {
    console.error('Error rejecting submission:', error);
    window.showToast('Error: ' + error.message, 'error');
  }
}

function clearFilters() {
  filterRole.value = '';
  filterStatus.value = 'active';
  searchInput.value = '';
  updateStatusOptions();
}
