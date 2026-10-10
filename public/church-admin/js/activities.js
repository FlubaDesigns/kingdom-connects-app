/* Kingdom Connects - Church Admin Activities Management */
import { db } from '../../js/firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';
import { uploadChurchImage, validateFile } from '/js/firebase-storage.js?v=18';

let currentChurchId = null;
let currentEditingId = null;
let unsubscribe = null;
let currentVideoUrl = null;
let currentVideoPath = null;

const modal = document.getElementById('activityModal');
const form = document.getElementById('activityForm');
const activitiesList = document.getElementById('activitiesList');
const isRecurringCheckbox = document.getElementById('isRecurring');
const recurringOptions = document.getElementById('recurringOptions');
const imageInput = document.getElementById('activityImage');
const imagePreview = document.getElementById('imagePreview');

requireAuth({ requireChurch: true }, (userContext, firebaseUser, churchContext) => {
  console.log('🔐 Activities: Auth verified, church:', churchContext?.id);
  
  if (!churchContext) {
    activitiesList.innerHTML = `
      <div class="status-message warning">
        <p><strong>No church found</strong></p>
        <p>Your account is not linked to any church yet. If you've submitted a church, please wait for approval. Otherwise, contact support for assistance.</p>
      </div>
    `;
    const addBtn = document.getElementById('addActivityBtn');
    if (addBtn) addBtn.classList.add('hidden');
    return;
  }
  
  currentChurchId = churchContext.id;
  loadActivities();
});

function loadActivities() {
  const q = query(collection(db, 'church_activities'), where('church_id', '==', currentChurchId));
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (activities.length === 0) {
      activitiesList.innerHTML = '<p class="status-message empty">No activities yet. Create your first one!</p>';
      return;
    }

    activitiesList.innerHTML = `<div class="activities-grid">${activities.map(activity => `
      <div class="activity-card">
        <div class="activity-header">
          <div>
            <div class="activity-title">${activity.title}</div>
            <div class="activity-meta">
              <span>📅 ${formatDate(activity.date, activity.time)}</span>
              <span>📍 ${activity.location}</span>
              ${activity.is_recurring ? `<span class="badge-recurring">Recurring: ${activity.recurring_description || activity.recurring_pattern}</span>` : ''}
            </div>
          </div>
          <div class="flex-gap">
            <button class="btn btn-secondary btn-small" data-action="editActivity" data-id="${activity.id}">Edit</button>
            <button class="btn btn-danger btn-small" data-action="deleteActivity" data-id="${activity.id}">Delete</button>
          </div>
        </div>
        ${activity.image_url ? `<img src="${activity.image_url}" class="activity-image" alt="${activity.title}">` : ''}
        ${activity.video_url ? `<video src="${activity.video_url}" class="activity-video" controls preload="metadata"></video>` : ''}
        <div class="activity-description">${activity.description}</div>
        ${activity.contact_info ? `<p class="text-muted"><strong>Contact:</strong> ${activity.contact_info}</p>` : ''}
      </div>
    `).join('')}</div>`;
  });
}

function formatDate(dateStr, timeStr) {
  if (!dateStr) return 'TBA';
  const date = new Date(dateStr);
  const dateFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return timeStr ? `${dateFormatted} at ${timeStr}` : dateFormatted;
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

document.getElementById('addActivityBtn').addEventListener('click', () => {
  currentEditingId = null;
  form.reset();
  imagePreview.classList.add('hidden');
  clearVideoState();
  document.getElementById('modalTitle').textContent = 'Add Activity';
  modal.classList.add('active');
});

document.getElementById('closeModal').addEventListener('click', () => {
  modal.classList.remove('active');
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  modal.classList.remove('active');
});

isRecurringCheckbox.addEventListener('change', () => {
  if (isRecurringCheckbox.checked) {
    recurringOptions.classList.add('active');
  } else {
    recurringOptions.classList.remove('active');
  }
});

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
});

function generateVideoThumbnail(videoFile) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    const url = URL.createObjectURL(videoFile);
    video.src = url;
    
    video.onloadeddata = () => {
      video.currentTime = 0.1;
    };
    
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const thumbUrl = canvas.toDataURL('image/jpeg', 0.7);
      URL.revokeObjectURL(url);
      resolve(thumbUrl);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    
    setTimeout(() => {
      if (!video.seeked) {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    }, 5000);
  });
}

function initVideoUploader() {
  const videoInput = document.getElementById('activityVideo');
  if (!videoInput) return;
  
  videoInput.addEventListener('change', handleVideoSelect);
}

