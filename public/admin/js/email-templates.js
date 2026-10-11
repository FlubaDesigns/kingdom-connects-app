import { auth, db } from '../../js/firebase-config.js';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, orderBy, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showStatusMessage, showConfirmDialog, showSuccessAnimation, escapeHtml } from '../../js/utils.js';
import { sendTemplate, sendCustomEmail, previewEmailTemplate } from '../../js/email/email-service.js';
import { requireAdmin } from './admin-auth-guard.js';

const EVENT_LABELS = {
  church_submitted: 'Church Submitted',
  business_submitted: 'Business Submitted',
  business_pro_submitted: 'Business Pro Submitted',
  member_submitted: 'Member Submitted',
  business_submission_pending_church: 'Business Pending Church',
  business_submission_pending_review: 'Business Pending Review',
  member_welcome: 'Member Welcome',
  member_welcome_approved: 'Member Welcome (Approved)',
  member_welcome_pending: 'Member Welcome (Pending)',
  pro_upgrade_welcome: 'Pro Upgrade Welcome',
  church_approved: 'Church Approved',
  business_approved: 'Business Approved',
  member_approved: 'Member Approved',
  affiliation_approved: 'Affiliation Approved',
  church_rejected: 'Church Rejected',
  business_rejected: 'Business Rejected',
  member_rejected: 'Member Rejected',
  affiliation_rejected: 'Affiliation Rejected',
  affiliation_requested: 'Affiliation Requested',
  sales_intro_church: 'Sales Intro - Church',
  sales_intro_business: 'Sales Intro - Business',
  sales_followup: 'Sales Follow-up',
  sales_inquiry_received: 'Inquiry Received',
  sales_agent_pending: 'Agent Application Pending',
  sales_agent_call_scheduled: 'Agent Call Scheduled',
  sales_agent_approved: 'Agent Approved',
  sales_agent_rejected: 'Agent Application Update',
  marketing_newsletter: 'Marketing Newsletter',
  marketing_promo: 'Marketing Promotion',
  custom: 'Custom Template'
};

const CATEGORY_COLORS = {
  confirmation: '#2196F3',
  welcome: '#4CAF50',
  approval: '#8BC34A',
  rejection: '#FF5722',
  notification: '#FF9800',
  sales: '#E91E63',
  marketing: '#9C27B0'
};

let currentUser = null;
let allTemplates = [];
let currentEditSlug = null;
let currentEditTemplateId = null;
let initialized = false;

function initialize() {
  if (initialized) {
    console.log('⚠️ Already initialized, skipping');
    return;
  }
  initialized = true;
  
  console.log('🔄 Initializing email templates manager');
  setupEventListeners();
  
  requireAdmin((userContext, firebaseUser) => {
    currentUser = firebaseUser;
    console.log('✅ User authenticated:', firebaseUser.email);
    loadAllTemplates();
    loadRecentActivity();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

function setupEventListeners() {
  const sendForm = document.getElementById('send-test-form');
  const previewBtn = document.getElementById('preview-btn');
  const closePreviewBtn = document.getElementById('close-preview-btn');
  const eventSelect = document.getElementById('event-select');
  const toggleEditorBtn = document.getElementById('toggle-editor-btn');
  const editEventSelect = document.getElementById('edit-event-select');
  const savedTemplatesSelect = document.getElementById('saved-templates-select');
  const saveTemplateBtn = document.getElementById('save-template-btn');
  const deleteTemplateBtn = document.getElementById('delete-template-btn');
  const resetTemplateBtn = document.getElementById('reset-template-btn');
  const previewTemplateBtn = document.getElementById('preview-template-btn');
  const createCustomBtn = document.getElementById('create-custom-btn');
  
  if (sendForm) sendForm.addEventListener('submit', handleSendTest);
  if (previewBtn) previewBtn.addEventListener('click', handlePreview);
  if (closePreviewBtn) closePreviewBtn.addEventListener('click', closePreview);
  if (eventSelect) eventSelect.addEventListener('change', handleEventChange);
  if (toggleEditorBtn) toggleEditorBtn.addEventListener('click', toggleEditor);
  if (editEventSelect) editEventSelect.addEventListener('change', handleEditEventChange);
  if (savedTemplatesSelect) savedTemplatesSelect.addEventListener('change', handleVersionChange);
  if (saveTemplateBtn) saveTemplateBtn.addEventListener('click', handleSaveTemplate);
  if (deleteTemplateBtn) deleteTemplateBtn.addEventListener('click', handleDeleteTemplate);
  if (resetTemplateBtn) resetTemplateBtn.addEventListener('click', handleResetTemplate);
  if (previewTemplateBtn) previewTemplateBtn.addEventListener('click', handleEditorPreview);
  if (createCustomBtn) createCustomBtn.addEventListener('click', handleCreateCustom);
  
  setupMicButtons();
}

function setupMicButtons() {
  const micBtns = document.querySelectorAll('.mic-btn');
  micBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const target = document.getElementById(targetId);
      if (target && 'webkitSpeechRecognition' in window) {
        startSpeechRecognition(target);
      }
    });
  });
}

