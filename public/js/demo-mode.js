import { db, auth } from "./firebase-config.js";
import { doc, deleteDoc, collection, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { deleteUser, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const DEMO_DATA = {
  member: {
    role: 'member',
    tier: null,
    member_name: 'Sarah Mitchell',
    member_email: 'sarah.mitchell.demo@example.com',
    member_password: 'DemoPass123!',
    member_confirmPassword: 'DemoPass123!',
    church_selector: 'none',
    agreeTerms: true
  },
  
  business_free: {
    role: 'business',
    tier: 'free',
    member_name: 'Michael Johnson',
    member_email: 'michael.johnson.demo@example.com',
    member_password: 'DemoPass123!',
    member_confirmPassword: 'DemoPass123!',
    business_name: 'Faithful Auto Repair',
    description: 'Family-owned auto repair shop serving the community with honest, reliable service for over 15 years. We specialize in all makes and models with a focus on fair pricing and quality work.',
    business_phone: '555-234-5678',
    business_address_line1: '1234 Main Street',
    business_address_line2: 'Suite 100',
    business_city: 'Springfield',
    business_state: 'TX',
    business_zip: '75001',
    church_selector: 'none',
    agreeTerms: true
  },
  
  business_pro: {
    role: 'business',
    tier: 'pro',
    member_name: 'David Thompson',
    member_email: 'david.thompson.demo@example.com',
    member_password: 'DemoPass123!',
    member_confirmPassword: 'DemoPass123!',
    business_name: 'Grace Financial Advisors',
    description: 'Christian financial planning and investment services. We help families build wealth with biblical principles, offering retirement planning, college savings, and estate planning with integrity.',
    business_phone: '555-345-6789',
    business_address_line1: '5678 Commerce Drive',
    business_address_line2: 'Floor 3',
    business_city: 'Dallas',
    business_state: 'TX',
    business_zip: '75201',
    business_website: 'https://gracefinancial.example.com',
    church_selector: 'none',
    agreeTerms: true
  },
  
  church: {
    role: 'church',
    tier: null,
    representative_name: 'Pastor Robert Williams',
    member_email: 'pastor.williams.demo@example.com',
    church_password: 'DemoPass123!',
    church_confirmPassword: 'DemoPass123!',
    church_name: 'New Hope Community Church',
    church_denomination: 'Non-Denominational',
    church_phone: '555-456-7890',
    church_email: 'info@newhope.example.org',
    church_website: 'https://newhope.example.org',
    church_address_line1: '789 Faith Avenue',
    church_city: 'Austin',
    church_state: 'TX',
    church_zip_code: '78701',
    church_leader_toggle: true,
    representative_title: 'Senior Pastor'
  },
  
  sales: {
    name: 'Jennifer Adams',
    email: 'jennifer.adams.demo@example.com',
    phone: '555-567-8901',
    ssn_last4: '0000',
    bank_routing: '110000000',
    bank_account: '000123456789',
    address_line1: '321 Oak Lane',
    city: 'Houston',
    state: 'TX',
    zip: '77001'
  }
};

function getDemoType() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('demo');
}

function isDemoMode() {
  return getDemoType() !== null || sessionStorage.getItem('kc_demo_active') === 'true';
}

function markDemoActive() {
  sessionStorage.setItem('kc_demo_active', 'true');
}

function storeDemoRecord(type, id) {
  const records = JSON.parse(sessionStorage.getItem('kc_demo_records') || '{}');
  if (!records[type]) records[type] = [];
  records[type].push(id);
  sessionStorage.setItem('kc_demo_records', JSON.stringify(records));
  console.log(`Demo: Stored ${type} record: ${id}`);
}

function getDemoRecords() {
  return JSON.parse(sessionStorage.getItem('kc_demo_records') || '{}');
}

async function cleanupDemoRecords() {
  console.log('Demo: Starting cleanup...');
  const records = getDemoRecords();
  const user = auth.currentUser;
  
  try {
    const batch = writeBatch(db);
    let hasDeletes = false;
    
    if (records.business_listings) {
      for (const id of records.business_listings) {
        batch.delete(doc(db, 'business_listings_public', id));
        hasDeletes = true;
        console.log(`Demo: Queued delete for business: ${id}`);
      }
    }
    
    if (records.churches) {
      for (const id of records.churches) {
        batch.delete(doc(db, 'churches', id));
        hasDeletes = true;
        console.log(`Demo: Queued delete for church: ${id}`);
      }
    }
    
    if (records.users) {
      for (const id of records.users) {
        batch.delete(doc(db, 'users', id));
        hasDeletes = true;
        console.log(`Demo: Queued delete for user doc: ${id}`);
      }
    }
    
    if (hasDeletes) {
      await batch.commit();
      console.log('Demo: Firestore records deleted');
    }
    
    if (user) {
      try {
        await deleteUser(user);
        console.log('Demo: Firebase Auth user deleted');
      } catch (authErr) {
        console.warn('Demo: Could not delete auth user (may need recent auth):', authErr.message);
        await signOut(auth);
      }
    }
    
    sessionStorage.removeItem('kc_demo_records');
    sessionStorage.removeItem('kc_demo_active');
    console.log('Demo: Cleanup complete');
    
    return true;
  } catch (error) {
    console.error('Demo: Cleanup error:', error);
    return false;
  }
}

function fillField(fieldId, value) {
  const field = document.getElementById(fieldId);
  if (!field) {
    console.log(`Demo: Field not found: ${fieldId}`);
    return false;
  }
  
  if (field.type === 'checkbox') {
    field.checked = value;
    field.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (field.tagName === 'SELECT') {
    field.value = value || '';
    field.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  
  console.log(`Demo: Filled ${fieldId} = ${value}`);
  return true;
}

function fillAllFields(data) {
  Object.keys(data).forEach(key => {
    if (key === 'role' || key === 'tier') return;
    fillField(key, data[key]);
  });
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

async function fillDemoData() {
  const demoType = getDemoType();
  if (!demoType || !DEMO_DATA[demoType]) {
    console.log('Demo: No demo type or invalid type:', demoType);
    return;
  }
  
  console.log('Demo: Starting demo mode for:', demoType);
  markDemoActive();
  const data = DEMO_DATA[demoType];
  
  showDemoBanner(demoType);
  
  try {
    await waitForElement('[data-select-role]', 3000);
  } catch (e) {
    console.log('Demo: Role cards not found, filling fields directly');
    fillAllFields(data);
    return;
  }
  
  let roleBtn;
  if (data.tier) {
    roleBtn = document.querySelector(`[data-select-role="${data.role}"][data-select-tier="${data.tier}"]`);
  } else {
    roleBtn = document.querySelector(`[data-select-role="${data.role}"]:not([data-select-tier])`);
    if (!roleBtn) {
      roleBtn = document.querySelector(`[data-select-role="${data.role}"]`);
    }
  }
  
  if (roleBtn) {
    console.log('Demo: Clicking role button for', data.role, data.tier || '');
    roleBtn.click();
    
    setTimeout(() => {
      console.log('Demo: Filling form fields');
      fillAllFields(data);
      setTimeout(() => fillAllFields(data), 500);
    }, 800);
  } else {
    console.log('Demo: No role button found, filling fields directly');
    fillAllFields(data);
  }
}

function showDemoBanner(demoType) {
  if (document.getElementById('demo-banner')) return;
  
  const labels = {
    member: 'MEMBER SIGNUP',
    business_free: 'FREE BUSINESS LISTING',
    business_pro: 'PRO BUSINESS LISTING',
    church: 'CHURCH REGISTRATION',
    sales: 'SALES AGENT ONBOARDING'
  };
  
  const banner = document.createElement('div');
  banner.id = 'demo-banner';
  banner.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(90deg, #d4af37, #f4d03f);
      color: #000;
      padding: 10px 16px;
      text-align: center;
      font-weight: bold;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    ">
      DEMO: ${labels[demoType] || demoType.toUpperCase()} - Sample data pre-filled
      <button onclick="window.exitDemoMode()" style="
        margin-left: 16px;
        background: #000;
        color: #fff;
        border: none;
        padding: 6px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      ">Exit Demo</button>
    </div>
  `;
  document.body.prepend(banner);
  document.body.style.paddingTop = '44px';
}

function showDemoCompleteBanner() {
  if (document.getElementById('demo-complete-banner')) return;
  if (!isDemoMode()) return;
  
  const banner = document.createElement('div');
  banner.id = 'demo-complete-banner';
  banner.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(90deg, #28a745, #34ce57);
      color: #fff;
      padding: 12px 16px;
      text-align: center;
      font-weight: bold;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    ">
      Demo Complete! Click to clean up demo data and exit.
      <button onclick="window.completeDemoAndCleanup()" style="
        margin-left: 16px;
        background: #fff;
        color: #28a745;
        border: none;
        padding: 8px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: bold;
      ">Complete & Exit Demo</button>
    </div>
  `;
  document.body.prepend(banner);
  document.body.style.paddingTop = '50px';
}

window.exitDemoMode = function() {
  const url = new URL(window.location.href);
  url.searchParams.delete('demo');
  sessionStorage.removeItem('kc_demo_active');
  sessionStorage.removeItem('kc_demo_records');
  window.location.href = url.toString();
};

window.completeDemoAndCleanup = async function() {
  const btn = document.querySelector('#demo-complete-banner button');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Cleaning up...';
  }
  
  await cleanupDemoRecords();
  
  window.location.href = '/';
};

function initDemoMode() {
  if (!isDemoMode()) return;
  
  console.log('Demo: Initializing demo mode');
  
  if (document.readyState === 'complete') {
    setTimeout(fillDemoData, 1500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(fillDemoData, 1500);
    });
  }
}

function initDemoCompletionCheck() {
  if (!isDemoMode()) return;
  
  const isThankYouPage = window.location.pathname.includes('thank_you');
  const isDashboardPage = window.location.pathname.includes('/member/') || 
                          window.location.pathname.includes('/business-admin/') ||
                          window.location.pathname.includes('/church-admin/') ||
                          window.location.pathname.includes('/sales/');
  
  if (isThankYouPage || isDashboardPage) {
    if (document.readyState === 'complete') {
      showDemoCompleteBanner();
    } else {
      window.addEventListener('load', showDemoCompleteBanner);
    }
  }
}

initDemoMode();
initDemoCompletionCheck();

export { isDemoMode, getDemoType, fillDemoData, DEMO_DATA, storeDemoRecord, cleanupDemoRecords, markDemoActive };
