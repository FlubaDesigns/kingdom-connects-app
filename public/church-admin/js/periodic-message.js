/* Kingdom Connects - Church Admin Periodic Messages */
import { db } from '../../js/firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';
import { uploadChurchImage, deleteFile } from '/js/firebase-storage.js?v=16';

let currentChurchId = null;
let currentEditingId = null;
let currentImageUrl = null;
let currentImagePath = null;

const modal = document.getElementById('messageModal');
const form = document.getElementById('messageForm');
const activeMessagesList = document.getElementById('activeMessagesList');
const historyList = document.getElementById('historyList');
const statusMessage = document.getElementById('statusMessage');

requireAuth({ requireChurch: true }, (userContext, firebaseUser, churchContext) => {
  console.log('🔐 Periodic Messages: Auth verified, church:', churchContext?.id);
  
  if (churchContext) {
    currentChurchId = churchContext.id;
    loadActiveMessages();
    loadHistory();
  }
});

function loadActiveMessages() {
  const today = new Date().toISOString().split('T')[0];
  
  const q = query(
    collection(db, 'church_messages'),
    where('church_id', '==', currentChurchId),
    where('active', '==', true)
  );

  onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(msg => {
        if (msg.end_date && msg.end_date < today) return false;
        if (msg.start_date && msg.start_date > today) return false;
        return true;
      })
      .sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));

    if (messages.length === 0) {
      activeMessagesList.innerHTML = '<p class="status-message empty">No active messages. Create one to reach your congregation!</p>';
      return;
    }

    activeMessagesList.innerHTML = messages.map(msg => `
      <div class="message-card card">
        <div class="flex-between mb-sm">
          <div>
            <div class="message-title gold-metallic">${escapeHtml(msg.title)}</div>
            ${msg.header ? `<div class="message-header text-muted">${escapeHtml(msg.header)}</div>` : ''}
          </div>
          <div class="badge-group">
            <span class="badge badge-${msg.frequency || 'monthly'}">${getFrequencyLabel(msg.frequency)}</span>
            <span class="badge badge-audience">${getAudienceLabel(msg.audience)}</span>
          </div>
        </div>
        ${msg.image_url ? `<img src="${escapeHtml(msg.image_url)}" alt="Message image" class="img-preview mb-md">` : ''}
        <div class="message-content line-height-relaxed mb-md">${escapeHtml(msg.message).replace(/\n/g, '<br>')}</div>
        <div class="flex-between">
          <div class="text-muted text-sm">
            ${msg.start_date ? `Starts: ${formatDate(msg.start_date)}` : 'Active now'}
            ${msg.end_date ? ` • Ends: ${formatDate(msg.end_date)}` : ''}
          </div>
          <div class="flex-gap">
            <button class="btn btn-secondary btn-small" data-action="edit" data-id="${msg.id}">Edit</button>
            <button class="btn btn-danger btn-small" data-action="deactivate" data-id="${msg.id}">Deactivate</button>
          </div>
        </div>
      </div>
    `).join('');
  });
}

function loadHistory() {
  const q = query(
    collection(db, 'church_messages'),
    where('church_id', '==', currentChurchId),
    where('active', '==', false)
  );

  onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));

    if (messages.length === 0) {
      historyList.innerHTML = '<p class="status-message empty">No archived messages yet.</p>';
      return;
    }

    historyList.innerHTML = messages.map(msg => `
      <div class="history-card card">
        <div class="flex-between mb-sm">
          <div>
            <div class="history-title">${escapeHtml(msg.title)}</div>
            <div class="text-muted text-sm">${getFrequencyLabel(msg.frequency)} • ${getAudienceLabel(msg.audience)}</div>
          </div>
          <div class="flex-gap">
            <button class="btn btn-secondary btn-small" data-action="reactivate" data-id="${msg.id}">Reactivate</button>
            <button class="btn btn-danger btn-small" data-action="delete" data-id="${msg.id}">Delete</button>
          </div>
        </div>
        <div class="history-excerpt text-muted">${escapeHtml(msg.message?.substring(0, 120) || '')}${(msg.message?.length || 0) > 120 ? '...' : ''}</div>
      </div>
    `).join('');
  });
}

function getFrequencyLabel(frequency) {
  const labels = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
    one_time: 'One-Time'
  };
  return labels[frequency] || 'Monthly';
}

function getAudienceLabel(audience) {
  const labels = {
    both: 'Members & Social',
    members: 'Members Only',
    social: 'Social Only'
  };
  return labels[audience] || 'Both';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showSuccess(message) {
  statusMessage.textContent = message;
  statusMessage.classList.remove('hidden');
  setTimeout(() => statusMessage.classList.add('hidden'), 4000);
}

function openModal(title = 'New Message') {
  document.getElementById('modalTitle').textContent = title;
  modal.classList.add('active');
  initImageUploader();
}

function closeModal() {
  modal.classList.remove('active');
  form.reset();
  currentEditingId = null;
  currentImageUrl = null;
  currentImagePath = null;
  hideCurrentImage();
}

function initImageUploader() {
  const container = document.getElementById('imageUploadContainer');
  if (!container) return;
  
  container.innerHTML = `
    <div class="simple-uploader">
      <input type="file" id="imageFileInput" accept="image/jpeg,image/png,image/gif,image/webp" class="hidden">
      <button type="button" id="selectImageBtn" class="btn btn-secondary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        Choose Image
      </button>
      <span id="uploadStatus" class="text-muted text-sm ml-sm"></span>
    </div>
    <div id="uploadProgressBar" class="upload-progress hidden">
      <div class="progress-bar"><div class="progress-fill" id="uploadProgressFill"></div></div>
      <p class="text-sm text-muted" id="uploadProgressText">0%</p>
    </div>
  `;
  
  const fileInput = document.getElementById('imageFileInput');
  const selectBtn = document.getElementById('selectImageBtn');
  
  selectBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleImageSelect);
}

