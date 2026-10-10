import { db, auth } from "../../js/firebase-config.js";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  updateDoc,
  addDoc,
  orderBy,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { normalizeUserRoles } from "../../js/role-utils.js";
import { sendCustomEmail } from "../../js/email/email-service.js";
import { requireAuth } from "../../js/auth/access-control.js";

const API_BASE = '';

let currentUser = null;
let applications = [];
let currentFilter = 'pending';

requireAuth({ roles: ['marketing_manager', 'admin'] }, (userContext, firebaseUser) => {
  currentUser = firebaseUser;
  loadApplications();
  setupEventListeners();
});

function showAccessDenied() {
  const main = document.getElementById('main');
  if (main) {
    main.innerHTML = `
      <div class="card text-center">
        <div class="text-error text-xl mb-md">Access Denied</div>
        <p class="text-muted mb-lg">This page requires Marketing Manager or Admin privileges.</p>
        <a href="/" class="btn btn-gold">Return to Home</a>
      </div>
    `;
  }
}

async function checkAccess() {
  try {
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    if (!userDoc.exists()) return false;
    
    const userData = userDoc.data();
    const userRoles = normalizeUserRoles(userData);
    
    const allowedRoles = ['marketing_manager', 'admin', 'platform_admin'];
    return userRoles.some(role => allowedRoles.includes(role));
  } catch (error) {
    console.error('Error checking access:', error);
    return false;
  }
}

async function loadApplications() {
  try {
    const applicationsQuery = query(
      collection(db, "sales_applications"),
      orderBy("created_at", "desc")
    );
    
    const snapshot = await getDocs(applicationsQuery);
    applications = [];
    
    snapshot.forEach(docSnap => {
      applications.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
    
    updateStats();
    renderApplications();
    
  } catch (error) {
    console.error('Error loading applications:', error);
    document.getElementById('loadingMessage').innerHTML = '<p class="text-error">Error loading applications.</p>';
  }
}

function updateStats() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const pending = applications.filter(a => a.status === 'pending').length;
  const approved = applications.filter(a => {
    if (a.status !== 'approved') return false;
    const reviewedAt = a.reviewed_at?.toDate();
    return reviewedAt && reviewedAt >= thirtyDaysAgo;
  }).length;
  const rejected = applications.filter(a => {
    if (a.status !== 'rejected') return false;
    const reviewedAt = a.reviewed_at?.toDate();
    return reviewedAt && reviewedAt >= thirtyDaysAgo;
  }).length;
  
  document.getElementById('pendingCount').textContent = pending;
  document.getElementById('approvedCount').textContent = approved;
  document.getElementById('rejectedCount').textContent = rejected;
}

function renderApplications() {
  const listEl = document.getElementById('applicationsList');
  const loadingEl = document.getElementById('loadingMessage');
  const emptyEl = document.getElementById('emptyState');
  
  loadingEl.classList.add('hidden');
  
  const filtered = applications.filter(a => a.status === currentFilter);
  
  if (filtered.length === 0) {
    listEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }
  
  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');
  listEl.innerHTML = '';
  
  filtered.forEach(app => {
    const card = document.createElement('div');
    card.className = 'card-list-item';
    
    const createdDate = app.created_at?.toDate().toLocaleDateString() || 'Unknown';
    const statusBadge = getStatusBadge(app.status);
    
    card.innerHTML = `
      <div class="flex-between flex-wrap">
        <div>
          <div class="text-lg font-bold">${escapeHtml(app.full_name)}</div>
          <div class="text-muted">${escapeHtml(app.email)}</div>
          <div class="text-sm text-muted mt-xs">
            Applied: ${createdDate} | Experience: ${escapeHtml(formatExperience(app.sales_experience))}
          </div>
        </div>
        <div class="flex-gap">
          ${statusBadge}
          <button class="btn btn-smallall" data-action="viewApplication" data-id="${app.id}">View</button>
        </div>
      </div>
    `;
    
    listEl.appendChild(card);
  });
}

function getStatusBadge(status) {
  const badges = {
    'pending': '<span class="status-badge status-pending">Pending</span>',
    'approved': '<span class="status-badge status-approved">Approved</span>',
    'rejected': '<span class="status-badge status-rejected">Rejected</span>'
  };
  return badges[status] || '';
}

function formatExperience(exp) {
  const labels = {
    'none': 'No experience',
    'some': '1-2 years',
    'experienced': '3-5 years',
    'veteran': '5+ years'
  };
  return labels[exp] || 'Not specified';
}

function setupEventListeners() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderApplications();
    });
  });
  
  document.getElementById('applicationsList').addEventListener('click', (e) => {
    if (e.target.matches('[data-action="viewApplication"]')) {
      const appId = e.target.dataset.id;
      showApplicationModal(appId);
    }
  });
  
  document.querySelectorAll('[data-action="closeModal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('applicationModal').classList.remove('active');
    });
  });
  
  document.getElementById('btnSendInvite').addEventListener('click', () => {
    document.getElementById('inviteModal').classList.add('active');
  });
  
  document.querySelectorAll('[data-action="closeInviteModal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('inviteModal').classList.remove('active');
    });
  });
  
  document.getElementById('inviteForm').addEventListener('submit', sendInviteEmail);
}

