import { auth, db } from '../../js/firebase-config.js';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { showStatusMessage, showConfirmDialog, showSuccessAnimation } from '../../js/utils.js';
import { sendPresentation } from '../../js/email/email-service.js';
import { requireAdmin } from './admin-auth-guard.js';

const ROLE_TITLES = {
  sales_agent: 'Sales Agent Opportunity',
  church_admin: 'Church Admin Dashboard',
  business_owner: 'Business Owner Guide',
  member: 'Member Features'
};

const ROLE_COLORS = {
  sales_agent: '#4CAF50',
  church_admin: '#2196F3',
  business_owner: '#FF9800',
  member: '#9C27B0'
};

let currentUser = null;
let recentSends = [];
let initialized = false;

// Initialize function - runs only once
function initialize() {
  if (initialized) {
    console.log('⚠️ Already initialized, skipping');
    return;
  }
  initialized = true;
  
  console.log('🔄 Initializing presentations manager');
  setupEventListeners();
  loadRecentSends();
  
  // Set up auth listener via centralized auth engine
  requireAdmin((userContext, firebaseUser) => {
    currentUser = firebaseUser;
    console.log('✅ User authenticated:', firebaseUser.email);
  });
}

// Run immediately if DOM is ready, or wait for DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Track selected template for sending
let selectedSendTemplateId = null;
let sendTemplates = [];

function setupEventListeners() {
  const form = document.getElementById('presentation-form');
  const previewBtn = document.getElementById('preview-btn');
  const closePreviewBtn = document.getElementById('close-preview-btn');
  const roleSelect = document.getElementById('role-select');
  const sendTemplateSelect = document.getElementById('send-template-select');
  
  if (!form) {
    console.error('❌ presentation-form element not found');
    return;
  }
  if (!previewBtn) {
    console.error('❌ preview-btn element not found');
    return;
  }
  if (!closePreviewBtn) {
    console.error('❌ close-preview-btn element not found');
    return;
  }
  
  console.log('✅ Setting up event listeners');
  form.addEventListener('submit', handleFormSubmit);
  previewBtn.addEventListener('click', handlePreview);
  closePreviewBtn.addEventListener('click', closePreview);
  
  // Role select in send form - load templates for that role
  if (roleSelect) {
    roleSelect.addEventListener('change', handleSendRoleChange);
  }
  
  // Template select in send form
  if (sendTemplateSelect) {
    sendTemplateSelect.addEventListener('change', (e) => {
      selectedSendTemplateId = e.target.value || null;
    });
  }
  
  // Setup editor listeners
  setupEditorListeners();
}

