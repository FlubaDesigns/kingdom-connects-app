/* Kingdom Connects - Church Admin Announcements Management */
import { db } from '../../js/firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, onSnapshot, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';

let currentChurchId = null;
let currentEditingId = null;
let unsubscribe = null;

const modal = document.getElementById('announcementModal');
const form = document.getElementById('announcementForm');
const announcementsList = document.getElementById('announcementsList');
const bodyInput = document.getElementById('body');
const bodyCount = document.getElementById('bodyCount');

requireAuth({ requireChurch: true }, (userContext, firebaseUser, churchContext) => {
  console.log('🔐 Announcements: Auth verified, church:', churchContext?.id);
  
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  
  if (churchContext) {
    currentChurchId = churchContext.id;
    loadAnnouncements();
  }
});

function loadAnnouncements() {
  const q = query(collection(db, `churches/${currentChurchId}/announcements`));
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    const announcements = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const dateA = a.created_at?.toDate?.() || new Date(0);
        const dateB = b.created_at?.toDate?.() || new Date(0);
        return dateB - dateA;
      });
    
    if (announcements.length === 0) {
      announcementsList.innerHTML = '<p class="status-message empty">No announcements yet. Create your first one!</p>';
      return;
    }

    announcementsList.innerHTML = `<div class="card-list">${announcements.map(announcement => {
      const statusClass = announcement.status === 'published' ? 'badge-success' : 'badge-warning';
      const statusText = announcement.status === 'published' ? 'Published' : 'Draft';
      const priorityBadge = announcement.priority >= 3 ? '<span class="badge-danger">Urgent</span>' : 
                           announcement.priority === 2 ? '<span class="badge-warning">Important</span>' : '';
      
      return `
      <article class="card card-compact">
        <div class="flex-between-center mb-sm">
          <h3 class="gold m-0">${escapeHtml(announcement.title)}</h3>
          <div class="flex-gap-sm">
            ${priorityBadge}
            <span class="${statusClass}">${statusText}</span>
          </div>
        </div>
        <p class="mb-sm">${escapeHtml(announcement.body)}</p>
        <div class="text-muted text-sm mb-sm">
          ${formatDate(announcement.created_at)}
          ${announcement.publish_end ? ` • Expires: ${formatDateSimple(announcement.publish_end)}` : ''}
        </div>
        <div class="flex-gap-sm">
          <button class="btn btn-secondary btn-small" data-action="edit" data-id="${announcement.id}">Edit</button>
          <button class="btn btn-danger btn-small" data-action="delete" data-id="${announcement.id}">Delete</button>
        </div>
      </article>`;
    }).join('')}</div>`;
  });
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateSimple(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showSuccessMessage(message) {
  let successDiv = document.getElementById('successMessage');
  if (!successDiv) {
    successDiv = document.createElement('div');
    successDiv.id = 'successMessage';
    successDiv.className = 'status-message success';
    const main = document.getElementById('main');
    main.insertBefore(successDiv, main.querySelector('.page-header').nextSibling);
  }
  successDiv.textContent = message;
  successDiv.classList.remove('hidden');
  setTimeout(() => successDiv.classList.add('hidden'), 4000);
}

bodyInput.addEventListener('input', () => {
  bodyCount.textContent = bodyInput.value.length;
});

document.getElementById('addAnnouncementBtn').addEventListener('click', () => {
  currentEditingId = null;
  form.reset();
  bodyCount.textContent = '0';
  document.getElementById('publishStart').value = new Date().toISOString().split('T')[0];
  document.getElementById('modalTitle').textContent = 'Add Announcement';
  modal.classList.add('active');
});

document.getElementById('closeModal').addEventListener('click', () => {
  modal.classList.remove('active');
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  modal.classList.remove('active');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const isDraft = document.getElementById('isDraft').checked;
    const publishStartVal = document.getElementById('publishStart').value;
    const publishEndVal = document.getElementById('publishEnd').value;

    const announcementData = {
      title: document.getElementById('title').value.trim(),
      body: document.getElementById('body').value.trim(),
      status: isDraft ? 'draft' : 'published',
      priority: parseInt(document.getElementById('priority').value, 10),
      publish_start: publishStartVal ? Timestamp.fromDate(new Date(publishStartVal)) : Timestamp.now(),
      publish_end: publishEndVal ? Timestamp.fromDate(new Date(publishEndVal)) : null,
      updated_at: serverTimestamp()
    };

    if (currentEditingId) {
      await updateDoc(doc(db, `churches/${currentChurchId}/announcements`, currentEditingId), announcementData);
    } else {
      announcementData.created_at = serverTimestamp();
      announcementData.author_id = auth.currentUser.uid;
      await addDoc(collection(db, `churches/${currentChurchId}/announcements`), announcementData);
    }

    modal.classList.remove('active');
    form.reset();
    showSuccessMessage(currentEditingId ? 'Announcement updated!' : 'Announcement added!');
  } catch (error) {
    console.error('Error saving announcement:', error);
    if (typeof window.showToast === 'function') {
      window.showToast('Error saving announcement. Please try again.', 'error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Announcement';
  }
});

document.addEventListener('click', async (e) => {
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;
  if (!action || !id) return;

  if (action === 'edit') {
    currentEditingId = id;
    const docSnap = await getDoc(doc(db, `churches/${currentChurchId}/announcements`, id));
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      document.getElementById('title').value = data.title || '';
      document.getElementById('body').value = data.body || '';
      bodyCount.textContent = (data.body || '').length;
      document.getElementById('priority').value = data.priority || 1;
      document.getElementById('isDraft').checked = data.status === 'draft';
      
      if (data.publish_start) {
        const startDate = data.publish_start.toDate ? data.publish_start.toDate() : new Date(data.publish_start);
        document.getElementById('publishStart').value = startDate.toISOString().split('T')[0];
      }
      if (data.publish_end) {
        const endDate = data.publish_end.toDate ? data.publish_end.toDate() : new Date(data.publish_end);
        document.getElementById('publishEnd').value = endDate.toISOString().split('T')[0];
      }
      
      document.getElementById('modalTitle').textContent = 'Edit Announcement';
      modal.classList.add('active');
    }
  }

  if (action === 'delete') {
    if (confirm('Are you sure you want to delete this announcement?')) {
      try {
        await deleteDoc(doc(db, `churches/${currentChurchId}/announcements`, id));
        showSuccessMessage('Announcement deleted!');
      } catch (error) {
        console.error('Error deleting announcement:', error);
        if (typeof window.showToast === 'function') {
          window.showToast('Error deleting announcement.', 'error');
        }
      }
    }
  }
});

window.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.remove('active');
  }
});
