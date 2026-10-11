import { escapeHtml } from '../../js/utils.js';
import { onReady } from '../../js/dom-ready.js';
import { adminReady } from './admin-auth-guard.js';
await adminReady;
import { db, auth } from '../../js/firebase-config.js';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  doc, 
  updateDoc, 
  getDoc,
  serverTimestamp,
  where 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let allSubmissions = [];
let currentSubmissionId = null;

const CATEGORY_LABELS = {
  general: 'General Inquiry',
  support: 'Support',
  dashboard_feedback: 'Dashboard Feedback'
};

const SUBCATEGORY_LABELS = {
  feedback: 'Feedback',
  partnerships: 'Partnerships',
  chapters: 'Starting a Chapter',
  account: 'Account Issues',
  listing: 'Listing Help',
  pro_upgrade: 'Pro Upgrade',
  technical: 'Technical Issue',
  suggestion: 'Suggestion',
  problem: 'Report a Problem',
  feature_request: 'Feature Request',
  other: 'Other'
};

const DASHBOARD_LABELS = {
  admin: 'Admin Dashboard',
  member: 'Member Admin',
  business: 'Business Dashboard',
  church: 'Church Dashboard',
  sales: 'Sales Dashboard',
  marketing: 'Marketing Dashboard',
  unknown: 'Unknown'
};

onReady(() => {
  loadSubmissions();
  setupFilters();
  setupModal();
  document.getElementById('submissionsList').addEventListener('click', event => {
    const button = event.target.closest('[data-response-id]');
    if (button) window.openResponseModal(button.dataset.responseId);
  });
});

async function loadSubmissions() {
  const loadingEl = document.getElementById('loadingMessage');
  const listEl = document.getElementById('submissionsList');
  const emptyEl = document.getElementById('emptyState');

  try {
    const q = query(collection(db, 'contact_submissions'), orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);
    
    allSubmissions = [];
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      let userRole = 'Unknown';
      
      if (data.user_id) {
        try {
          const userDoc = await getDoc(doc(db, 'users', data.user_id));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const roles = userData.roles || [];
            userRole = formatRoles(roles);
          }
        } catch (e) {
          console.log('Could not fetch user role');
        }
      }
      
      allSubmissions.push({
        ...data,
        id: docSnap.id,
        status: data.status || "new",
        user_role: userRole
      });
    }

    updateStats();
    applyFilters();

    loadingEl.classList.add('hidden');

  } catch (error) {
    console.error('Error loading submissions:', error);
    loadingEl.textContent = 'Error loading submissions. Please refresh.';
  }
}

function formatRoles(roles) {
  if (!roles || roles.length === 0) return 'Guest';
  
  const roleLabels = {
    platform_admin: 'Platform Admin',
    admin: 'Admin',
    sales_director: 'Sales Director',
    sales: 'Sales Agent',
    church_admin: 'Church Admin',
    business_owner: 'Business Owner',
    member: 'Member'
  };
  
  return roles.map(r => roleLabels[r] || r).join(', ');
}

function updateStats() {
  document.getElementById('totalNew').textContent = allSubmissions.filter(s => s.status === 'new').length;
  document.getElementById('totalPending').textContent = allSubmissions.filter(s => s.status === 'pending').length;
  document.getElementById('totalResolved').textContent = allSubmissions.filter(s => s.status === 'resolved').length;
  document.getElementById('totalAll').textContent = allSubmissions.length;
}

function setupFilters() {
  const filterStatus = document.getElementById('filterStatus');
  const filterCategory = document.getElementById('filterCategory');
  const filterSource = document.getElementById('filterSource');
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearFilters');

  [filterStatus, filterCategory, filterSource].forEach(el => {
    el.addEventListener('change', applyFilters);
  });

  searchInput.addEventListener('input', debounce(applyFilters, 300));

  clearBtn.addEventListener('click', () => {
    filterStatus.value = '';
    filterCategory.value = '';
    filterSource.value = '';
    searchInput.value = '';
    applyFilters();
  });
}

function applyFilters() {
  const status = document.getElementById('filterStatus').value;
  const category = document.getElementById('filterCategory').value;
  const source = document.getElementById('filterSource').value;
  const search = document.getElementById('searchInput').value.toLowerCase();

  let filtered = allSubmissions;

  if (status) {
    filtered = filtered.filter(s => s.status === status);
  }
  if (category) {
    filtered = filtered.filter(s => s.category === category);
  }
  if (source) {
    filtered = filtered.filter(s => (s.source || 'contact') === source);
  }
  if (search) {
    filtered = filtered.filter(s => 
      (s.name || '').toLowerCase().includes(search) ||
      (s.email || '').toLowerCase().includes(search) ||
      (s.subject || '').toLowerCase().includes(search)
    );
  }

  renderSubmissions(filtered);
}