function startSpeechRecognition(target) {
  const speechStatus = document.getElementById('speech-status');
  const recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  
  speechStatus.textContent = 'Listening...';
  speechStatus.classList.remove('hidden');
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (target.tagName === 'TEXTAREA') {
      target.value += (target.value ? ' ' : '') + transcript;
    } else {
      target.value = transcript;
    }
    speechStatus.classList.add('hidden');
  };
  
  recognition.onerror = () => {
    speechStatus.textContent = 'Speech error';
    setTimeout(() => speechStatus.classList.add('hidden'), 2000);
  };
  
  recognition.onend = () => {
    speechStatus.classList.add('hidden');
  };
  
  recognition.start();
}

async function loadAllTemplates() {
  try {
    const templatesRef = collection(db, 'email_templates');
    const snapshot = await getDocs(templatesRef);
    
    allTemplates = [];
    snapshot.forEach(doc => {
      allTemplates.push({ ...doc.data(), id: doc.id, slug: doc.data().slug || doc.data().template_name || doc.id });
    });
    
    allTemplates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    renderTemplatesList();
    
  } catch (error) {
    console.error('Error loading templates:', error);
  }
}

function renderTemplatesList() {
  const container = document.getElementById('templates-list');
  if (!container) return;
  
  if (allTemplates.length === 0) {
    container.innerHTML = '<p class="text-muted">No templates found</p>';
    return;
  }
  
  const grouped = {};
  allTemplates.forEach(t => {
    const cat = t.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  });
  
  let html = '';
  Object.keys(grouped).sort().forEach(category => {
    const color = CATEGORY_COLORS[category] || '#888';
    html += `<h3 class="mt-md mb-sm" style="color: ${color}; text-transform: capitalize;">${category}</h3>`;
    html += '<div class="template-grid">';
    
    grouped[category].forEach(template => {
      const activeClass = template.is_active ? 'active' : 'inactive';
      html += `
        <div class="template-card ${activeClass}" data-slug="${escapeHtml(template.slug)}">
          <div class="template-card-header">
            <strong>${escapeHtml(template.name || template.slug)}</strong>
            ${template.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-muted">Inactive</span>'}
          </div>
          <p class="text-sm text-muted mb-sm">${escapeHtml(template.description || '')}</p>
          <p class="text-xs text-muted">Slug: ${escapeHtml(template.slug)}</p>
          <div class="template-card-actions mt-sm">
            <button class="btn btn-small btn-secondary edit-template-btn" data-slug="${escapeHtml(template.slug)}">Edit</button>
            <button class="btn btn-small btn-secondary preview-template-card-btn" data-slug="${escapeHtml(template.slug)}">Preview</button>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
  });
  
  container.innerHTML = html;
  
  container.querySelectorAll('.edit-template-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditorForSlug(btn.dataset.slug));
  });
  
  container.querySelectorAll('.preview-template-card-btn').forEach(btn => {
    btn.addEventListener('click', () => previewTemplateBySlug(btn.dataset.slug));
  });
}

function openEditorForSlug(slug) {
  const editorContainer = document.getElementById('editor-container');
  const editEventSelect = document.getElementById('edit-event-select');
  const toggleBtn = document.getElementById('toggle-editor-btn');
  
  editorContainer.classList.remove('hidden');
  toggleBtn.textContent = 'Hide Editor';
  
  if (editEventSelect.querySelector(`option[value="${slug}"]`)) {
    editEventSelect.value = slug;
  } else {
    editEventSelect.value = 'custom';
  }
  
  loadTemplateForEditing(slug);
  
  document.getElementById('edit-templates').scrollIntoView({ behavior: 'smooth' });
}

async function previewTemplateBySlug(slug) {
  const template = allTemplates.find(t => t.slug === slug);
  if (!template) return;
  
  await showTemplatePreview(template.id);
}

function getSampleVariables() {
  return {
    user_name: 'John Smith',
    business_name: 'Smith Plumbing Services',
    church_name: 'First Baptist Church',
    owner_name: 'John Smith',
    recipient_name: 'John Smith',
    church_admin_name: 'Pastor Johnson',
    business_category: 'Home Services',
    submission_date: new Date().toLocaleDateString(),
    dashboard_url: window.location.origin + '/business-admin',
    base_url: window.location.origin,
    login_url: window.location.origin + '/login'
  };
}


function replaceVariables(text, vars) {
  if (!text) return '';
  let result = text;
  Object.keys(vars).forEach(key => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, vars[key]);
  });
  return result;
}

function showPreview(subject, html) {
  const previewContainer = document.getElementById('preview-container');
  const previewContent = document.getElementById('preview-content');
  
  previewContent.innerHTML = `
    <div class="preview-subject mb-md">
      <strong>Subject:</strong> ${escapeHtml(replaceVariables(subject, getSampleVariables()))}
    </div>
    <iframe class="email-preview-frame" title="Email preview" sandbox="" srcdoc="${escapeHtml(html)}" style="background:white;width:100%;min-height:420px;border:0"></iframe>
  `;
  
  previewContainer.classList.remove('hidden');
  previewContainer.scrollIntoView({ behavior: 'smooth' });
}

function closePreview() {
  document.getElementById('preview-container').classList.add('hidden');
}

async function handleEventChange(e) {
  const slug = e.target.value;
  const sendTemplatesSection = document.getElementById('send-templates-section');
  const sendTemplateSelect = document.getElementById('send-template-select');
  
  if (!slug) {
    sendTemplatesSection.classList.add('hidden');
    return;
  }
  
  sendTemplateSelect.value = '';
  const versions = allTemplates.filter(t => t.slug === slug || t.slug.startsWith(slug + '_v'));
  
  if (versions.length > 1) {
    sendTemplateSelect.innerHTML = '<option value="">-- Default --</option>';
    versions.forEach(v => {
      const option = document.createElement('option');
      option.value = v.id;
      option.textContent = v.name || v.slug;
      sendTemplateSelect.appendChild(option);
    });
    sendTemplatesSection.classList.remove('hidden');
  } else {
    sendTemplatesSection.classList.add('hidden');
  }
}

async function handleSendTest(e) {
  e.preventDefault();
  
  const statusMsg = document.getElementById('status-message');
  const slug = selectedTemplateKey();
  const email = document.getElementById('recipient-email').value;
  
  if (!slug || !email) {
    showStatusMessage(statusMsg, 'Please select an event and enter an email', 'error');
    return;
  }
  
  try {
    showStatusMessage(statusMsg, 'Sending test email...', 'pending');
    
    await sendTemplate(slug, email, getSampleVariables());
    
    showStatusMessage(statusMsg, 'Test email sent!', 'success');
    showSuccessAnimation('Email sent!');
    
    await loadRecentActivity();
    
  } catch (error) {
    console.error('Error sending test:', error);
    showStatusMessage(statusMsg, error.message || 'Failed to send', 'error');
  }
}

function selectedTemplateKey() {
  return document.getElementById('send-template-select').value || document.getElementById('event-select').value;
}
async function showTemplatePreview(key, draft = null) {
  try {
    const result = await previewEmailTemplate(key, getSampleVariables(), draft);
    showPreview(result.subject, result.html);
  } catch (error) {
    showStatusMessage(document.getElementById('status-message'), error.message || 'Unable to preview template', 'error');
  }
}
async function handlePreview() {
  const key = selectedTemplateKey();
  if (key) await showTemplatePreview(key);
}

function toggleEditor() {
  const container = document.getElementById('editor-container');
  const btn = document.getElementById('toggle-editor-btn');
  
  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    btn.textContent = 'Hide Editor';
  } else {
    container.classList.add('hidden');
    btn.textContent = 'Show Editor';
  }
}

async function handleEditEventChange(e) {
  const slug = e.target.value;
  const savedSection = document.getElementById('saved-templates-section');
  const templateEditor = document.getElementById('template-editor');
  const savedSelect = document.getElementById('saved-templates-select');
  
  if (!slug) {
    savedSection.classList.add('hidden');
    templateEditor.classList.add('hidden');
    currentEditSlug = null;
    return;
  }
  
  currentEditSlug = slug;
  
  if (slug === 'custom') {
    savedSection.classList.add('hidden');
    templateEditor.classList.remove('hidden');
    clearEditorFields();
    document.getElementById('template-slug').value = '';
    document.getElementById('template-slug').removeAttribute('readonly');
    return;
  }
  
  const versions = allTemplates.filter(t => t.slug === slug || t.slug.startsWith(slug + '_v'));
  
  savedSelect.innerHTML = '<option value="">-- Edit Default --</option>';
  versions.forEach(v => {
    if (v.slug !== slug) {
      const option = document.createElement('option');
      option.value = v.id;
      option.textContent = v.name || v.slug;
      savedSelect.appendChild(option);
    }
  });
  savedSelect.innerHTML += '<option value="new">+ Create New Version</option>';
  
  savedSection.classList.remove('hidden');
  templateEditor.classList.remove('hidden');
  
  loadTemplateForEditing(slug);
}

async function loadTemplateForEditing(slug) {
  const template = allTemplates.find(t => t.slug === slug);
  if (!template) {
    clearEditorFields();
    return;
  }
  
  currentEditTemplateId = template.id;
  
  document.getElementById('template-name').value = template.name || '';
  document.getElementById('template-slug').value = template.slug || '';
  document.getElementById('template-slug').setAttribute('readonly', 'readonly');
  document.getElementById('template-category').value = template.category || 'notification';
  document.getElementById('edit-subject').value = template.subject || '';
  document.getElementById('edit-headline').value = template.headline || '';
  document.getElementById('edit-intro').value = template.intro || '';
  document.getElementById('edit-highlights').value = (template.highlights || []).join('\n');
  document.getElementById('edit-cta').value = template.cta || '';
  document.getElementById('edit-button-text').value = template.button_text || '';
  document.getElementById('edit-button-url').value = template.button_url || '';
  document.getElementById('template-active').checked = template.is_active !== false;
  document.getElementById('template-description').value = template.description || '';
}

function clearEditorFields() {
  document.getElementById('template-name').value = '';
  document.getElementById('template-slug').value = '';
  document.getElementById('template-category').value = 'notification';
  document.getElementById('edit-subject').value = '';
  document.getElementById('edit-headline').value = '';
  document.getElementById('edit-intro').value = '';
  document.getElementById('edit-highlights').value = '';
  document.getElementById('edit-cta').value = '';
  document.getElementById('edit-button-text').value = '';
  document.getElementById('edit-button-url').value = '';
  document.getElementById('template-active').checked = true;
  document.getElementById('template-description').value = '';
  currentEditTemplateId = null;
}

async function handleVersionChange(e) {
  const value = e.target.value;
  
  if (value === 'new') {
    clearEditorFields();
    document.getElementById('template-slug').value = currentEditSlug + '_v' + Date.now();
    document.getElementById('template-slug').removeAttribute('readonly');
    return;
  }
  
  if (!value) {
    loadTemplateForEditing(currentEditSlug);
    return;
  }
  
  const template = allTemplates.find(t => t.id === value);
  if (template) {
    loadTemplateForEditing(template.slug);
  }
}

async function handleSaveTemplate() {
  const statusMsg = document.getElementById('editor-status-message');
  
  const slug = document.getElementById('template-slug').value.trim();
  if (!slug) {
    showStatusMessage(statusMsg, 'Template slug is required', 'error');
    return;
  }
  
  const highlights = document.getElementById('edit-highlights').value
    .split('\n')
    .map(h => h.trim())
    .filter(h => h);
  
  const templateData = {
    slug,
    html_body: null,
    body: null,
    name: document.getElementById('template-name').value.trim() || slug,
    category: document.getElementById('template-category').value,
    subject: document.getElementById('edit-subject').value.trim(),
    headline: document.getElementById('edit-headline').value.trim(),
    intro: document.getElementById('edit-intro').value.trim(),
    highlights,
    cta: document.getElementById('edit-cta').value.trim(),
    button_text: document.getElementById('edit-button-text').value.trim(),
    button_url: document.getElementById('edit-button-url').value.trim(),
    is_active: document.getElementById('template-active').checked,
    description: document.getElementById('template-description').value.trim(),
    updated_at: serverTimestamp(),
    updated_by: currentUser?.uid || 'unknown'
  };
  
  try {
    showStatusMessage(statusMsg, 'Saving template...', 'pending');
    
    const docRef = doc(db, 'email_templates', slug);
    const existing = await getDoc(docRef);
    
    if (!existing.exists()) {
      templateData.created_at = serverTimestamp();
    }
    
    await setDoc(docRef, templateData, { merge: true });
    
    showStatusMessage(statusMsg, 'Template saved!', 'success');
    showSuccessAnimation('Saved!');
    
    await loadAllTemplates();
    
  } catch (error) {
    console.error('Error saving template:', error);
    showStatusMessage(statusMsg, error.message || 'Failed to save', 'error');
  }
}

async function handleDeleteTemplate() {
  const statusMsg = document.getElementById('editor-status-message');
  const slug = document.getElementById('template-slug').value.trim();
  
  if (!slug) {
    showStatusMessage(statusMsg, 'No template selected', 'error');
    return;
  }
  
  const confirmed = await showConfirmDialog(
    'Delete Template',
    `Are you sure you want to delete "${slug}"? This cannot be undone.`
  );
  
  if (!confirmed) return;
  
  try {
    showStatusMessage(statusMsg, 'Deleting...', 'pending');
    
    await deleteDoc(doc(db, 'email_templates', slug));
    
    showStatusMessage(statusMsg, 'Template deleted', 'success');
    clearEditorFields();
    
    await loadAllTemplates();
    
  } catch (error) {
    console.error('Error deleting template:', error);
    showStatusMessage(statusMsg, error.message || 'Failed to delete', 'error');
  }
}

async function handleResetTemplate() {
  const confirmed = await showConfirmDialog(
    'Reset Template',
    'This will clear the editor. Are you sure?'
  );
  
  if (confirmed) {
    if (currentEditSlug && currentEditSlug !== 'custom') {
      loadTemplateForEditing(currentEditSlug);
    } else {
      clearEditorFields();
    }
  }
}

async function handleEditorPreview() {
  const highlights = document.getElementById('edit-highlights').value
    .split('\n')
    .map(h => h.trim())
    .filter(h => h);
  
  const template = {
    subject: document.getElementById('edit-subject').value,
    headline: document.getElementById('edit-headline').value,
    intro: document.getElementById('edit-intro').value,
    highlights,
    cta: document.getElementById('edit-cta').value,
    button_text: document.getElementById('edit-button-text').value,
    button_url: document.getElementById('edit-button-url').value
  };
  
  await showTemplatePreview(null, template);
}

function handleCreateCustom() {
  const editEventSelect = document.getElementById('edit-event-select');
  editEventSelect.value = 'custom';
  handleEditEventChange({ target: editEventSelect });
  
  const editorContainer = document.getElementById('editor-container');
  const toggleBtn = document.getElementById('toggle-editor-btn');
  editorContainer.classList.remove('hidden');
  toggleBtn.textContent = 'Hide Editor';
  
  document.getElementById('edit-templates').scrollIntoView({ behavior: 'smooth' });
}

async function loadRecentActivity() {
  try {
    const snapshot = await getDocs(query(collection(db, 'email_logs'), where('type', '==', 'template')));
    const activity = snapshot.docs.map(record => record.data());
    activity.sort((a,b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
    renderRecentActivity(activity);
  } catch (error) {
    const container = document.getElementById('activity-list');
    if (container) container.textContent = 'Unable to load email history.';
  }
}

function renderRecentActivity(activity) {
  const container = document.getElementById('activity-list');
  if (!container) return;
  
  if (activity.length === 0) {
    container.innerHTML = '<p class="text-muted">No emails sent yet</p>';
    return;
  }
  
  container.innerHTML = activity.slice(0, 10).map(a => `
    <div class="activity-item mb-sm">
      <strong>${escapeHtml(EVENT_LABELS[a.slug] || a.slug)}</strong>
      <span class="text-muted"> → ${escapeHtml(a.email)}</span>
      <span class="text-xs text-muted"> (${a.timestamp?.toDate?.().toLocaleString() || ''})</span>
    </div>
  `).join('');
}