async function handleVideoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const check = validateFile(file, {
    maxSize: 50 * 1024 * 1024,
    allowedTypes: ['video/mp4', 'video/webm']
  });
  
  if (!check.valid) {
    window.showToast(check.error, 'error');
    e.target.value = '';
    return;
  }
  
  const progressBar = document.getElementById('videoProgressBar');
  const progressFill = document.getElementById('videoProgressFill');
  const progressText = document.getElementById('videoProgressText');
  const videoPreview = document.getElementById('videoPreview');
  const videoPreviewContainer = document.getElementById('videoPreviewContainer');
  
  if (progressBar) progressBar.classList.remove('hidden');
  
  const thumbUrl = await generateVideoThumbnail(file);
  if (thumbUrl && videoPreview) {
    videoPreview.src = thumbUrl;
    if (videoPreviewContainer) videoPreviewContainer.classList.remove('hidden');
  }
  
  try {
    const result = await uploadChurchImage(currentChurchId, file, 'videos', (percent) => {
      if (progressFill) progressFill.style.width = percent + '%';
      if (progressText) progressText.textContent = percent + '%';
    });
    
    if (progressBar) progressBar.classList.add('hidden');
    
    if (result.success) {
      currentVideoUrl = result.url;
      currentVideoPath = result.path;
      window.showToast('Video uploaded!', 'success');
    } else {
      window.showToast(result.error || 'Video upload failed', 'error');
      currentVideoUrl = null;
      currentVideoPath = null;
      if (videoPreviewContainer) videoPreviewContainer.classList.add('hidden');
    }
  } catch (error) {
    console.error('Video upload error:', error);
    if (progressBar) progressBar.classList.add('hidden');
    window.showToast('Video upload failed', 'error');
    currentVideoUrl = null;
    currentVideoPath = null;
  }
}

function clearVideoState() {
  currentVideoUrl = null;
  currentVideoPath = null;
  const videoInput = document.getElementById('activityVideo');
  const videoPreviewContainer = document.getElementById('videoPreviewContainer');
  if (videoInput) videoInput.value = '';
  if (videoPreviewContainer) videoPreviewContainer.classList.add('hidden');
}

initVideoUploader();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    let imageUrl = null;
    
    if (imageInput.files[0]) {
      const file = imageInput.files[0];
      const progressBar = document.getElementById('uploadProgressBar');
      const progressFill = document.getElementById('uploadProgressFill');
      const progressText = document.getElementById('uploadProgressText');
      
      if (progressBar) progressBar.classList.remove('hidden');
      
      const result = await uploadChurchImage(currentChurchId, file, 'activities', (percent) => {
        if (progressFill) progressFill.style.width = percent + '%';
        if (progressText) progressText.textContent = percent + '%';
      });
      
      if (progressBar) progressBar.classList.add('hidden');
      
      if (result.success) {
        imageUrl = result.url;
      } else {
        window.showToast(result.error || 'Upload failed', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Activity';
        return;
      }
    }

    const activityData = {
      church_id: currentChurchId,
      title: document.getElementById('title').value.trim(),
      description: document.getElementById('description').value.trim(),
      date: document.getElementById('date').value,
      time: document.getElementById('time').value,
      location: document.getElementById('location').value.trim(),
      contact_info: document.getElementById('contactInfo').value.trim(),
      is_recurring: isRecurringCheckbox.checked,
      recurring_pattern: isRecurringCheckbox.checked ? document.getElementById('recurringPattern').value : null,
      recurring_description: isRecurringCheckbox.checked ? document.getElementById('recurringDescription').value.trim() : null,
      updated_at: serverTimestamp()
    };

    if (imageUrl) {
      activityData.image_url = imageUrl;
    }
    
    if (currentVideoUrl) {
      activityData.video_url = currentVideoUrl;
      activityData.video_path = currentVideoPath;
    }

    if (currentEditingId) {
      await updateDoc(doc(db, 'church_activities', currentEditingId), activityData);
    } else {
      activityData.created_at = serverTimestamp();
      activityData.active = true;
      await addDoc(collection(db, 'church_activities'), activityData);
    }

    modal.classList.remove('active');
    form.reset();
    imagePreview.classList.add('hidden');
    clearVideoState();
    showSuccessMessage(currentEditingId ? 'Activity updated successfully!' : 'Activity added successfully!');
  } catch (error) {
    console.error('Error saving activity:', error);
    window.showToast('Error saving activity. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Activity';
  }
});

window.editActivity = async (activityId) => {
  currentEditingId = activityId;
  const docSnap = await getDoc(doc(db, 'church_activities', activityId));
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    document.getElementById('title').value = data.title || '';
    document.getElementById('description').value = data.description || '';
    document.getElementById('date').value = data.date || '';
    document.getElementById('time').value = data.time || '';
    document.getElementById('location').value = data.location || '';
    document.getElementById('contactInfo').value = data.contact_info || '';
    isRecurringCheckbox.checked = data.is_recurring || false;
    
    if (data.is_recurring) {
      recurringOptions.classList.add('active');
      document.getElementById('recurringPattern').value = data.recurring_pattern || 'weekly';
      document.getElementById('recurringDescription').value = data.recurring_description || '';
    }
    
    if (data.image_url) {
      imagePreview.src = data.image_url;
      imagePreview.classList.remove('hidden');
    }
    
    if (data.video_url) {
      currentVideoUrl = data.video_url;
      currentVideoPath = data.video_path || null;
      const videoPreviewContainer = document.getElementById('videoPreviewContainer');
      const videoPreview = document.getElementById('videoPreview');
      if (videoPreviewContainer) videoPreviewContainer.classList.remove('hidden');
      if (videoPreview) videoPreview.alt = 'Existing video';
    } else {
      clearVideoState();
    }
    
    document.getElementById('modalTitle').textContent = 'Edit Activity';
    modal.classList.add('active');
  }
};

window.deleteActivity = async (activityId) => {
  if (confirm('Are you sure you want to delete this activity?')) {
    try {
      await deleteDoc(doc(db, 'church_activities', activityId));
      window.showToast('Activity deleted!', 'success');
    } catch (error) {
      console.error('Error deleting activity:', error);
      window.showToast('Error deleting activity. Please try again.', 'error');
    }
  }
};

window.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.remove('active');
  }
});
