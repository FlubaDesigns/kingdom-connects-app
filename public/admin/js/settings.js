import { db } from "../../js/firebase-config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAdmin } from "./admin-auth-guard.js";

requireAdmin(() => {
  loadSettings();
});

async function loadSettings() {
  const loadingMessage = document.getElementById('loadingMessage');
  const settingsContent = document.getElementById('settingsContent');
  const errorMessage = document.getElementById('errorMessage');

  try {
    const settingsDoc = await getDoc(doc(db, 'platform_settings', 'default'));
    
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      document.getElementById('allowReviewSharing').checked = data.allow_review_sharing !== false;
      document.getElementById('maintenanceMode').checked = data.maintenance_mode === true;
      document.getElementById('charitableFundRecipient').value = data.charitable_fund_recipient || '';
    } else {
      document.getElementById('allowReviewSharing').checked = true;
      document.getElementById('maintenanceMode').checked = false;
      document.getElementById('charitableFundRecipient').value = '';
    }

    loadingMessage.classList.add('hidden');
    settingsContent.classList.remove('hidden');

    document.getElementById('saveReviewSettings').addEventListener('click', saveSettings);
    document.getElementById('saveMaintenanceMode').addEventListener('click', saveMaintenanceMode);
    document.getElementById('saveCharitableSettings').addEventListener('click', saveCharitableSettings);

  } catch (error) {
    console.error('Error loading settings:', error);
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
  }
}

async function saveSettings() {
  const saveBtn = document.getElementById('saveReviewSettings');
  const originalText = saveBtn.textContent;
  
  try {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const allowReviewSharing = document.getElementById('allowReviewSharing').checked;

    await setDoc(doc(db, 'platform_settings', 'default'), {
      allow_review_sharing: allowReviewSharing,
      updated_at: new Date()
    }, { merge: true });

    saveBtn.textContent = '✅ Saved!';
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Error saving settings:', error);
    saveBtn.textContent = '❌ Error';
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 2000);
  }
}

async function saveMaintenanceMode() {
  const saveBtn = document.getElementById('saveMaintenanceMode');
  const originalText = saveBtn.textContent;
  
  try {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const maintenanceMode = document.getElementById('maintenanceMode').checked;

    await setDoc(doc(db, 'platform_settings', 'default'), {
      maintenance_mode: maintenanceMode,
      updated_at: new Date()
    }, { merge: true });

    const statusMsg = maintenanceMode 
      ? '⚠️ Site is now in maintenance mode!' 
      : '✅ Site is now live!';
    
    saveBtn.textContent = statusMsg;
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Error saving maintenance mode:', error);
    saveBtn.textContent = '❌ Error';
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 2000);
  }
}

async function saveCharitableSettings() {
  const saveBtn = document.getElementById('saveCharitableSettings');
  const originalText = saveBtn.textContent;
  
  try {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const charitableFundRecipient = document.getElementById('charitableFundRecipient').value.trim();

    await setDoc(doc(db, 'platform_settings', 'default'), {
      charitable_fund_recipient: charitableFundRecipient,
      updated_at: new Date()
    }, { merge: true });

    saveBtn.textContent = '✅ Saved!';
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Error saving charitable fund settings:', error);
    saveBtn.textContent = '❌ Error';
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }, 2000);
  }
}
