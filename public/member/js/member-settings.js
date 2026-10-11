import { EmailAuthProvider, reauthenticateWithCredential, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { changeHierarchy } from '../../js/services/hierarchy-service.js';
import { auth, db, storage } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { requireMember } from "../../js/auth/access-control.js";
import { sendVerificationEmail } from "../../js/email/email-service.js";
import { fetchActiveChurches, populateChurchDropdown } from "../../js/services/church-service.js";
import { formatPhoneNumber, setupPhoneFormatting } from "../../js/utils.js";

let currentUser = null;
let userData = null;

requireMember(async (userContext, firebaseUser) => {
  currentUser = firebaseUser;
  if (!await loadSettings(firebaseUser)) return;
  await loadChurches();
  setupPhotoUpload();
  try { await firebaseUser.reload(); await changeHierarchy('syncEmailVerification'); }
  catch(error) { console.warn('Verification refresh failed:',error.message); }
  setupEmailVerification(firebaseUser);
  setupAccountClosure();
  setupSaveSettings();
}, { allowPending: true });

async function loadSettings(user) {
  const loadingMessage = document.getElementById('loadingMessage');
  const settingsContent = document.getElementById('settingsContent');
  const errorMessage = document.getElementById('errorMessage');

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    userData = userDoc.exists() ? userDoc.data() : {};

    const membershipStatus=document.getElementById('membershipStatus');
    if(membershipStatus)membershipStatus.textContent='Membership: '+(userData.church_membership_status || 'pending');
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
      const img=document.createElement("img");img.src=userData.profile_photo_url;img.alt="Profile photo";photoPreview.replaceChildren(img);
      if (removePhotoBtn) removePhotoBtn.classList.remove('hidden');
    }

    const homeChurchSelect = document.getElementById('homeChurchSelect');
    if (homeChurchSelect && userData.home_church_id) {
      homeChurchSelect.setAttribute('data-selected', userData.home_church_id);
    }

    loadingMessage.classList.add('hidden');
    settingsContent.classList.remove('hidden');
    return true;

  } catch (error) {
    console.error('Error loading settings:', error);
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
    return false;
  }
}

async function loadChurches() {
  const homeChurchSelect = document.getElementById('homeChurchSelect');
  if (!homeChurchSelect) return;
  homeChurchSelect.disabled = true;

  try {
    const churches = await fetchActiveChurches();
    
    populateChurchDropdown(homeChurchSelect, churches, {
      emptyOptionText: 'Select a church...',
      includeNone: true,
      noneText: 'Not Affiliated',
      includeNominate: false
    });

    const selectedId = homeChurchSelect.getAttribute('data-selected');
    if (selectedId && !churches.some(church => church.id === selectedId)) {
      const currentOption = document.createElement('option');
      currentOption.value = selectedId;
      currentOption.textContent = 'Current church (not currently listed)';
      homeChurchSelect.appendChild(currentOption);
    }
    homeChurchSelect.value = selectedId || 'none';
    homeChurchSelect.disabled = false;

  } catch (error) {
    console.error('Error loading churches:', error);
    document.getElementById('churchLoadStatus').textContent = 'Church choices could not load. Your current affiliation will be kept when you save your profile. Refresh to try again.';
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

      if (!['image/jpeg','image/png','image/gif','image/webp'].includes(file.type)) {
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
        userData.profile_photo_url=downloadURL;

        await updateDoc(doc(db, 'users', currentUser.uid), {
          profile_photo_url: downloadURL,
          updated_at: new Date()
        });

        const img=document.createElement("img");img.src=downloadURL;img.alt="Profile photo";photoPreview.replaceChildren(img);
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

        if (userData?.profile_photo_url) {
          try { const old=ref(storage,userData.profile_photo_url);if(old.fullPath.startsWith('users/'+currentUser.uid+'/'))await deleteObject(old); } catch(error){console.warn('Photo cleanup:',error.message);}
        }
        userData.profile_photo_url=null;
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



  } else {
    statusEl.innerHTML = '<span class="text-warning">Not verified - check your inbox</span>';
    if (resendBtn) resendBtn.classList.remove('hidden');

    if (resendBtn) {
      resendBtn.addEventListener('click', async () => {
        try {
          resendBtn.disabled = true;
          resendBtn.textContent = 'Sending...';

          await sendVerificationEmail();

          resendBtn.textContent = 'Queued';
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
      const churchSelect = document.getElementById('homeChurchSelect');
      const homeChurchId = churchSelect.value;
      const allowReviewSharing = document.getElementById('allowReviewSharing').checked;
      const notificationsEnabled = document.getElementById('notificationsEnabled').checked;

      const churchId = homeChurchId === 'none' ? null : homeChurchId;
      if (!churchSelect.disabled && homeChurchId && churchId !== (userData.home_church_id || null)) {
        const result = await changeHierarchy('setMemberChurch', { churchId });
        userData.home_church_id = churchId;
        userData.church_membership_status = result.status;
        document.getElementById('membershipStatus').textContent = 'Membership: ' + result.status;
      }
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

function setupAccountClosure() {
  const button=document.getElementById('closeAccountBtn');
  const message=document.getElementById('closeAccountStatus');
  button.addEventListener('click',async()=>{
    if(!confirm('Permanently close your member account and remove your profile, reviews, favorites, and uploaded profile photos?'))return;
    const passwordInput=document.getElementById('closeAccountPassword');
    const password=passwordInput.value;
    passwordInput.value='';
    if(!password)return;
    button.disabled=true;
    try {
      await reauthenticateWithCredential(currentUser,EmailAuthProvider.credential(currentUser.email,password));
      await currentUser.getIdToken(true);
      await changeHierarchy('closeMemberAccount');
      await signOut(auth);
      window.location.replace('/login?closed=true');
    }catch(error){message.textContent=error.message || 'Unable to close account. Contact support.';button.disabled=false;}
  });
}
