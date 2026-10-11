import { escapeHtml } from '../../js/utils.js';
import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAdmin } from "./admin-auth-guard.js";

const loadingMessage = document.getElementById('loadingMessage');
const contentArea = document.getElementById('contentArea');
const errorMessage = document.getElementById('errorMessage');

let currentUser = null;
let allTestimonials = [];

requireAdmin(async (userContext, firebaseUser) => {
  currentUser = firebaseUser;
  await loadTestimonials();
  setupTabs();
  
  loadingMessage.classList.add('hidden');
  contentArea.classList.remove('hidden');
});

async function loadTestimonials() {
  try {
    const testimonialsQuery = query(
      collection(db, 'testimonials'),

    );
    
    const snapshot = await getDocs(testimonialsQuery);
    allTestimonials = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));

    allTestimonials.sort((a,b) => (b.submitted_at?.toMillis?.() || b.created_at?.toMillis?.() || 0) - (a.submitted_at?.toMillis?.() || a.created_at?.toMillis?.() || 0));
    renderAllTabs();
  } catch (error) {
    console.error('Error loading testimonials:', error);
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
  }
}

function renderAllTabs() {
  const pending = allTestimonials.filter(t => t.status === 'pending');
  const approved = allTestimonials.filter(t => t.status === 'approved');
  const rejected = allTestimonials.filter(t => t.status === 'rejected');

  document.getElementById('pendingCount').textContent = pending.length;
  document.getElementById('approvedCount').textContent = approved.length;
  document.getElementById('rejectedCount').textContent = rejected.length;

  renderTestimonials('pendingList', pending, 'pending');
  renderTestimonials('approvedList', approved, 'approved');
  renderTestimonials('rejectedList', rejected, 'rejected');
}

function renderTestimonials(containerId, testimonials, status) {
  const container = document.getElementById(containerId);

  if (testimonials.length === 0) {
    container.innerHTML = '<p class="text-muted text-center p-md">No testimonials in this category.</p>';
    return;
  }

  let html = '<div class="card-list">';

  testimonials.forEach(testimonial => {
    const submittedDate = (testimonial.submitted_at || testimonial.created_at)?.toDate?.().toLocaleDateString() || 'N/A';
    const stars = '⭐'.repeat(Math.max(0, Math.min(5, Number(testimonial.rating) || 0)));

    html += `
      <article class="card">
        <div class="flex-between-center mb-sm">
          <div>
            <h3 class="gold mb-0">${escapeHtml(testimonial.author_name || "")}</h3>
            <p class="text-sm text-muted mb-0">${escapeHtml(testimonial.author_title || "")}</p>
            ${testimonial.entity_name ? `<p class="text-sm text-muted mb-0">${escapeHtml(testimonial.entity_name || "")}</p>` : ''}
          </div>
          <div class="text-right">
            <div class="mb-sm">${stars}</div>
            ${testimonial.member_since ? `<p class="text-xs text-muted mb-0">Member: ${escapeHtml(testimonial.member_since || "")}</p>` : ''}
          </div>
        </div>
        
        <p class="text-content-italic mb-md">"${escapeHtml(testimonial.testimonial_text || testimonial.content || "")}"</p>
        
        <div class="flex-between-center text-sm text-muted mb-md">
          <span>Submitted: ${submittedDate}</span>
          <span>By: ${escapeHtml(testimonial.user_email || "")}</span>
        </div>

        <div class="button-group">
          ${status === 'pending' ? `
            <button class="btn btn-gold btn-small" data-id="${escapeHtml(testimonial.id || "")}" data-action="approve">✓ Approve</button>
            <button class="btn btn-danger btn-small" data-id="${escapeHtml(testimonial.id || "")}" data-action="reject">✗ Reject</button>
          ` : ''}
          
          ${status === 'approved' ? `
            <button class="btn btn-secondary btn-small" data-id="${escapeHtml(testimonial.id || "")}" data-action="feature" data-featured="${testimonial.featured || false}">
              ${testimonial.featured ? '★ Unfeature' : '☆ Feature'}
            </button>
            <button class="btn btn-secondary btn-small" data-id="${escapeHtml(testimonial.id || "")}" data-action="unapprove">⏎ Un-approve</button>
          ` : ''}
          
          ${status === 'rejected' ? `
            <button class="btn btn-gold btn-small" data-id="${escapeHtml(testimonial.id || "")}" data-action="approve">✓ Approve</button>
          ` : ''}
          
          <button class="btn btn-danger btn-small" data-id="${escapeHtml(testimonial.id || "")}" data-action="delete">🗑 Delete</button>
        </div>
      </article>
    `;
  });

  html += '</div>';
  container.innerHTML = html;

  attachEventListeners(container);
}