function showApplicationModal(appId) {
  const app = applications.find(a => a.id === appId);
  if (!app) return;
  
  const detailsEl = document.getElementById('applicationDetails');
  const actionsEl = document.getElementById('modalActions');
  
  detailsEl.innerHTML = `
    <div class="review-card">
      <h4>Personal Information</h4>
      <p><strong>Name:</strong> ${escapeHtml(app.full_name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(app.email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(app.phone)}</p>
      <p><strong>Location:</strong> ${escapeHtml(app.location || 'Not provided')}</p>
    </div>
    
    <div class="review-card">
      <h4>Experience</h4>
      <p><strong>Sales Experience:</strong> ${escapeHtml(formatExperience(app.sales_experience))}</p>
      <p><strong>Industries:</strong> ${escapeHtml(app.industries || 'Not provided')}</p>
      <p><strong>Church Connection:</strong> ${escapeHtml(app.church_connection || 'Not provided')}</p>
    </div>
    
    <div class="review-card">
      <h4>Motivation</h4>
      <p><strong>Why Join:</strong> ${escapeHtml(app.motivation)}</p>
      <p><strong>Hours/Week:</strong> ${escapeHtml(app.hours_per_week || 'Not specified')}</p>
      <p><strong>Referral Source:</strong> ${escapeHtml(app.referral_source || 'Not provided')}</p>
    </div>
    
    ${app.status !== 'pending' ? `
      <div class="review-card">
        <h4>Review Details</h4>
        <p><strong>Status:</strong> ${app.status}</p>
        <p><strong>Reviewed:</strong> ${app.reviewed_at?.toDate().toLocaleDateString() || 'N/A'}</p>
        ${app.review_notes ? `<p><strong>Notes:</strong> ${escapeHtml(app.review_notes)}</p>` : ''}
      </div>
    ` : ''}
  `;
  
  if (app.status === 'pending') {
    actionsEl.innerHTML = `
      <button class="btn btn-danger" data-action="reject" data-id="${app.id}">Reject</button>
      <button class="btn btn-gold" data-action="approve" data-id="${app.id}">Approve</button>
    `;
    
    actionsEl.querySelector('[data-action="approve"]').addEventListener('click', () => approveApplication(app.id));
    actionsEl.querySelector('[data-action="reject"]').addEventListener('click', () => rejectApplication(app.id));
  } else {
    actionsEl.innerHTML = `
      <button class="btn" data-action="closeModal">Close</button>
    `;
    actionsEl.querySelector('[data-action="closeModal"]').addEventListener('click', () => {
      document.getElementById('applicationModal').classList.remove('active');
    });
  }
  
  document.getElementById('applicationModal').classList.add('active');
}