async function handleSendRoleChange(e) {
  const role = e.target.value;
  const sendTemplatesSection = document.getElementById('send-templates-section');
  const sendTemplateSelect = document.getElementById('send-template-select');
  
  if (!role) {
    sendTemplatesSection.classList.add('hidden');
    selectedSendTemplateId = null;
    sendTemplates = [];
    return;
  }
  
  // Load saved templates for this role
  try {
    const templatesRef = collection(db, 'presentation_templates');
    const q = query(templatesRef, where('role', '==', role));
    const querySnapshot = await getDocs(q);
    
    sendTemplates = [];
    querySnapshot.forEach((doc) => {
      sendTemplates.push({ id: doc.id, ...doc.data() });
    });
    
    // Sort by name
    sendTemplates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    // Populate dropdown
    sendTemplateSelect.innerHTML = '<option value="">-- Default Template --</option>';
    sendTemplates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name || template.id;
      sendTemplateSelect.appendChild(option);
    });
    
    // Show section if there are saved templates
    if (sendTemplates.length > 0) {
      sendTemplatesSection.classList.remove('hidden');
    } else {
      sendTemplatesSection.classList.add('hidden');
    }
    
    selectedSendTemplateId = null;
    sendTemplateSelect.value = '';
    
  } catch (error) {
    console.error('Error loading templates for send:', error);
    sendTemplatesSection.classList.add('hidden');
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();
  console.log('📤 Form submitted');
  
  const statusMsg = document.getElementById('status-message');
  const role = document.getElementById('role-select').value;
  const email = document.getElementById('recipient-email').value;
  const phone = document.getElementById('recipient-phone').value;
  const includePresentation = document.getElementById('include-presentation').checked;
  const sendEmail = document.getElementById('send-email').checked;
  const sendSms = document.getElementById('send-sms').checked;
  
  // Check if user is authenticated
  if (!currentUser) {
    console.error('❌ No authenticated user');
    showStatusMessage(statusMsg, 'Please wait for authentication...', 'error');
    return;
  }
  
  if (!role) {
    showStatusMessage(statusMsg, 'Please select a role', 'error');
    return;
  }
  
  if (!email && !phone) {
    showStatusMessage(statusMsg, 'Please provide an email address or phone number', 'error');
    return;
  }
  
  if (sendEmail && !email) {
    showStatusMessage(statusMsg, 'Email address required for email delivery', 'error');
    return;
  }
  
  if (sendSms && !phone) {
    showStatusMessage(statusMsg, 'Phone number required for SMS delivery', 'error');
    return;
  }
  
  if (!sendEmail && !sendSms) {
    showStatusMessage(statusMsg, 'Please select at least one delivery method', 'error');
    return;
  }
  
  try {
    showStatusMessage(statusMsg, 'Generating and sending presentation...', 'pending');
    
    const result = await sendPresentation(
      role,
      sendEmail ? email : undefined,
      includePresentation,
      selectedSendTemplateId
    );
    
    // Show success in status area
    showStatusMessage(statusMsg, 'Presentation sent successfully!', 'success');
    showSuccessAnimation('Presentation sent!');
    document.getElementById('presentation-form').reset();
    
    // Add to recent sends
    recentSends.unshift({
      role,
      email: sendEmail ? email : null,
      phone: sendSms ? phone : null,
      timestamp: new Date().toLocaleString(),
      id: Date.now()
    });
    
    updateRecentSendsList();
    
    // Save to localStorage
    localStorage.setItem('recentPresentationSends', JSON.stringify(recentSends.slice(0, 10)));
    
  } catch (error) {
    console.error('Error sending presentation:', error);
    showStatusMessage(statusMsg, error.message || 'Failed to send presentation', 'error');
  }
}

