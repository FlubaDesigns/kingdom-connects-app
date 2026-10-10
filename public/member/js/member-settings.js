import { changeHierarchy } from '../../js/services/hierarchy-service.js';
import { db, storage } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { requireMember } from "../../js/auth/access-control.js";
import { sendVerificationEmail } from "../../js/email/email-service.js";
import { fetchActiveChurches, populateChurchDropdown } from "../../js/services/church-service.js";
import { formatPhoneNumber, setupPhoneFormatting } from "../../js/utils.js";

let currentUser = null;
let userData = null;

requireMember(async (userContext, firebaseUser) => {
  currentUser = firebaseUser;
  await loadSettings(firebaseUser);
  await loadChurches();
  setupPhotoUpload();
  setupEmailVerification(firebaseUser);
  setupSaveSettings();
}, { allowPending: true });

async function loadSettings(user) {
  const loadingMessage = document.getElementById('loadingMessage');
  const settingsContent = document.getElementById('settingsContent');
  const errorMessage = document.getElementById('errorMessage');

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    userData = userDoc.exists() ? userDoc.data() : {};

    document.getElementById('allowReviewSharing').checked = userData.allow_review_sharing !== false;
    document.getElementById('notificationsEnabled').checked = userData.notifications_enabled !== false;
    
    const displayNameInput = document.getElementById('displayName');
    if (displayNameInput) {
      displayNameInput.value = userData.display_name || '';
    }
    
    const phoneInput = document.getElementById('phoneNumber');
    if (phoneInput) {
      phoneInput.value = formatPhoneNumber(userData.phone_number || '');
      setupPhoneFormatting(phoneInput);
    }
    
    const photoPreview = document.getElementById('profilePhotoPreview');
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    if (photoPreview && userData.profile_photo_url) {
      photoPreview.innerHTML = `<img src="${userData.profile_photo_url}" alt="Profile photo">`;
      if (removePhotoBtn) removePhotoBtn.classList.remove('hidden');
    }

    const homeChurchSelect = document.getElementById('homeChurchSelect');
    if (homeChurchSelect && userData.home_church_id) {
      homeChurchSelect.setAttribute('data-selected', userData.home_church_id);
    }

    loadingMessage.classList.add('hidden');
    settingsContent.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading settings:', error);
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
  }
}

async function loadChurches() {
  const homeChurchSelect = document.getElementById('homeChurchSelect');
  if (!homeChurchSelect) return;

  try {
    const churches = await fetchActiveChurches();
    
    populateChurchDropdown(homeChurchSelect, churches, {
      emptyOptionText: 'Select a church...',
      includeNone: true,
      noneText: 'Not Affiliated',
      includeNominate: false
    });

    const selectedId = homeChurchSelect.getAttribute('data-selected');
    if (selectedId) {
      homeChurchSelect.value = selectedId;
    }

  } catch (error) {
    console.error('Error loading churches:', error);
  }
}

function setupPhotoUpload() {
  const uploadBtn = document.getElementById('uploadPhotoBtn');
  const removeBtn = document.getElementById('removePhotoBtn');
  const photoInput = document.getElementById('profilePhotoInput');
  const photoPreview = document.getElementById('profilePhotoPreview');

  if (uploadBtn && photoInput) {
    uploadBtn.addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !currentUser) return;

      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB');
        return;
      }

      try {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';

        const fileName = `users/${currentUser.uid}/profile_photo_${Date.now()}.${file.name.split('.').pop()}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        await updateDoc(doc(db, 'users', currentUser.uid), {
          profile_photo_url: downloadURL,
          updated_at: new Date()
        });

        photoPreview.innerHTML = `<img src="${downloadURL}" alt="Profile photo">`;
        if (removeBtn) removeBtn.classList.remove('hidden');

        uploadBtn.textContent = 'Upload Photo';
        uploadBtn.disabled = false;

      } catch (error) {
        console.error('Error uploading photo:', error);
        alert('Failed to upload photo. Please try again.');
        uploadBtn.textContent = 'Upload Photo';
        uploadBtn.disabled = false;
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', async () => {
      if (!currentUser) return;

      try {
        removeBtn.disabled = true;

        await updateDoc(doc(db, 'users', currentUser.uid), {
          profile_photo_url: null,
          updated_at: new Date()
        });

        photoPreview.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        removeBtn.classList.add('hidden');
        removeBtn.disabled = false;

      } catch (error) {
        console.error('Error removing photo:', error);
        removeBtn.disabled = false;
      }
    });
  }
}

function setupEmailVerification(user) {
  const emailCard = document.getElementById('emailVerification');
  const emailEl = document.getElementById('userEmail');
  const statusEl = document.getElementById('emailVerifiedStatus');
  const resendBtn = document.getElementById('resendVerificationBtn');

  if (!emailEl || !statusEl) return;

  emailEl.textContent = user.email;

  if (user.emailVerified) {
    if (emailCard) emailCard.classList.add('hidden');

    updateDoc(doc(db, 'users', user.uid), {
      email_verified: true
    }).catch(err => console.error('Error updating email_verified:', err));

  } else {
    statusEl.innerHTML = '<span class="text-warning">Not verified - check your inbox</span>';
    if (resendBtn) resendBtn.classList.remove('hidden');

    if (resendBtn) {
      resendBtn.addEventListener('click', async () => {
        try {
          resendBtn.disabled = true;
          resendBtn.textContent = 'Sending...';

          await sendVerificationEmail();

          resendBtn.textContent = 'Sent!';
          setTimeout(() => {
            resendBtn.textContent = 'Resend Verification';
            resendBtn.disabled = false;
          }, 3000);

        } catch (error) {
          console.error('Error sending verification:', error);
          resendBtn.textContent = 'Error - try later';
          setTimeout(() => {
            resendBtn.textContent = 'Resend Verification';
            resendBtn.disabled = false;
          }, 3000);
        }
      });
    }
  }
}

function setupSaveSettings() {
  const btn = document.getElementById('saveSettings');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!currentUser) return;

    const originalText = btn.textContent;
    
    try {
      btn.disabled = true;
      btn.textContent = 'Saving...';

      const displayName = document.getElementById('displayName').value.trim();
      const phoneNumber = document.getElementById('phoneNumber').value.replace(/\D/g, '');
      const homeChurchId = document.getElementById('homeChurchSelect').value;
      const allowReviewSharing = document.getElementById('allowReviewSharing').checked;
      const notificationsEnabled = document.getElementById('notificationsEnabled').checked;

      await changeHierarchy('setMemberChurch', { churchId: homeChurchId === 'none' ? null : homeChurchId || null });
      await updateDoc(doc(db, 'users', currentUser.uid), {
        display_name: displayName || null,
        phone_number: phoneNumber || null,
        allow_review_sharing: allowReviewSharing,
        notifications_enabled: notificationsEnabled,
        updated_at: new Date()
      });

      btn.textContent = 'Saved!';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);

    } catch (error) {
      console.error('Error saving settings:', error);
      btn.textContent = 'Error - try again';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
    }
  });
}