async function approveApplication(appId) {
  const app = applications.find(a => a.id === appId);
  if (!app) return;
  
  if (!confirm(`Approve ${app.full_name} as a Sales Agent? This will create their account and Stripe Connect payout account.`)) {
    return;
  }
  
  const approveBtn = document.querySelector('[data-action="approve"]');
  if (approveBtn) {
    approveBtn.disabled = true;
    approveBtn.textContent = 'Processing...';
  }
  
  try {
    const nameParts = app.full_name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    const userDocRef = await addDoc(collection(db, "users"), {
      email: app.email,
      name: app.full_name,
      display_name: app.full_name,
      first_name: firstName,
      last_name: lastName,
      phone_number: app.phone,
      role: 'sales_agent',
      account_status: 'pending_setup',
      created_at: serverTimestamp(),
      application_id: appId,
      needs_password_setup: true
    });
    
    const newUserId = userDocRef.id;
    
    const token = await currentUser.getIdToken();
    const stripeResponse = await fetch(`${API_BASE}/api/stripe/create-connect-account`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: newUserId,
        email: app.email,
        firstName: firstName,
        lastName: lastName
      })
    });
    
    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.json();
      console.error('Stripe Connect error:', errorData);
    } else {
      const stripeData = await stripeResponse.json();
      console.log('Stripe Connect account created:', stripeData.accountId);
    }
    
    await updateDoc(doc(db, "sales_applications", appId), {
      status: 'approved',
      reviewed_by: currentUser.uid,
      reviewed_at: serverTimestamp(),
      user_id: newUserId
    });
    
    alert(`${app.full_name} has been approved! Their Stripe payout account has been created. They need to complete account setup through the login page.`);
    
    document.getElementById('applicationModal').classList.remove('active');
    await loadApplications();
    
  } catch (error) {
    console.error('Error approving application:', error);
    alert('Error approving application. Please try again.');
    
    if (approveBtn) {
      approveBtn.disabled = false;
      approveBtn.textContent = 'Approve';
    }
  }
}

async function rejectApplication(appId) {
  const app = applications.find(a => a.id === appId);
  if (!app) return;
  
  const notes = prompt('Reason for rejection (optional):');
  
  try {
    await updateDoc(doc(db, "sales_applications", appId), {
      status: 'rejected',
      reviewed_by: currentUser.uid,
      reviewed_at: serverTimestamp(),
      review_notes: notes || null
    });
    
    alert('Application rejected.');
    
    document.getElementById('applicationModal').classList.remove('active');
    await loadApplications();
    
  } catch (error) {
    console.error('Error rejecting application:', error);
    alert('Error rejecting application. Please try again.');
  }
}

async function sendInviteEmail(e) {
  e.preventDefault();
  
  const emailInput = document.getElementById('inviteEmail');
  const messageInput = document.getElementById('inviteMessage');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  
  const email = emailInput.value.trim();
  const personalMessage = messageInput.value.trim();
  
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';
  
  try {
    const htmlBody = `
      <h2>You're Invited to Join Our Sales Team!</h2>
      <p>Hello,</p>
      <p>You've been invited to join the Kingdom Connects sales team. As a sales agent, you'll earn commissions helping Christian businesses grow their presence in our faith-based directory.</p>
      ${personalMessage ? `<p><em>"${personalMessage}"</em></p>` : ''}
      <p><strong>Benefits:</strong></p>
      <ul>
        <li>Earn commission on every Pro subscription you sell</li>
        <li>Recurring income as long as businesses stay Pro</li>
        <li>Be part of a mission to strengthen Christian commerce</li>
      </ul>
      <p><a href="${window.location.origin}/join-sales-team" style="display:inline-block;background:#d4af37;color:#000;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;">Apply Now</a></p>
      <p>We look forward to having you on the team!</p>
      <p>- The Kingdom Connects Team</p>
    `;
    
    await sendCustomEmail(email, 'Join the Kingdom Connects Sales Team!', htmlBody);
    alert('Invitation sent successfully!');
    emailInput.value = '';
    messageInput.value = '';
    document.getElementById('inviteModal').classList.remove('active');
    
  } catch (error) {
    console.error('Error sending invite:', error);
    alert('Error sending invitation. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Invite';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