async function handlePreview() {
  console.log('👁️ Preview clicked');
  const statusMsg = document.getElementById('status-message');
  const role = document.getElementById('role-select').value;
  
  if (!role) {
    showStatusMessage(statusMsg, 'Please select a role first', 'error');
    return;
  }
  
  try {
    showStatusMessage(statusMsg, 'Loading preview...', 'pending');
    console.log('📡 Fetching preview for role:', role, 'template:', selectedSendTemplateId);
    
    // Build URL with optional templateId
    let url = `/api/presentations/preview/${role}`;
    if (selectedSendTemplateId) {
      url += `?templateId=${encodeURIComponent(selectedSendTemplateId)}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to load preview');
    }
    
    const data = await response.json();
    
    const previewHtml = renderPreviewHtml(data.template);
    document.getElementById('preview-content').innerHTML = previewHtml;
    document.getElementById('preview-container').classList.remove('hidden');
    statusMsg.textContent = '';
    
  } catch (error) {
    console.error('Error loading preview:', error);
    showStatusMessage(statusMsg, 'Failed to load preview: ' + error.message, 'error');
  }
}

function closePreview() {
  document.getElementById('preview-container').classList.add('hidden');
}

function renderPreviewHtml(template) {
  let html = `<h1 style="text-align: center; color: #1e4e9a; margin-bottom: 2rem;">${template.title}</h1>`;
  
  for (const slide of template.slides) {
    if (slide.type === 'title') {
      html += `
        <div style="page-break-after: always; padding: 2rem; background: linear-gradient(135deg, #2f6bcb, #1e4e9a); color: white; border-radius: 8px; margin-bottom: 2rem; text-align: center;">
          <h2 style="margin: 0 0 1rem 0; font-size: 2.5em;">${slide.title}</h2>
          <p style="margin: 0; font-size: 1.2em; color: #ffd700;">${slide.subtitle}</p>
        </div>
      `;
    } else if (slide.type === 'content') {
      html += `
        <div style="page-break-after: always; padding: 2rem; border-left: 4px solid #1e4e9a; background: rgba(30,78,154,0.05); border-radius: 4px; margin-bottom: 2rem;">
          <h3 style="color: #1e4e9a; margin-top: 0; font-weight: bold;">${slide.title}</h3>
          <ul style="line-height: 1.8; color: #333;">
      `;
      for (const bullet of slide.bullets) {
        html += `<li>${bullet}</li>`;
      }
      html += `
          </ul>
        </div>
      `;
    } else if (slide.type === 'closing') {
      html += `
        <div style="page-break-after: always; padding: 2rem; background: linear-gradient(135deg, #2f6bcb, #1e4e9a); color: white; border-radius: 8px; text-align: center; margin-bottom: 2rem;">
          <h2 style="margin-top: 0; color: #ffd700;">${slide.title}</h2>
          <p style="font-size: 1.2em; margin: 0;">${slide.message}</p>
        </div>
      `;
    }
  }
  
  return html;
}

function loadRecentSends() {
  const saved = localStorage.getItem('recentPresentationSends');
  if (saved) {
    try {
      recentSends = JSON.parse(saved);
      updateRecentSendsList();
    } catch (e) {
      console.error('Error loading recent sends:', e);
    }
  }
}

function updateRecentSendsList() {
  const list = document.getElementById('sends-list');
  
  if (recentSends.length === 0) {
    list.innerHTML = '<p class="text-muted">No presentations sent yet</p>';
    return;
  }
  
  let html = '<div class="card-list">';
  
  for (const send of recentSends.slice(0, 5)) {
    const roleTitle = ROLE_TITLES[send.role] || send.role;
    
    let recipients = [];
    if (send.email) recipients.push(send.email);
    if (send.phone) recipients.push(send.phone);
    
    html += `
      <div class="send-item">
        <div class="send-item-header">
          <div class="send-role gold-metallic">${roleTitle}</div>
          <button type="button" class="btn btn-small btn-danger delete-send-btn" data-id="${send.id}">Delete</button>
        </div>
        <div class="send-recipients">
          ${recipients.join(' • ')}
        </div>
        <div class="send-time text-muted">
          ${send.timestamp}
        </div>
      </div>
    `;
  }
  
  html += '</div>';
  list.innerHTML = html;
  
  // Attach delete handlers using event delegation (CSP-safe)
  list.querySelectorAll('.delete-send-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = parseInt(this.dataset.id, 10);
      console.log('Deleting send entry:', id);
      recentSends = recentSends.filter(s => s.id !== id);
      localStorage.setItem('recentPresentationSends', JSON.stringify(recentSends));
      updateRecentSendsList();
    });
  });
}

// ============================================
// TEMPLATE EDITOR FUNCTIONALITY
// ============================================

// Default templates (fallback if not in Firestore)
const DEFAULT_TEMPLATES = {
  sales_agent: {
    email: {
      subject: 'Earn 20% Commission with Kingdom Connects',
      headline: 'Turn Your Network Into Income',
      intro: 'Kingdom Connects is building the largest faith-based business directory, and we want YOU to help us grow. As a Sales Agent, you\'ll earn recurring commissions just by connecting Christian businesses with our platform.',
      highlights: [
        'Earn 20% commission on every Pro subscription you bring in',
        'Recurring monthly income - you earn as long as they stay subscribed',
        'No cap on earnings - the more you sell, the more you make',
        'Marketing materials and sales dashboard provided'
      ],
      cta: 'See the full opportunity details in our presentation below.'
    },
    slides: [
      { type: 'title', title: 'Kingdom Connects', subtitle: 'Sales Agent Commission Program' },
      { type: 'content', title: 'What You\'ll Earn', bullets: ['20% commission on Pro subscriptions you sell', 'Recurring revenue each month', 'Unlimited earning potential', 'Support and marketing materials provided'] },
      { type: 'content', title: 'How It Works', bullets: ['Sign up as a Sales Agent', 'Share your unique referral link', 'Earn 20% when customers subscribe', 'Track earnings in your dashboard'] },
      { type: 'content', title: 'Why Kingdom Connects?', bullets: ['Faith-based marketplace for churches and businesses', 'Growing Christian commerce ecosystem', 'All profits support local churches (10% tithe)', 'Professional tools and support'] },
      { type: 'closing', title: 'Ready to Earn?', message: 'Sign up today and start earning commissions' }
    ]
  },
  church_admin: {
    email: {
      subject: 'Strengthen Your Ministry Through Kingdom Partnerships',
      headline: 'Partner With Us to Build God\'s Kingdom',
      intro: 'Kingdom Connects creates a powerful connection between your church and the Christian business owners in your congregation. When these businesses thrive, your ministry thrives—because every Pro subscription from an affiliated business tithes 10% directly back to your church.',
      highlights: [
        'Receive 10% Tithe from every Pro business subscription affiliated with your church—ongoing, passive support for your ministry',
        'Help Your Business Owners Flourish—as they grow, they\'re empowered to give more generously to your church and community',
        'Guide Your Members to trusted, faith-aligned businesses they can support with confidence',
        'Free Church Listing Page—showcase your service times, address, and mission, or direct visitors straight to your website',
        'Zero Cost to Join—register your church today and start building Kingdom connections'
      ],
      cta: 'Learn how to set up your church dashboard and start receiving tithes.'
    },
    slides: [
      { type: 'title', title: 'Kingdom Connects', subtitle: 'Church Partnership Program' },
      { type: 'content', title: 'Receive 10% Tithe', bullets: ['Every Pro business affiliated with your church tithes 10% to your ministry', 'Ongoing, passive support as long as they\'re subscribed', 'Transparent tracking in your church dashboard', 'Monthly payouts to your church account'] },
      { type: 'content', title: 'Help Businesses Grow', bullets: ['When Christian businesses in your congregation flourish, they give more', 'Connect them with faith-based customers seeking their services', 'Strengthen the economic health of your church community', 'Build a network of trusted Kingdom businesses'] },
      { type: 'content', title: 'Guide Your Members', bullets: ['Help your congregation find trusted, faith-aligned businesses', 'Members can confidently support businesses that share their values', 'Build community through Kingdom commerce', 'Every purchase supports a fellow believer'] },
      { type: 'content', title: 'Free Church Listing', bullets: ['Beautiful listing page at no cost', 'Display service times, address, and your mission', 'Or direct visitors straight to your church website', 'Help new visitors discover your church'] },
      { type: 'closing', title: 'Join Free Today', message: 'Start building Kingdom connections and strengthening your ministry' }
    ]
  },
  business_owner: {
    email: {
      subject: 'List Your Business on Kingdom Connects - Free to Start',
      headline: 'Grow Your Business in the Christian Community',
      intro: 'Kingdom Connects connects Christian-owned businesses with customers who share their values. List your business for free and reach thousands of families looking to support faith-based commerce.',
      highlights: [
        'Free basic listing with your business info and contact details',
        'Pro features starting at just $9/month - showcase products, run promotions',
        '10% of your subscription tithes back to your affiliated church',
        'Build trust with customer reviews and testimonials'
      ],
      cta: 'See all the benefits and features in our presentation.'
    },
    slides: [
      { type: 'title', title: 'Kingdom Connects', subtitle: 'Business Listing & Growth' },
      { type: 'content', title: 'Your Free Listing', bullets: ['List your Christian business for free', 'Share your mission and contact info', 'Receive customer reviews', 'Connect with your church community'] },
      { type: 'content', title: 'Go Pro - Unlock Premium Features', bullets: ['Premium $9/month or $69.99/year', 'Manage products & services', 'Share customer testimonials', 'Run special promotions'] },
      { type: 'content', title: 'Pro Features', bullets: ['Feature your products & services', 'Build customer trust with testimonials', 'Create and manage promotions', 'Access detailed business analytics'] },
      { type: 'content', title: 'Support Your Church', bullets: ['Affiliate with your church', '10% tithe supports your ministry', 'Build community within faith', 'Grow your business with purpose'] },
      { type: 'closing', title: 'Grow Your Kingdom Business', message: 'List your business today' }
    ]
  },
  member: {
    email: {
      subject: 'Welcome to Kingdom Connects - Discover Christian Businesses',
      headline: 'Find & Support Christian Businesses Near You',
      intro: 'Kingdom Connects makes it easy to discover and support Christian-owned businesses in your community. Save your favorites, leave reviews, and help build a thriving faith-based economy.',
      highlights: [
        'Search local Christian businesses and churches',
        'Save your favorites for quick access',
        'Leave reviews to help others find great businesses',
        'Support businesses that share your values'
      ],
      cta: 'Learn all the ways to use Kingdom Connects in our presentation.'
    },
    slides: [
      { type: 'title', title: 'Kingdom Connects', subtitle: 'Member Features Guide' },
      { type: 'content', title: 'Discover Businesses', bullets: ['Search by category, location, or name', 'Find Christian-owned businesses near you', 'View business profiles and reviews', 'Get directions and contact info'] },
      { type: 'content', title: 'Save Your Favorites', bullets: ['Bookmark businesses you love', 'Quick access to your favorites list', 'Get updates on businesses you follow', 'Build your personal directory'] },
      { type: 'content', title: 'Leave Reviews', bullets: ['Share your experience with others', 'Help businesses grow their reputation', 'Rate products and services', 'Build community trust'] },
      { type: 'closing', title: 'Join Kingdom Connects', message: 'Start discovering today' }
    ]
  }
};

let currentEditRole = null;
let currentTemplate = null;
let currentTemplateId = null;
let savedTemplates = [];

function setupEditorListeners() {
  const toggleBtn = document.getElementById('toggle-editor-btn');
  const editRoleSelect = document.getElementById('edit-role-select');
  const savedTemplatesSelect = document.getElementById('saved-templates-select');
  const saveBtn = document.getElementById('save-template-btn');
  const deleteBtn = document.getElementById('delete-template-btn');
  const resetBtn = document.getElementById('reset-template-btn');
  
  console.log('🔧 Setting up editor listeners');
  
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleEditor);
  }
  
  if (editRoleSelect) {
    editRoleSelect.addEventListener('change', handleRoleChange);
  }
  
  if (savedTemplatesSelect) {
    savedTemplatesSelect.addEventListener('change', handleSavedTemplateChange);
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', saveTemplate);
  }
  
  if (deleteBtn) {
    deleteBtn.addEventListener('click', deleteTemplate);
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', resetTemplate);
  }
}

function toggleEditor() {
  console.log('🔧 Toggle editor clicked');
  const container = document.getElementById('editor-container');
  const btn = document.getElementById('toggle-editor-btn');
  
  console.log('  - container:', container ? 'found' : 'NOT FOUND');
  
  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    btn.textContent = 'Hide Editor';
    console.log('  ✅ Editor shown');
  } else {
    container.classList.add('hidden');
    btn.textContent = 'Show Editor';
    console.log('  ✅ Editor hidden');
  }
}

async function handleRoleChange(e) {
  const role = e.target.value;
  const templateEditor = document.getElementById('template-editor');
  const savedTemplatesSection = document.getElementById('saved-templates-section');
  const savedTemplatesSelect = document.getElementById('saved-templates-select');
  
  if (!role) {
    templateEditor.classList.add('hidden');
    savedTemplatesSection.classList.add('hidden');
    currentEditRole = null;
    currentTemplate = null;
    currentTemplateId = null;
    return;
  }
  
  currentEditRole = role;
  
  // Load saved templates for this role
  try {
    const templatesRef = collection(db, 'presentation_templates');
    const q = query(templatesRef, where('role', '==', role));
    const querySnapshot = await getDocs(q);
    
    savedTemplates = [];
    querySnapshot.forEach((doc) => {
      savedTemplates.push({ id: doc.id, ...doc.data() });
    });
    
    // Sort by name
    savedTemplates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    // Populate dropdown
    savedTemplatesSelect.innerHTML = '<option value="">-- Create New Template --</option>';
    savedTemplates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name || template.id;
      savedTemplatesSelect.appendChild(option);
    });
    
    savedTemplatesSection.classList.remove('hidden');
    
    // Load default template for new creation
    loadDefaultTemplate();
    
  } catch (error) {
    console.error('Error loading saved templates:', error);
    savedTemplatesSection.classList.add('hidden');
    loadDefaultTemplate();
  }
}

function loadDefaultTemplate() {
  const templateEditor = document.getElementById('template-editor');
  const templateNameInput = document.getElementById('template-name');
  
  currentTemplate = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES[currentEditRole]));
  currentTemplateId = null;
  
  // Generate next template name
  const nextNum = getNextTemplateNumber();
  templateNameInput.value = `Template ${String(nextNum).padStart(3, '0')}`;
  
  populateEditor(currentTemplate);
  templateEditor.classList.remove('hidden');
}

function getNextTemplateNumber() {
  if (savedTemplates.length === 0) return 1;
  
  // Extract numbers from existing template names
  const numbers = savedTemplates
    .map(t => {
      const match = (t.name || '').match(/Template\s+(\d+)/i);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);
  
  if (numbers.length === 0) return 1;
  return Math.max(...numbers) + 1;
}

async function handleSavedTemplateChange(e) {
  const templateId = e.target.value;
  const templateEditor = document.getElementById('template-editor');
  const templateNameInput = document.getElementById('template-name');
  
  if (!templateId) {
    // Create new template
    loadDefaultTemplate();
    return;
  }
  
  // Load selected template
  const selectedTemplate = savedTemplates.find(t => t.id === templateId);
  if (selectedTemplate) {
    currentTemplate = selectedTemplate;
    currentTemplateId = templateId;
    templateNameInput.value = selectedTemplate.name || templateId;
    populateEditor(selectedTemplate);
    templateEditor.classList.remove('hidden');
  }
}

function populateEditor(template) {
  // Email fields
  document.getElementById('edit-subject').value = template.email.subject || '';
  document.getElementById('edit-headline').value = template.email.headline || '';
  document.getElementById('edit-intro').value = template.email.intro || '';
  document.getElementById('edit-highlights').value = (template.email.highlights || []).join('\n');
  document.getElementById('edit-cta').value = template.email.cta || '';
  
  // Slides
  const slidesEditor = document.getElementById('slides-editor');
  let html = '';
  
  template.slides.forEach((slide, index) => {
    html += `<div class="slide-edit-block" data-index="${index}">`;
    html += `<h4 class="mb-sm">Slide ${index + 1}: ${slide.type.charAt(0).toUpperCase() + slide.type.slice(1)}</h4>`;
    
    if (slide.type === 'title') {
      html += `
        <div class="form-field">
          <label>Title</label>
          <input type="text" class="slide-title" data-index="${index}" value="${escapeHtml(slide.title || '')}">
        </div>
        <div class="form-field">
          <label>Subtitle</label>
          <input type="text" class="slide-subtitle" data-index="${index}" value="${escapeHtml(slide.subtitle || '')}">
        </div>
      `;
    } else if (slide.type === 'content') {
      html += `
        <div class="form-field">
          <label>Title</label>
          <input type="text" class="slide-title" data-index="${index}" value="${escapeHtml(slide.title || '')}">
        </div>
        <div class="form-field">
          <label>Bullet Points (one per line)</label>
          <textarea class="slide-bullets" data-index="${index}" rows="4">${(slide.bullets || []).join('\n')}</textarea>
        </div>
      `;
    } else if (slide.type === 'closing') {
      html += `
        <div class="form-field">
          <label>Title</label>
          <input type="text" class="slide-title" data-index="${index}" value="${escapeHtml(slide.title || '')}">
        </div>
        <div class="form-field">
          <label>Message</label>
          <input type="text" class="slide-message" data-index="${index}" value="${escapeHtml(slide.message || '')}">
        </div>
      `;
    }
    
    html += '</div>';
  });
  
  slidesEditor.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function collectEditorData() {
  // Collect email data
  const email = {
    subject: document.getElementById('edit-subject').value.trim(),
    headline: document.getElementById('edit-headline').value.trim(),
    intro: document.getElementById('edit-intro').value.trim(),
    highlights: document.getElementById('edit-highlights').value.split('\n').filter(h => h.trim()),
    cta: document.getElementById('edit-cta').value.trim()
  };
  
  // Collect slides data
  const slides = currentTemplate.slides.map((slide, index) => {
    const newSlide = { type: slide.type };
    
    const titleInput = document.querySelector(`.slide-title[data-index="${index}"]`);
    if (titleInput) {
      newSlide.title = titleInput.value.trim();
    }
    
    if (slide.type === 'title') {
      const subtitleInput = document.querySelector(`.slide-subtitle[data-index="${index}"]`);
      if (subtitleInput) {
        newSlide.subtitle = subtitleInput.value.trim();
      }
    } else if (slide.type === 'content') {
      const bulletsInput = document.querySelector(`.slide-bullets[data-index="${index}"]`);
      if (bulletsInput) {
        newSlide.bullets = bulletsInput.value.split('\n').filter(b => b.trim());
      }
    } else if (slide.type === 'closing') {
      const messageInput = document.querySelector(`.slide-message[data-index="${index}"]`);
      if (messageInput) {
        newSlide.message = messageInput.value.trim();
      }
    }
    
    return newSlide;
  });
  
  return { email, slides };
}

async function saveTemplate() {
  const statusMsg = document.getElementById('editor-status-message');
  const templateNameInput = document.getElementById('template-name');
  const savedTemplatesSelect = document.getElementById('saved-templates-select');
  
  if (!currentEditRole || !currentUser) {
    showStatusMessage(statusMsg, 'Please select a role first', 'error');
    return;
  }
  
  if (!currentTemplate || !currentTemplate.slides) {
    showStatusMessage(statusMsg, 'Please preview a template first before saving', 'error');
    return;
  }
  
  const templateName = templateNameInput.value.trim();
  if (!templateName) {
    showStatusMessage(statusMsg, 'Please enter a template name', 'error');
    return;
  }
  
  try {
    showStatusMessage(statusMsg, 'Saving template...', 'pending');
    
    const templateData = collectEditorData();
    templateData.name = templateName;
    templateData.role = currentEditRole;
    templateData.updated_at = new Date().toISOString();
    templateData.updated_by = currentUser.email;
    
    // Use existing ID or generate new one
    const templateId = currentTemplateId || `${currentEditRole}_${Date.now()}`;
    
    if (!currentTemplateId) {
      templateData.created_at = new Date().toISOString();
      templateData.created_by = currentUser.email;
    }
    
    const docRef = doc(db, 'presentation_templates', templateId);
    await setDoc(docRef, templateData);
    
    currentTemplate = templateData;
    currentTemplateId = templateId;
    
    // Update dropdown
    if (!savedTemplates.find(t => t.id === templateId)) {
      savedTemplates.push({ id: templateId, ...templateData });
      savedTemplates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      // Rebuild dropdown
      savedTemplatesSelect.innerHTML = '<option value="">-- Create New Template --</option>';
      savedTemplates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name || template.id;
        savedTemplatesSelect.appendChild(option);
      });
    }
    
    // Select the saved template
    savedTemplatesSelect.value = templateId;
    
    showStatusMessage(statusMsg, 'Template saved successfully!', 'success');
    showSuccessAnimation('Template saved!');
    
  } catch (error) {
    console.error('Error saving template:', error);
    showStatusMessage(statusMsg, 'Failed to save: ' + error.message, 'error');
  }
}

async function deleteTemplate() {
  const statusMsg = document.getElementById('editor-status-message');
  const savedTemplatesSelect = document.getElementById('saved-templates-select');
  
  if (!currentTemplateId) {
    showStatusMessage(statusMsg, 'No saved template selected to delete', 'error');
    return;
  }
  
  const templateName = currentTemplate.name || currentTemplateId;
  
  const confirmed = await showConfirmDialog(
    'Delete Template',
    `Are you sure you want to delete "${templateName}"? This cannot be undone.`,
    'Delete',
    'danger'
  );
  
  if (!confirmed) return;
  
  try {
    showStatusMessage(statusMsg, 'Deleting template...', 'pending');
    
    const docRef = doc(db, 'presentation_templates', currentTemplateId);
    await deleteDoc(docRef);
    
    // Remove from local list
    savedTemplates = savedTemplates.filter(t => t.id !== currentTemplateId);
    
    // Rebuild dropdown
    savedTemplatesSelect.innerHTML = '<option value="">-- Create New Template --</option>';
    savedTemplates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name || template.id;
      savedTemplatesSelect.appendChild(option);
    });
    
    // Reset to new template
    savedTemplatesSelect.value = '';
    loadDefaultTemplate();
    
    showStatusMessage(statusMsg, 'Template deleted', 'success');
    
  } catch (error) {
    console.error('Error deleting template:', error);
    showStatusMessage(statusMsg, 'Failed to delete: ' + error.message, 'error');
  }
}

async function resetTemplate() {
  const statusMsg = document.getElementById('editor-status-message');
  
  if (!currentEditRole) {
    showStatusMessage(statusMsg, 'Please select a role first', 'error');
    return;
  }
  
  const confirmed = await showConfirmDialog(
    'Reset to Default',
    'Are you sure you want to reset this template to the default? Your custom changes will be lost.',
    'Reset',
    'warning'
  );
  
  if (!confirmed) return;
  
  try {
    showStatusMessage(statusMsg, 'Resetting template...', 'pending');
    
    // Delete from Firestore
    const docRef = doc(db, 'presentation_templates', currentEditRole);
    await deleteDoc(docRef);
    
    // Reload default
    currentTemplate = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES[currentEditRole]));
    populateEditor(currentTemplate);
    
    showStatusMessage(statusMsg, 'Template reset to default', 'success');
    
  } catch (error) {
    console.error('Error resetting template:', error);
    showStatusMessage(statusMsg, 'Failed to reset: ' + error.message, 'error');
  }
}

// ============================================
// VOICE INPUT FUNCTIONALITY
// ============================================

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let activeTargetId = null;

function initVoiceInput() {
  if (!SpeechRecognition) {
    console.log('Speech recognition not supported');
    document.querySelectorAll('.mic-btn').forEach(btn => {
      btn.style.display = 'none';
    });
    return;
  }
  
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  
  recognition.onstart = () => {
    const statusDiv = document.getElementById('speech-status');
    if (statusDiv) {
      statusDiv.textContent = 'Listening... Tap mic again to stop.';
      statusDiv.classList.remove('hidden');
    }
  };
  
  recognition.onresult = (event) => {
    if (!activeTargetId) return;
    
    const target = document.getElementById(activeTargetId);
    if (!target) return;
    
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }
    
    if (finalTranscript) {
      const currentValue = target.value;
      const needsSpace = currentValue && !currentValue.endsWith(' ') && !currentValue.endsWith('\n');
      target.value = currentValue + (needsSpace ? ' ' : '') + finalTranscript;
    }
  };
  
  recognition.onerror = (event) => {
    console.error('Speech error:', event.error);
    const statusDiv = document.getElementById('speech-status');
    if (statusDiv) {
      if (event.error === 'not-allowed') {
        statusDiv.textContent = 'Microphone access denied. Please allow in browser settings.';
      } else {
        statusDiv.textContent = 'Error: ' + event.error;
      }
    }
    stopVoice();
  };
  
  recognition.onend = () => {
    stopVoice();
  };
  
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('mic-btn')) {
      const targetId = e.target.dataset.target;
      if (activeTargetId === targetId) {
        stopVoice();
      } else {
        startVoice(targetId, e.target);
      }
    }
  });
  
  console.log('Voice input ready');
}

function startVoice(targetId, button) {
  if (!recognition) {
    alert('Voice input not supported in this browser.');
    return;
  }
  
  if (activeTargetId) {
    stopVoice();
  }
  
  activeTargetId = targetId;
  document.querySelectorAll('.mic-btn').forEach(btn => btn.classList.remove('listening'));
  button.classList.add('listening');
  
  try {
    recognition.start();
  } catch (e) {
    console.log('Recognition already active');
  }
}

function stopVoice() {
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {}
  }
  
  activeTargetId = null;
  document.querySelectorAll('.mic-btn').forEach(btn => btn.classList.remove('listening'));
  
  const statusDiv = document.getElementById('speech-status');
  if (statusDiv) {
    statusDiv.classList.add('hidden');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVoiceInput);
} else {
  initVoiceInput();
}
