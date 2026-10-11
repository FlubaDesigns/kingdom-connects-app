import { db } from '../../js/firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { adminReady } from './admin-auth-guard.js';
const { user: currentUser } = await adminReady;

const manualConfigs = {
  sales_agent: {
    name: 'Sales Agent Manual',
    path: '/sales/user-manual.html',
    sections: [
      { id: 'hero_title', label: 'Hero Title', type: 'text', default: 'Build Passive Income That Pays Forever' },
      { id: 'hero_description', label: 'Hero Description', type: 'textarea', rows: 3, default: 'Every Pro subscription you sell pays you <strong>{{agent_commission}} commission every single month</strong> for as long as that business stays subscribed. Stop trading time for money. Start building wealth that compounds.' },
      { id: 'getting_started_intro', label: 'Getting Started - Intro', type: 'textarea', rows: 4, default: 'Your first week sets the foundation for long-term success. Follow these steps to hit the ground running.' },
      { id: 'prospecting_intro', label: 'Finding Prospects - Intro', type: 'textarea', rows: 4, default: 'The best prospects are businesses already connected to the Christian community.' },
      { id: 'closing_intro', label: 'Closing Sales - Intro', type: 'textarea', rows: 4, default: 'Focus on the value, not the price. At just {{monthly_price}}/month, Kingdom Connects is affordable.' },
      { id: 'objections_intro', label: 'Handling Objections - Intro', type: 'textarea', rows: 4, default: 'Every objection is an opportunity to provide more information.' },
      { id: 'director_intro', label: 'Becoming a Director - Intro', type: 'textarea', rows: 4, default: 'As a Sales Director, you earn {{director_commission}} on every sale your team makes.' },
      { id: 'scripts_intro', label: 'Scripts & Templates - Intro', type: 'textarea', rows: 4, default: 'Use these proven scripts as starting points.' }
    ]
  },
  business_admin: {
    name: 'Business Owner Manual',
    path: '/business-admin/user-manual.html',
    sections: [
      { id: 'hero_title', label: 'Hero Title', type: 'text', default: 'Grow Your Business with Kingdom Connects' },
      { id: 'hero_description', label: 'Hero Description', type: 'textarea', rows: 3, default: 'Connect with Christian customers who want to support faith-based businesses. Your Pro listing puts you in front of church members actively looking for trusted services.' }
    ]
  },
  church_admin: {
    name: 'Church Admin Manual',
    path: '/church-admin/user-manual.html',
    sections: [
      { id: 'hero_title', label: 'Hero Title', type: 'text', default: 'Manage Your Church Profile' },
      { id: 'hero_description', label: 'Hero Description', type: 'textarea', rows: 3, default: 'Help your congregation discover and support Christian businesses. Your church earns <strong>{{church_tithe}}</strong> of every Pro subscription from affiliated businesses.' }
    ]
  },
  member: {
    name: 'Member Manual',
    path: '/member/user-manual.html',
    sections: [
      { id: 'hero_title', label: 'Hero Title', type: 'text', default: 'Welcome to Kingdom Connects' },
      { id: 'hero_description', label: 'Hero Description', type: 'textarea', rows: 3, default: 'Discover and support Christian businesses in your community. Find trusted services from fellow believers.' }
    ]
  },
  marketing: {
    name: 'Marketing Manual',
    path: '/marketing/user-manual.html',
    sections: [
      { id: 'hero_title', label: 'Hero Title', type: 'text', default: 'Kingdom Connects Marketing Guide' },
      { id: 'hero_description', label: 'Hero Description', type: 'textarea', rows: 3, default: 'Resources and strategies for promoting Kingdom Connects to churches and businesses in your community.' }
    ]
  }
};

const manualSelect = document.getElementById('manualSelect');
const loadingMessage = document.getElementById('loadingMessage');
const noSelectionMessage = document.getElementById('noSelectionMessage');
const manualForm = document.getElementById('manualForm');
const formFields = document.getElementById('formFields');
const variablesBox = document.getElementById('variablesBox');
const previewModal = document.getElementById('previewModal');
const previewContent = document.getElementById('previewContent');

let currentManual = null;
let currentContent = {};


manualSelect.addEventListener('change', async () => {
  const manualId = manualSelect.value;
  
  if (!manualId) {
    manualForm.classList.add('hidden');
    variablesBox.classList.add('hidden');
    noSelectionMessage.classList.remove('hidden');
    currentManual = null;
    return;
  }

  currentManual = manualId;
  noSelectionMessage.classList.add('hidden');
  loadingMessage.classList.remove('hidden');
  manualForm.classList.add('hidden');
  
  await loadManualContent(manualId);
});