async function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    window.showToast('Image too large. Maximum size is 5MB.', 'error');
    return;
  }
  
  const uploadStatus = document.getElementById('uploadStatus');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressFill = document.getElementById('uploadProgressFill');
  const progressText = document.getElementById('uploadProgressText');
  
  uploadStatus.textContent = 'Uploading...';
  if (progressBar) progressBar.classList.remove('hidden');
  
  try {
    const result = await uploadChurchImage(currentChurchId, file, 'messages', (percent) => {
      if (progressFill) progressFill.style.width = percent + '%';
      if (progressText) progressText.textContent = percent + '%';
    });
    
    if (progressBar) progressBar.classList.add('hidden');
    
    if (result.success) {
      currentImageUrl = result.url;
      currentImagePath = result.path;
      showCurrentImage(result.url);
      uploadStatus.textContent = 'Uploaded!';
    } else {
      uploadStatus.textContent = 'Upload failed';
      window.showToast(result.error || 'Upload failed', 'error');
    }
  } catch (error) {
    console.error('Upload error:', error);
    if (progressBar) progressBar.classList.add('hidden');
    uploadStatus.textContent = 'Upload failed';
  }
}

function showCurrentImage(url) {
  const container = document.getElementById('currentImage');
  const preview = document.getElementById('currentImagePreview');
  if (container && preview) {
    preview.src = url;
    container.classList.remove('hidden');
  }
}

function hideCurrentImage() {
  const container = document.getElementById('currentImage');
  if (container) container.classList.add('hidden');
}

document.getElementById('removeImageBtn')?.addEventListener('click', async () => {
  if (currentImagePath) {
    await deleteFile(currentImagePath);
  }
  currentImageUrl = null;
  currentImagePath = null;
  hideCurrentImage();
  document.getElementById('uploadStatus').textContent = '';
});

document.getElementById('newMessageBtn').addEventListener('click', () => {
  currentEditingId = null;
  form.reset();
  openModal('New Message');
});

document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  const messageData = {
    church_id: currentChurchId,
    title: document.getElementById('messageTitle').value.trim(),
    header: document.getElementById('messageHeader').value.trim() || null,
    message: document.getElementById('messageDescription').value.trim(),
    frequency: document.getElementById('messageFrequency').value,
    audience: document.getElementById('messageAudience').value,
    start_date: document.getElementById('startDate').value || null,
    end_date: document.getElementById('endDate').value || null,
    image_url: currentImageUrl || null,
    image_path: currentImagePath || null,
    updated_at: serverTimestamp()
  };

  try {
    if (currentEditingId) {
      await updateDoc(doc(db, 'church_messages', currentEditingId), messageData);
      showSuccess('Message updated successfully!');
    } else {
      messageData.created_at = serverTimestamp();
      messageData.active = true;
      await addDoc(collection(db, 'church_messages'), messageData);
      showSuccess('Message created successfully!');
    }
    closeModal();
  } catch (error) {
    console.error('Error saving message:', error);
    window.showToast('Error saving message. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Message';
  }
});

async function editMessage(messageId) {
  const docSnap = await getDoc(doc(db, 'church_messages', messageId));
  if (!docSnap.exists()) return;
  
  const data = docSnap.data();
  currentEditingId = messageId;
  
  document.getElementById('messageTitle').value = data.title || '';
  document.getElementById('messageHeader').value = data.header || '';
  document.getElementById('messageDescription').value = data.message || '';
  document.getElementById('messageFrequency').value = data.frequency || 'monthly';
  document.getElementById('messageAudience').value = data.audience || 'both';
  document.getElementById('startDate').value = data.start_date || '';
  document.getElementById('endDate').value = data.end_date || '';
  
  currentImageUrl = data.image_url || null;
  currentImagePath = data.image_path || null;
  
  openModal('Edit Message');
  
  if (currentImageUrl) {
    showCurrentImage(currentImageUrl);
  }
}

async function deactivateMessage(messageId) {
  if (confirm('Deactivate this message? It will be moved to history.')) {
    try {
      await updateDoc(doc(db, 'church_messages', messageId), { active: false, updated_at: serverTimestamp() });
      showSuccess('Message deactivated.');
    } catch (error) {
      console.error('Error deactivating message:', error);
      window.showToast('Error deactivating message.', 'error');
    }
  }
}

async function reactivateMessage(messageId) {
  try {
    await updateDoc(doc(db, 'church_messages', messageId), { active: true, updated_at: serverTimestamp() });
    showSuccess('Message reactivated!');
  } catch (error) {
    console.error('Error reactivating message:', error);
    window.showToast('Error reactivating message.', 'error');
  }
}

async function deleteMessage(messageId) {
  if (confirm('Permanently delete this message? This cannot be undone.')) {
    try {
      await deleteDoc(doc(db, 'church_messages', messageId));
      showSuccess('Message deleted.');
    } catch (error) {
      console.error('Error deleting message:', error);
      window.showToast('Error deleting message.', 'error');
    }
  }
}

document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  
  const action = button.getAttribute('data-action');
  const id = button.getAttribute('data-id');
  
  switch (action) {
    case 'edit': editMessage(id); break;
    case 'deactivate': deactivateMessage(id); break;
    case 'reactivate': reactivateMessage(id); break;
    case 'delete': deleteMessage(id); break;
  }
});
