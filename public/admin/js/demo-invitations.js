import { changeHierarchy } from '../../js/services/hierarchy-service.js';
import { escapeHtml } from '../../js/utils.js';
import { db, auth } from "../../js/firebase-config.js";
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAdmin } from "./admin-auth-guard.js";
import { sendDemoInvite } from "../../js/email/email-service.js";

const BASE_URL = window.location.origin;

const DEMO_OPTIONS = {
  member: { label: 'Member Signup', path: '/add_to_directory.html?demo=member', desc: 'Member registration with pre-filled data' },
  business_free: { label: 'Free Business', path: '/add_to_directory.html?demo=business_free', desc: 'Free business listing flow' },
  business_pro: { label: 'Pro Business', path: '/add_to_directory.html?demo=business_pro', desc: 'Pro business with payment' },
  church: { label: 'Church', path: '/add_to_directory.html?demo=church', desc: 'Church registration' },
  sales: { label: 'Sales Agent', path: '/sales/onboarding.html?demo=sales', desc: 'Sales onboarding' },
  hub: { label: 'All Demos', path: '/demo/', desc: 'Full demo hub with all options' }
};

function getDemoUrl(type) {
  return BASE_URL + (DEMO_OPTIONS[type]?.path || '/demo/');
}

function buildEmailHtml(name, demoType, note) {
  const opt = DEMO_OPTIONS[demoType];
  const url = getDemoUrl(demoType);
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hello,';
  
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#1a1a1a;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<div style="background:#2a2a2a;border-radius:12px;padding:40px;border:1px solid #333;">
<div style="text-align:center;margin-bottom:30px;">
<h1 style="color:#d4af37;margin:0;font-size:28px;">Kingdom Connects</h1>
<p style="color:#888;margin:8px 0 0 0;">Faith-Based Business Directory</p>
</div>
<p style="color:#fff;font-size:16px;line-height:1.6;">${greeting}</p>
<p style="color:#ccc;font-size:16px;line-height:1.6;">You've been invited to experience Kingdom Connects through an interactive demo.</p>
${note ? `<div style="background:#333;border-left:4px solid #d4af37;padding:15px 20px;margin:20px 0;border-radius:0 8px 8px 0;"><p style="color:#fff;margin:0;font-style:italic;">"${escapeHtml(note)}"</p></div>` : ''}
<div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:25px 0;border:1px solid #444;">
<h3 style="color:#d4af37;margin:0 0 10px 0;">${opt.label} Demo</h3>
<p style="color:#aaa;margin:0;font-size:14px;">${opt.desc}</p>
</div>
<div style="text-align:center;margin:30px 0;">
<a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#f4d03f);color:#000;text-decoration:none;padding:15px 40px;border-radius:8px;font-weight:bold;font-size:16px;">Start Demo</a>
</div>
<p style="color:#888;font-size:14px;">This demo uses sample data - no real account needed.</p>
<hr style="border:none;border-top:1px solid #444;margin:30px 0;">
<p style="color:#666;font-size:12px;text-align:center;">Kingdom Connects<br><a href="${BASE_URL}" style="color:#d4af37;">kingdom-commerce.web.app</a></p>
</div></div></body></html>`;
}

function showStatus(msg, type) {
  const el = document.getElementById('statusMessage');
  el.textContent = msg;
  el.className = `status-message ${type}`;
  el.classList.remove('hidden');
  if (type === 'success') setTimeout(() => el.classList.add('hidden'), 4000);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showStatus('Link copied!', 'success');
  }).catch(() => prompt('Copy this link:', text));
}

async function sendInvite(email, name, demoType, note) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not logged in');
  
  const htmlContent = buildEmailHtml(name, demoType, note);
  await sendDemoInvite(email, name, demoType, note, htmlContent);
  
  await addDoc(collection(db, 'demo_invites'), {
    recipientEmail: email,
    recipientName: name || null,
    demoType,
    sentBy: user.uid,
    sentAt: serverTimestamp()
  });
  
  await setDoc(doc(db, 'admin_prefs', user.uid), { lastDemoRecipient: { email, name } }, { merge: true });
}

function renderQuickSend(lastRecipient) {
  const container = document.getElementById('quickSendSection');
  if (!lastRecipient?.email) {
    container.innerHTML = '<p class="text-muted text-sm">Send your first demo to enable quick re-send.</p>';
    return;
  }
  
  container.innerHTML = `
    <p class="text-sm mb-md">Quick send to: <strong>${escapeHtml(lastRecipient.name || lastRecipient.email)}</strong></p>
    <div class="quick-send-grid">
      ${Object.entries(DEMO_OPTIONS).map(([key, opt]) => `
        <button type="button" class="btn btn-outline btn-small quick-send-btn" data-demo="${key}" data-email="${escapeHtml(lastRecipient.email).replace(/"/g, '&quot;')}" data-name="${escapeHtml(lastRecipient.name || '').replace(/"/g, '&quot;')}">
          ${opt.label}
        </button>
      `).join('')}
    </div>
  `;
}

function renderCopyLinks() {
  const container = document.getElementById('copyLinksSection');
  container.innerHTML = Object.entries(DEMO_OPTIONS).map(([key, opt]) => `
    <div class="copy-link-row">
      <span>${opt.label}</span>
      <button type="button" class="btn btn-outline btn-small" onclick="copyDemoLink('${key}')">Copy</button>
    </div>
  `).join('');
}

window.copyDemoLink = (type) => copyToClipboard(getDemoUrl(type));

let allDemoRecords = { users: [], businesses: [], churches: [] };
let currentFilter = 'all';

async function loadDemoRecords() {
  const section = document.getElementById('demoRecordsSection');
  if (!section) return;
  
  section.innerHTML = '<p class="text-muted">Loading demo records...</p>';
  
  try {
    const usersQuery = query(collection(db, 'users'), where('is_demo', '==', true));
    const businessQuery = query(collection(db, 'business_listings_public'), where('is_demo', '==', true));
    const churchQuery = query(collection(db, 'churches'), where('is_demo', '==', true));
    
    const [usersSnap, businessSnap, churchSnap] = await Promise.all([
      getDocs(usersQuery),
      getDocs(businessQuery),
      getDocs(churchQuery)
    ]);
    
    allDemoRecords = {
      users: usersSnap.docs.map(d => ({ ...d.data(), id: d.id })),
      businesses: businessSnap.docs.map(d => ({ ...d.data(), id: d.id })).filter(b => !b.platform_suspended),
      churches: churchSnap.docs.map(d => ({ ...d.data(), id: d.id })).filter(c => c.listing_status !== 'suspended')
    };
    
    renderDemoRecords();
  } catch (err) {
    console.error('Error loading demo records:', err);
    if (section) section.innerHTML = `<p class="text-muted">Could not load demo records.</p>`;
  }
}

function renderDemoRecords() {
  const section = document.getElementById('demoRecordsSection');
  const deleteAllBtn = document.getElementById('deleteAllDemoRecords');
  if (!section || !deleteAllBtn) return;
  
  const showMembers = currentFilter === 'all' || currentFilter === 'members';
  const showBusinesses = currentFilter === 'all' || currentFilter === 'businesses';
  const showChurches = currentFilter === 'all' || currentFilter === 'churches';
  
  const visibleUsers = showMembers ? allDemoRecords.users : [];
  const visibleBusinesses = showBusinesses ? allDemoRecords.businesses : [];
  const visibleChurches = showChurches ? allDemoRecords.churches : [];
  
  const total = visibleUsers.length + visibleBusinesses.length + visibleChurches.length;
  
  if (total === 0) {
    section.innerHTML = '<p class="text-muted">No demo records found.</p>';
    deleteAllBtn.classList.add('hidden');
    return;
  }
  
  deleteAllBtn.classList.remove('hidden');
  
  let html = '';
  
  if (visibleUsers.length > 0) {
    html += `<div class="mb-sm"><strong class="gold">Members (${visibleUsers.length})</strong></div>`;
    visibleUsers.forEach(u => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
        <span class="text-sm">${escapeHtml(u.name || 'Unknown')}</span>
        <button type="button" class="btn btn-red btn-small demo-delete-btn" data-col="users" data-id="${u.id}">Delete</button>
      </div>`;
    });
  }
  
  if (visibleBusinesses.length > 0) {
    html += `<div class="mb-sm ${visibleUsers.length > 0 ? 'mt-md' : ''}"><strong class="gold">Businesses (${visibleBusinesses.length})</strong></div>`;
    visibleBusinesses.forEach(b => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
        <span class="text-sm">${escapeHtml(b.business_name || 'Unknown')}</span>
        <button type="button" class="btn btn-red btn-small demo-delete-btn" data-col="business_listings_public" data-id="${b.id}">Suspend</button>
      </div>`;
    });
  }
  
  if (visibleChurches.length > 0) {
    html += `<div class="mb-sm ${(visibleUsers.length > 0 || visibleBusinesses.length > 0) ? 'mt-md' : ''}"><strong class="gold">Churches (${visibleChurches.length})</strong></div>`;
    visibleChurches.forEach(c => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
        <span class="text-sm">${escapeHtml(c.church_name || 'Unknown')}</span>
        <button type="button" class="btn btn-red btn-small demo-delete-btn" data-col="churches" data-id="${c.id}">Suspend</button>
      </div>`;
    });
  }
  
  section.innerHTML = html;
  
  section.querySelectorAll('.demo-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const col = btn.dataset.col;
      const id = btn.dataset.id;
      if (!confirm('Retire this demo record? Members are deleted through account cleanup; businesses and churches are suspended.')) return;
      btn.disabled = true;
      btn.textContent = '...';
      try {
        await retireDemoRecord(col, id);
        showStatus('Demo record retired.', 'success');
        await loadDemoRecords();
      } catch (err) {
        showStatus('Error: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Delete';
      }
    });
  });
}

function setDemoFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.demo-filter-btn').forEach(btn => {
    if (btn.dataset.filter === filter) {
      btn.classList.add('active');
      btn.classList.remove('btn-outline');
    } else {
      btn.classList.remove('active');
      btn.classList.add('btn-outline');
    }
  });
  renderDemoRecords();
}

window.deleteDemoRecord = async function(collectionName, docId) {
  if (!confirm('Retire this demo record? Members are deleted through account cleanup; businesses and churches are suspended.')) return;
  
  try {
    await retireDemoRecord(collectionName, docId);
    showStatus('Demo record retired.', 'success');
    await loadDemoRecords();
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  }
};

async function deleteAllDemoRecords() {
  const showMembers = currentFilter === 'all' || currentFilter === 'members';
  const showBusinesses = currentFilter === 'all' || currentFilter === 'businesses';
  const showChurches = currentFilter === 'all' || currentFilter === 'churches';
  
  const usersToDelete = showMembers ? allDemoRecords.users : [];
  const businessesToDelete = showBusinesses ? allDemoRecords.businesses : [];
  const churchesToDelete = showChurches ? allDemoRecords.churches : [];
  
  const total = usersToDelete.length + businessesToDelete.length + churchesToDelete.length;
  if (total === 0) return;
  
  const filterLabel = currentFilter === 'all' ? 'ALL' : currentFilter;
  if (!confirm(`Retire ${total} ${filterLabel} demo record(s)? Member accounts will be deleted; businesses and churches will be suspended.`)) return;
  
  const btn = document.getElementById('deleteAllDemoRecords');
  btn.disabled = true;
  btn.textContent = 'Processing...';
  
  try {
    let completed = 0;
    const failures = [];
    for (const [col, records] of [['business_listings_public', businessesToDelete], ['churches', churchesToDelete], ['users', usersToDelete]]) {
      for (const record of records) {
        try { await retireDemoRecord(col, record.id); completed++; }
        catch (error) { failures.push(error.message); }
      }
    }
    showStatus(`${completed} demo records processed.${failures.length ? ' ' + failures.length + ' could not be processed: ' + failures.join('; ') : ''}`, failures.length ? 'error' : 'success');
    await loadDemoRecords();
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Retire All Shown';
  }
}