function attachEventListeners(container) {
  const buttons = container.querySelectorAll('button[data-action]');
  
  buttons.forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      const action = button.dataset.action;

      switch (action) {
        case 'approve':
          await approveTestimonial(id);
          break;
        case 'reject':
          await rejectTestimonial(id);
          break;
        case 'unapprove':
          await unapproveTestimonial(id);
          break;
        case 'feature':
          const isFeatured = button.dataset.featured === 'true';
          await toggleFeature(id, !isFeatured);
          break;
        case 'delete':
          await deleteTestimonial(id);
          break;
      }
    });
  });
}

async function approveTestimonial(id) {
  if (!confirm('Approve this testimonial for public display?')) return;

  try {
    await updateDoc(doc(db, 'testimonials', id), {
      status: 'approved',
      approved_at: new Date(),
      approved_by: currentUser.uid
    });

    await loadTestimonials();
    showStatusMessage('✅ Testimonial approved!');
  } catch (error) {
    console.error('Error approving testimonial:', error);
    showStatusMessage('❌ Error approving testimonial', true);
  }
}

async function rejectTestimonial(id) {
  if (!confirm('Reject this testimonial?')) return;

  try {
    await updateDoc(doc(db, 'testimonials', id), {
      status: 'rejected'
    });

    await loadTestimonials();
    showStatusMessage('Testimonial rejected');
  } catch (error) {
    console.error('Error rejecting testimonial:', error);
    showStatusMessage('❌ Error rejecting testimonial', true);
  }
}

async function unapproveTestimonial(id) {
  if (!confirm('Move this testimonial back to pending?')) return;

  try {
    await updateDoc(doc(db, 'testimonials', id), {
      status: 'pending',
      approved_at: null,
      approved_by: null
    });

    await loadTestimonials();
    showStatusMessage('Testimonial moved to pending');
  } catch (error) {
    console.error('Error unapproving testimonial:', error);
    showStatusMessage('❌ Error', true);
  }
}

async function toggleFeature(id, feature) {
  try {
    await updateDoc(doc(db, 'testimonials', id), {
      featured: feature
    });

    await loadTestimonials();
    showStatusMessage(feature ? '★ Testimonial featured!' : 'Testimonial unfeatured');
  } catch (error) {
    console.error('Error toggling feature:', error);
    showStatusMessage('❌ Error', true);
  }
}

async function deleteTestimonial(id) {
  if (!confirm('Permanently delete this testimonial? This cannot be undone.')) return;

  try {
    await deleteDoc(doc(db, 'testimonials', id));
    await loadTestimonials();
    showStatusMessage('Testimonial deleted');
  } catch (error) {
    console.error('Error deleting testimonial:', error);
    showStatusMessage('❌ Error deleting testimonial', true);
  }
}

function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;

      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      button.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
}

function showStatusMessage(message, isError = false) {
  const statusDiv = document.createElement('div');
  statusDiv.className = `status-message ${isError ? 'error' : 'success'}`;
  statusDiv.textContent = message;
  statusDiv.classList.add('fixed-top', 'text-center', 'p-sm', isError ? 'bg-danger' : 'bg-success');
  document.body.appendChild(statusDiv);

  setTimeout(() => {
    statusDiv.remove();
  }, 3000);
}