function renderSubmissions(submissions) {
  const listEl = document.getElementById('submissionsList');
  const emptyEl = document.getElementById('emptyState');

  if (submissions.length === 0) {
    listEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');

  listEl.innerHTML = submissions.map(s => {
    const statusClass = s.status === 'new' ? 'status-new' : s.status === 'pending' ? 'status-pending' : 'status-resolved';
    const date = s.created_at?.toDate ? s.created_at.toDate().toLocaleDateString() : 'Unknown';
    const time = s.created_at?.toDate ? s.created_at.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
    const sourceLabel = s.source === 'widget' ? 'Widget' : 'Contact Form';
    const dashboardLabel = s.dashboard ? DASHBOARD_LABELS[s.dashboard] : '';

    return `
      <article class="card submission-card" data-id="${escapeHtml(s.id)}">
        <div class="submission-header">
          <div class="submission-meta">
            <span class="submission-status ${statusClass}">${escapeHtml(s.status.toUpperCase())}</span>
            <span class="submission-source">${sourceLabel}</span>
            ${dashboardLabel ? `<span class="submission-dashboard">${dashboardLabel}</span>` : ''}
          </div>
          <div class="submission-date">${date} ${time}</div>
        </div>
        
        <div class="submission-user">
          <div class="user-info">
            <strong class="gold">${escapeHtml(s.name || 'Unknown')}</strong>
            <span class="user-email">${escapeHtml(s.email || 'No email')}</span>
          </div>
          <div class="user-role">
            <span class="role-badge">${escapeHtml(s.user_role)}</span>
          </div>
        </div>

        <div class="submission-category">
          <span class="category-label">${escapeHtml(CATEGORY_LABELS[s.category] || s.category)}</span>
          ${s.subcategory ? `<span class="subcategory-label">${escapeHtml(SUBCATEGORY_LABELS[s.subcategory] || s.subcategory)}</span>` : ''}
        </div>

        <h4 class="submission-subject">${escapeHtml(s.subject || 'No subject')}</h4>
        <p class="submission-message">${escapeHtml(s.message || 'No message')}</p>

        ${s.admin_response ? `
          <div class="admin-response-preview">
            <strong>Your Response:</strong> ${escapeHtml(s.admin_response.substring(0, 100))}${s.admin_response.length > 100 ? '...' : ''}
          </div>
        ` : ''}

        <div class="submission-actions">
          <button class="btn btn-gold btn-small" data-response-id="${escapeHtml(s.id)}">
            ${s.admin_response ? 'View / Edit Response' : 'Respond'}
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function setupModal() {
  const modal = document.getElementById('responseModal');
  const closeBtn = document.getElementById('closeModal');
  const cancelBtn = document.getElementById('cancelResponse');
  const saveBtn = document.getElementById('saveResponse');

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  saveBtn.addEventListener('click', saveResponse);
}

window.openResponseModal = function(id) {
  currentSubmissionId = id;
  const submission = allSubmissions.find(s => s.id === id);
  if (!submission) return;

  const detailsEl = document.getElementById('submissionDetails');
  const responseEl = document.getElementById('adminResponse');
  const statusEl = document.getElementById('newStatus');
  const modal = document.getElementById('responseModal');

  const date = submission.created_at?.toDate ? submission.created_at.toDate().toLocaleString() : 'Unknown';

  detailsEl.innerHTML = `
    <div class="detail-grid">
      <div class="detail-row">
        <span class="detail-label">From:</span>
        <span class="detail-value"><strong>${escapeHtml(submission.name)}</strong> (${escapeHtml(submission.email)})</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Role:</span>
        <span class="detail-value role-badge">${escapeHtml(submission.user_role)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Category:</span>
        <span class="detail-value">${escapeHtml(CATEGORY_LABELS[submission.category] || submission.category)} - ${escapeHtml(SUBCATEGORY_LABELS[submission.subcategory] || submission.subcategory || 'N/A')}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Source:</span>
        <span class="detail-value">${submission.source === 'widget' ? 'Dashboard Widget' : 'Contact Form'}${submission.dashboard ? ` (${DASHBOARD_LABELS[submission.dashboard]})` : ''}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Date:</span>
        <span class="detail-value">${date}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Subject:</span>
        <span class="detail-value">${escapeHtml(submission.subject || 'No subject')}</span>
      </div>
    </div>
    <div class="message-box">
      <strong>Message:</strong>
      <p>${escapeHtml(submission.message)}</p>
    </div>
  `;

  responseEl.value = submission.admin_response || '';
  statusEl.value = submission.status === 'resolved' ? 'resolved' : 'pending';

  modal.classList.remove('hidden');
};

function closeModal() {
  document.getElementById('responseModal').classList.add('hidden');
  currentSubmissionId = null;
}

async function saveResponse() {
  if (!currentSubmissionId) return;

  const response = document.getElementById('adminResponse').value.trim();
  const newStatus = document.getElementById('newStatus').value;
  const saveBtn = document.getElementById('saveResponse');

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const user = auth.currentUser;
    await updateDoc(doc(db, 'contact_submissions', currentSubmissionId), {
      admin_response: response || null,
      status: newStatus,
      responded_at: response ? serverTimestamp() : null,
      responded_by: response ? (user?.email || 'admin') : null
    });

    const idx = allSubmissions.findIndex(s => s.id === currentSubmissionId);
    if (idx !== -1) {
      allSubmissions[idx].admin_response = response;
      allSubmissions[idx].status = newStatus;
    }

    updateStats();
    applyFilters();
    closeModal();

  } catch (error) {
    console.error('Error saving response:', error);
    alert('Failed to save response. Please try again.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Response';
  }
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}