requireAdmin(async (userContext, firebaseUser) => {
  // Load last recipient for quick send
  try {
    const prefsDoc = await getDoc(doc(db, 'admin_prefs', firebaseUser.uid));
    const lastRecipient = prefsDoc.data()?.lastDemoRecipient;
    renderQuickSend(lastRecipient);
  } catch (e) {
    renderQuickSend(null);
  }
  
  renderCopyLinks();
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('mainContent').classList.remove('hidden');
  
  // Quick send buttons
  document.querySelectorAll('.quick-send-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const email = btn.dataset.email;
      const name = btn.dataset.name;
      const demoType = btn.dataset.demo;
      
      btn.disabled = true;
      btn.textContent = 'Sending...';
      
      try {
        await sendInvite(email, name, demoType, '');
        showStatus(`Sent ${DEMO_OPTIONS[demoType].label} demo to ${email}!`, 'success');
        btn.textContent = 'Sent!';
        setTimeout(() => { btn.textContent = DEMO_OPTIONS[demoType].label; btn.disabled = false; }, 2000);
      } catch (err) {
        showStatus(err.message, 'error');
        btn.textContent = DEMO_OPTIONS[demoType].label;
        btn.disabled = false;
      }
    });
  });
  
  // New recipient form
  document.getElementById('sendForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('recipientEmail').value.trim();
    const name = document.getElementById('recipientName').value.trim();
    const demoType = document.getElementById('demoType').value;
    const note = document.getElementById('personalNote').value.trim();
    const btn = document.getElementById('sendBtn');
    
    if (!email || !demoType) {
      showStatus('Enter email and select demo type.', 'error');
      return;
    }
    
    btn.disabled = true;
    btn.textContent = 'Sending...';
    
    try {
      await sendInvite(email, name, demoType, note);
      showStatus(`Demo sent to ${email}!`, 'success');
      document.getElementById('sendForm').reset();
      renderQuickSend({ email, name });
    } catch (err) {
      showStatus(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send';
    }
  });
  
  // Demo records cleanup - load after short delay to ensure page stability
  setTimeout(() => {
    loadDemoRecords().catch(e => console.warn('Demo records load failed:', e));
  }, 500);
  
  const refreshBtn = document.getElementById('refreshDemoRecords');
  const deleteAllBtn = document.getElementById('deleteAllDemoRecords');
  if (refreshBtn) refreshBtn.addEventListener('click', loadDemoRecords);
  if (deleteAllBtn) deleteAllBtn.addEventListener('click', deleteAllDemoRecords);
  
  // Filter tab buttons
  document.querySelectorAll('.demo-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => setDemoFilter(btn.dataset.filter));
  });
});

async function retireDemoRecord(collectionName, id) {
  const record = await getDoc(doc(db, collectionName, id));
  if (!record.exists() || record.data().is_demo !== true) throw new Error('Only marked demo records can be retired here.');
  if (collectionName === 'users') return changeHierarchy('deleteMemberAccount', { memberId: id });
  if (collectionName === 'business_listings_public') return changeHierarchy('reviewBusiness', { businessId: id, decision: 'suspend' });
  if (collectionName === 'churches') return changeHierarchy('setChurchStatus', { churchId: id, status: 'suspended' });
  throw new Error('Unsupported demo record type.');
}