async function loadManualContent(manualId) {
  const config = manualConfigs[manualId];
  if (!config) return;

  try {
    const docRef = doc(db, 'public_manuals', manualId);
    const docSnap = await getDoc(docRef);
    
    currentContent = {};
    config.sections.forEach(section => {
      currentContent[section.id] = section.default;
    });

    if (docSnap.exists()) {
      const data = docSnap.data();
      Object.keys(data).forEach(key => {
        if (currentContent.hasOwnProperty(key)) {
          currentContent[key] = data[key];
        }
      });
    }

    renderFormFields(config);
    
    loadingMessage.classList.add('hidden');
    variablesBox.classList.remove('hidden');
    manualForm.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading manual content:', error);
    window.showToast('Failed to load manual content.', 'error');
    loadingMessage.classList.add('hidden');
  }
}

function renderFormFields(config) {
  formFields.innerHTML = '';
  
  config.sections.forEach(section => {
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'form-field';
    
    const label = document.createElement('label');
    label.setAttribute('for', section.id);
    label.textContent = section.label;
    fieldDiv.appendChild(label);
    
    let input;
    if (section.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = section.rows || 4;
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    
    input.id = section.id;
    input.name = section.id;
    input.className = 'input-dark';
    input.value = currentContent[section.id] || '';
    input.placeholder = section.default;
    
    fieldDiv.appendChild(input);
    formFields.appendChild(fieldDiv);
  });
}

manualForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!currentManual) return;
  
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const config = manualConfigs[currentManual];
    const content = {};
    
    config.sections.forEach(section => {
      const element = document.getElementById(section.id);
      if (element) {
        content[section.id] = element.value.trim() || section.default;
      }
    });

    content.updated_at = serverTimestamp();
    content.updated_by = currentUser.uid;

    await setDoc(doc(db, 'public_manuals', currentManual), content, { merge: true });
    
    window.showToast(`${config.name} saved successfully!`, 'success');
  } catch (error) {
    console.error('Error saving manual:', error);
    window.showToast('Failed to save manual content.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
});

document.getElementById('previewBtn').addEventListener('click', async () => {
  if (!currentManual) return;
  
  let pricingSettings = { monthly_price: 8.99, annual_price: 74.99 };
  let commissionSettings = { salesperson_percentage: 20, sales_director_percentage: 15, church_percentage: 10 };

  try {
    const pricingDoc = await getDoc(doc(db, 'pricing_settings', 'default'));
    if (pricingDoc.exists()) {
      pricingSettings = { ...pricingSettings, ...pricingDoc.data() };
    }

    const commissionDoc = await getDoc(doc(db, 'commission_policies', 'default'));
    if (commissionDoc.exists()) {
      commissionSettings = { ...commissionSettings, ...commissionDoc.data() };
    }
  } catch (error) {
    console.error('Error loading settings for preview:', error);
  }

  function replaceVars(text) {
    if (!text) return '';
    return text
      .replace(/\{\{agent_commission\}\}/g, commissionSettings.salesperson_percentage + '%')
      .replace(/\{\{director_commission\}\}/g, commissionSettings.sales_director_percentage + '%')
      .replace(/\{\{monthly_price\}\}/g, '$' + pricingSettings.monthly_price)
      .replace(/\{\{annual_price\}\}/g, '$' + Number(pricingSettings.annual_price ?? 74.99).toFixed(2))
      .replace(/\{\{church_tithe\}\}/g, commissionSettings.church_percentage + '%')
      .replace(/\{\{platform_name\}\}/g, 'Kingdom Connects');
  }

  const config = manualConfigs[currentManual];
  let previewHtml = `<h2 class="gold">${config.name} Preview</h2>`;
  
  config.sections.forEach(section => {
    const element = document.getElementById(section.id);
    const value = element ? element.value : '';
    previewHtml += `
      <div class="preview-section">
        <h4 class="text-muted">${section.label}</h4>
        <p>${replaceVars(value || section.default)}</p>
      </div>
      <hr>
    `;
  });

  previewHtml += `<p class="text-muted text-sm">Variables are replaced with current values from your settings.</p>`;

  previewContent.innerHTML = previewHtml;
  previewModal.classList.add('active');
});

document.getElementById('closePreview').addEventListener('click', () => {
  previewModal.classList.remove('active');
});

previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) {
    previewModal.classList.remove('active');
  }
});
