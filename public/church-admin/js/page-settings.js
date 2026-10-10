/* Kingdom Connects - Church Admin Page Settings (Visibility Only) */
import { db } from '../../js/firebase-config.js';
import { doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';

let churchId = null;
let churchData = null;

console.log('📄 Page settings module loaded');

requireAuth({ requireChurch: true }, async (userContext, firebaseUser, churchContext) => {
  console.log('🔐 Auth verified:', firebaseUser.email);
  console.log('🏛️ Church context from auth:', churchContext ? churchContext.id : 'null');
  
  const urlParams = new URLSearchParams(window.location.search);
  const urlChurchId = urlParams.get('id');
  const isAdmin = userContext.roles.includes('admin') || userContext.roles.includes('platform_admin');
  
  try {
    if (urlChurchId && isAdmin) {
      // Admin accessing specific church by URL
      await loadChurchById(urlChurchId, firebaseUser, isAdmin);
    } else if (churchContext) {
      // Use church from auth engine - no re-query needed
      churchId = churchContext.id;
      churchData = churchContext;
      console.log('✅ Using church from auth:', churchId, churchData.church_name);
      initPage();
    } else {
      showError('No church found for your account.');
    }
  } catch (err) {
    console.error('❌ Error in page-settings callback:', err);
    showError('Failed to load settings: ' + err.message);
  }
});

async function loadChurchById(id, firebaseUser, isAdmin) {
  try {
    const churchDoc = await getDoc(doc(db, 'churches', id));
    
    if (!churchDoc.exists()) {
      showError('Church not found.');
      return;
    }
    
    const data = churchDoc.data();
    
    if (!isAdmin && data.admin_uid !== firebaseUser.uid) {
      showError('Access denied.');
      return;
    }
    
    churchId = id;
    churchData = data;
    
    initPage();
  } catch (error) {
    console.error('Error loading church by ID:', error);
    showError('Error loading church settings.');
  }
}

function initPage() {
  loadPageSettings();
  setupEventListeners();
  
  document.getElementById('loadingMessage').classList.add('hidden');
  document.getElementById('contentArea').classList.remove('hidden');
}

function showError(message) {
  console.error('❌ showError:', message);
  document.getElementById('loadingMessage').classList.add('hidden');
  const errorEl = document.getElementById('errorMessage');
  if (errorEl) {
    errorEl.querySelector('.error-text').textContent = message;
    errorEl.classList.remove('hidden');
  } else {
    // Fallback: show in loading message area
    const loadingEl = document.getElementById('loadingMessage');
    if (loadingEl) {
      loadingEl.textContent = 'ERROR: ' + message;
      loadingEl.classList.remove('hidden');
      loadingEl.style.color = '#ff6b6b';
    }
  }
}

function loadPageSettings() {
  const settings = churchData.page_settings || {};
  
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.checked = value;
  };
  
  setChecked('showAnnouncements', settings.show_announcements !== false);
  setChecked('showEvents', settings.show_events !== false);
  setChecked('showActivities', settings.show_activities !== false);
  
  setChecked('showDenomination', settings.show_denomination !== false);
  setChecked('showServiceTimes', settings.show_service_times !== false);
  setChecked('showWelcomeMessage', settings.show_welcome_message !== false);
  
  setChecked('showAddress', settings.show_address !== false);
  setChecked('showPhone', settings.show_phone !== false);
  setChecked('showEmail', settings.show_email !== false);
  setChecked('showWebsite', settings.show_website !== false);
  setChecked('showSocialMedia', settings.show_social_media !== false);
  
  setChecked('allowQrGear', settings.allow_qr_gear !== false);
  
  setChecked('autoApproveBusinesses', churchData.auto_approve_businesses !== false);
  setChecked('autoApproveMembers', churchData.membership_approval_mode === 'automatic');
}

function setupEventListeners() {
  const saveBtn = document.getElementById('saveSettingsBtn');
  if (saveBtn) saveBtn.addEventListener('click', savePageSettings);
  
  const previewBtn = document.getElementById('previewPageBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      window.open(`../church.html?id=${churchId}`, '_blank');
    });
  }
}

async function savePageSettings() {
  const btn = document.getElementById('saveSettingsBtn');
  const originalText = btn.textContent;
  
  try {
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const existingSettings = churchData.page_settings || {};
    
    const updatedSettings = {
      ...existingSettings,
      show_announcements: document.getElementById('showAnnouncements').checked,
      show_events: document.getElementById('showEvents').checked,
      show_activities: document.getElementById('showActivities').checked,
      show_denomination: document.getElementById('showDenomination').checked,
      show_service_times: document.getElementById('showServiceTimes').checked,
      show_welcome_message: document.getElementById('showWelcomeMessage').checked,
      show_address: document.getElementById('showAddress').checked,
      show_phone: document.getElementById('showPhone').checked,
      show_email: document.getElementById('showEmail').checked,
      show_website: document.getElementById('showWebsite').checked,
      show_social_media: document.getElementById('showSocialMedia').checked,
      allow_qr_gear: document.getElementById('allowQrGear').checked
    };

    const autoApproveBusinesses = document.getElementById('autoApproveBusinesses').checked;
    const membershipApprovalMode = document.getElementById('autoApproveMembers').checked ? 'automatic' : 'manual';
    
    await updateDoc(doc(db, 'churches', churchId), {
      page_settings: updatedSettings,
      auto_approve_businesses: autoApproveBusinesses,
      membership_approval_mode: membershipApprovalMode,
      last_page_update: serverTimestamp()
    });

    churchData.page_settings = updatedSettings;
    
    showMessage('Settings saved!');
    btn.textContent = originalText;
    btn.disabled = false;

  } catch (error) {
    console.error('Error saving settings:', error);
    showMessage('Error saving settings', true);
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function showMessage(message, isError = false) {
  const div = document.createElement('div');
  div.className = `status-message ${isError ? 'error' : 'success'}`;
  div.textContent = message;
  div.classList.add('fixed-top', 'text-center', 'p-sm');
  document.body.appendChild(div);

  setTimeout(() => {
    div.remove();
  }, 3000);
}
