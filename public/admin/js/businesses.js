import { changeHierarchy } from '../../js/services/hierarchy-service.js';
import { db } from "../../js/firebase-config.js";
import { onReady } from "../../js/dom-ready.js";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { sendTemplate } from "../../js/email/email-service.js";
import { isBusinessPro } from "../../js/role-utils.js";

let allBusinesses = [];
let allChurches = [];
let currentSort = { field: 'business_name', asc: true };

async function initBusinessesAdmin() {
  await loadChurches();
  await loadBusinesses();
  setupFilters();
  setupSorting();
  
  const addBtn = document.getElementById('btnAddBusiness');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      window.location.href = '/submit-business';
    });
  }
}

async function loadChurches() {
  try {
    const q = query(collection(db, "churches"), orderBy("church_name"));
    const querySnapshot = await getDocs(q);
    
    allChurches = [];
    const churchFilter = document.getElementById('churchFilter');
    
    querySnapshot.forEach((doc) => {
      const church = doc.data();
      allChurches.push({ id: doc.id, ...church });
      
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = church.church_name || doc.id;
      churchFilter.appendChild(option);
    });
  } catch (error) {
    console.error("Error loading churches:", error);
  }
}

async function loadBusinesses() {
  const loadingMessage = document.getElementById("loadingMessage");
  const contentArea = document.getElementById("contentArea");
  const emptyState = document.getElementById("emptyState");
  const errorMessage = document.getElementById("errorMessage");

  try {
    allBusinesses = [];
    
    // Load from both public and private collections, merge by ID
    const [publicSnapshot, privateSnapshot] = await Promise.all([
      getDocs(query(collection(db, "business_listings_public"))),
      getDocs(query(collection(db, "business_listings_private")))
    ]);
    
    // Create map of private data by ID
    const privateDataMap = new Map();
    privateSnapshot.forEach((doc) => {
      privateDataMap.set(doc.id, doc.data());
    });
    
    // Merge public and private data
    publicSnapshot.forEach((doc) => {
      const publicData = doc.data();
      const privateData = privateDataMap.get(doc.id) || {};
      const merged = { ...publicData, ...privateData };
      
      allBusinesses.push({
        id: doc.id,
        ...merged,
        created_at: merged.created_at?.toDate ? merged.created_at.toDate().toISOString() : merged.created_at,
        pro_start_date: merged.pro_start_date?.toDate ? merged.pro_start_date.toDate().toISOString() : merged.pro_start_date,
        pro_end_date: merged.pro_end_date?.toDate ? merged.pro_end_date.toDate().toISOString() : merged.pro_end_date
      });
    });

    if (allBusinesses.length === 0) {
      loadingMessage.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    updateStats();
    renderBusinesses(allBusinesses);
    
    loadingMessage.classList.add('hidden');
    contentArea.classList.remove('hidden');

  } catch (error) {
    console.error("Firebase error:", error);
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
  }
}

function updateStats() {
  const total = allBusinesses.length;
  const active = allBusinesses.filter(b => b.listing_status === 'active').length;
  const pending = allBusinesses.filter(b => b.listing_status === 'pending').length;
  const pro = allBusinesses.filter(b => isBusinessPro(b)).length;

  document.getElementById('totalCount').textContent = total;
  document.getElementById('activeCount').textContent = active;
  document.getElementById('pendingCount').textContent = pending;
  document.getElementById('proCount').textContent = pro;
}

// Helper to get business email
function getBusinessEmail(business) {
  return business.email || '';
}

// Helper to get business phone
function getBusinessPhone(business) {
  return business.phone_number || '';
}

function checkDuplicateAddress(business) {
  const addressLine1 = (business.address_line1 || '').toLowerCase().trim();
  const city = (business.city || '').toLowerCase().trim();
  const state = (business.state || '').toLowerCase().trim();
  const zipCode = (business.zip_code || '').toLowerCase().trim();
  
  if (!addressLine1 || !city || !state) return null;
  
  const normalizedAddress = `${addressLine1}|${city}|${state}|${zipCode}`;
  
  // Find other businesses with same address (excluding self)
  const duplicates = allBusinesses.filter(b => {
    const otherLine1 = (b.address_line1 || '').toLowerCase().trim();
    const otherCity = (b.city || '').toLowerCase().trim();
    const otherState = (b.state || '').toLowerCase().trim();
    const otherZip = (b.zip_code || '').toLowerCase().trim();
    
    if (!otherLine1 || !otherCity || !otherState) return false;
    
    const otherAddress = `${otherLine1}|${otherCity}|${otherState}|${otherZip}`;
    
    return b.id !== business.id && otherAddress === normalizedAddress;
  });
  
  if (duplicates.length === 0) return null;
  
  // Check if duplicate is already approved
  const approvedDuplicate = duplicates.find(b => b.listing_status === 'active');
  if (approvedDuplicate) {
    return {
      type: 'error',
      message: `⚠️ DUPLICATE ADDRESS: Already used by "${approvedDuplicate.business_name}"`
    };
  }
  
  // Duplicate is also pending
  return {
    type: 'warning',
    message: `⚠️ Possible duplicate: ${duplicates.length} other submission(s) at same address`
  };
}

function renderBusinesses(businesses) {
  const tbody = document.getElementById("businessTableBody");
  tbody.innerHTML = "";

  if (businesses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center p-md">No businesses match your filters.</td></tr>`;
    return;
  }

  businesses.forEach((business) => {
    const row = document.createElement("tr");
    row.className = "business-row";
    
    const statusClass = `status-${business.listing_status || 'pending'}`;
    const tierBadge = isBusinessPro(business) 
      ? '<span class="badge badge-pro">PRO</span>' 
      : '<span class="badge badge-free">FREE</span>';
    
    const rating = business.average_rating ? business.average_rating.toFixed(1) + ' ⭐' : 'No reviews';
    const createdDate = business.created_at ? new Date(business.created_at).toLocaleDateString() : 'Unknown';
    
    // Check for duplicate address
    const duplicateCheck = checkDuplicateAddress(business);
    const duplicateWarning = duplicateCheck 
      ? `<div class="alert-compact alert-compact-${duplicateCheck.type}">${duplicateCheck.message}</div>`
      : '';

    row.innerHTML = `
      <td data-label="Business Name">
        <strong>${escapeHtml(business.business_name || 'Unnamed')}</strong>
        ${duplicateWarning}
      </td>
      <td data-label="Owner">${escapeHtml(business.your_name || 'N/A')}</td>
      <td data-label="Location">${escapeHtml(business.city || 'N/A')}, ${escapeHtml(business.state || 'N/A')}</td>
      <td data-label="Contact">
        <small>${escapeHtml(business.email || 'N/A')}<br/>
        ${escapeHtml(business.phone_number || 'N/A')}</small>
      </td>
      <td data-label="Status" class="${statusClass}">${(business.listing_status || 'pending').toUpperCase()}</td>
      <td data-label="Tier">${tierBadge}</td>
      <td data-label="Rating">${rating}</td>
      <td data-label="Created"><small>${createdDate}</small></td>
      <td data-label="Actions">
        <div class="action-buttons">
          ${business.listing_status === 'pending' ? 
            `<button class="btn btn-small btn-success" data-action="approveBusiness" data-id="${business.id}">Approve</button>` : 
            ''}
          ${business.listing_status === 'active' ? 
            `<button class="btn btn-small btn-warning" data-action="suspendBusiness" data-id="${business.id}">Suspend</button>` : 
            ''}
          ${business.listing_status === 'suspended' ? 
            `<button class="btn btn-small btn-success" data-action="activateBusiness" data-id="${business.id}">Activate</button>` : 
            ''}
          ${business.is_featured ? 
            `<button class="btn btn-small btn-secondary" data-action="unfeatureBusiness" data-id="${business.id}" title="Remove from homepage">⭐ Unfeature</button>` : 
            `<button class="btn btn-small btn-secondary" data-action="featureBusiness" data-id="${business.id}" title="Show on homepage">⭐ Feature</button>`
          }
          ${!isBusinessPro(business) ? 
            `<button class="btn btn-small btn-gold" data-action="grantPro" data-id="${business.id}" title="Grant promotional Pro status">🌟 Grant Pro</button>` : 
            `<button class="btn btn-small btn-secondary" data-action="revokePro" data-id="${business.id}" title="Remove Pro status">❌ Revoke Pro</button>`
          }
          <button class="btn btn-small btn-secondary" data-action="editBusiness" data-id="${business.id}">Edit</button>
          <button class="btn btn-small btn-danger" data-action="deleteBusiness" data-id="${business.id}">Delete</button>
        </div>
      </td>
    `;
    
    tbody.appendChild(row);
  });
}

function setupFilters() {
  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const proFilter = document.getElementById('proFilter');
  const churchFilter = document.getElementById('churchFilter');
  const sortFilter = document.getElementById('sortFilter');
  const clearButton = document.getElementById('clearFilters');

  const applyFilters = () => {
    let filtered = [...allBusinesses];

    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(b => {
        const email = b.email || '';
        const businessName = b.business_name || '';
        const city = b.city || '';
        return businessName.toLowerCase().includes(searchTerm) ||
               city.toLowerCase().includes(searchTerm) ||
               email.toLowerCase().includes(searchTerm);
      });
    }

    const status = statusFilter.value;
    if (status) {
      filtered = filtered.filter(b => b.listing_status === status);
    }

    const pro = proFilter.value;
    if (pro === 'true') {
      filtered = filtered.filter(b => isBusinessPro(b));
    } else if (pro === 'false') {
      filtered = filtered.filter(b => !isBusinessPro(b));
    }

    const church = churchFilter.value;
    if (church) {
      filtered = filtered.filter(b => b.church_id === church);
    }

    const sortValue = sortFilter.value;
    if (sortValue) {
      const [field, direction] = sortValue.split('-');
      const asc = direction === 'asc';
      filtered.sort((a, b) => {
        let aVal = a[field] || '';
        let bVal = b[field] || '';
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
        if (aVal < bVal) return asc ? -1 : 1;
        if (aVal > bVal) return asc ? 1 : -1;
        return 0;
      });
    }

    renderBusinesses(filtered);
  };

  searchInput.addEventListener('input', applyFilters);
  statusFilter.addEventListener('change', applyFilters);
  proFilter.addEventListener('change', applyFilters);
  churchFilter.addEventListener('change', applyFilters);
  sortFilter.addEventListener('change', applyFilters);
  
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    statusFilter.value = '';
    proFilter.value = '';
    churchFilter.value = '';
    sortFilter.value = '';
    renderBusinesses(allBusinesses);
  });
}

function setupSorting() {
  const headers = document.querySelectorAll('.business-table th[data-sort]');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const field = header.getAttribute('data-sort');
      
      if (currentSort.field === field) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.field = field;
        currentSort.asc = true;
      }

      const sorted = [...allBusinesses].sort((a, b) => {
        // Use helper functions for fields with legacy fallbacks
        let aVal, bVal;
        if (field === 'email') {
          aVal = getBusinessEmail(a);
          bVal = getBusinessEmail(b);
        } else if (field === 'phone') {
          aVal = getBusinessPhone(a);
          bVal = getBusinessPhone(b);
        } else {
          aVal = a[field] || '';
          bVal = b[field] || '';
        }

        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        if (aVal < bVal) return currentSort.asc ? -1 : 1;
        if (aVal > bVal) return currentSort.asc ? 1 : -1;
        return 0;
      });

      renderBusinesses(sorted);
    });
  });
}

window.approveBusiness = async (id) => {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Approve Business', 'Approve this business listing?', 'Approve', 'success')
    : confirm('Approve this business listing?');
  if (!confirmed) return;
  
  try {
    const business = allBusinesses.find(b => b.id === id);
    
    if (!business) {
      window.showToast('Business not found', 'error');
      return;
    }
    
    const ownerEmail = business.email || business.owner_email || '';
    
    // Look up church name if affiliated
    let churchName = '';
    if (business.church_id) {
      try {
        const churchDoc = await getDoc(doc(db, 'churches', business.church_id));
        if (churchDoc.exists()) {
          churchName = churchDoc.data().church_name || '';
        }
      } catch (e) {
        console.warn('Could not fetch church name:', e);
      }
    }
    
    await changeHierarchy('reviewBusiness', { businessId: id, decision: 'approve' });

    if (ownerEmail) {
      try {
        const dashboardDomain = window.location.protocol + '//' + window.location.hostname + 
          (window.location.port && !window.location.hostname.includes('firebase') ? ':' + window.location.port : '');
        
        await sendTemplate('business_approved', ownerEmail, {
          business_name: business.business_name || 'Your Business',
          owner_name: business.your_name || 'Business Owner',
          church_name: churchName,
          dashboard_url: `${dashboardDomain}/business-admin/dashboard.html`,
          approval_date: new Date().toLocaleDateString()
        });
        console.log('Approval email sent to:', ownerEmail);
      } catch (emailError) {
        console.error('Error sending approval email:', emailError);
      }
    }
    
    window.showToast('Platform approval saved. Publication also requires an active church affiliation.', 'success');
    await loadBusinesses();
  } catch (error) {
    console.error('Error approving business:', error);
    window.showToast('Error approving business: ' + error.message, 'error');
  }
};

window.suspendBusiness = async (id) => {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Suspend Business', 'Suspend this business listing?', 'Suspend', 'warning')
    : confirm('Suspend this business listing?');
  if (!confirmed) return;
  
  try {
    await changeHierarchy('reviewBusiness', { businessId: id, decision: 'suspend' });
    window.showToast('Business suspended!', 'success');
    await loadBusinesses();
  } catch (error) {
    console.error('Error suspending business:', error);
    window.showToast('Error suspending business: ' + error.message, 'error');
  }
};

window.activateBusiness = async (id) => {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Activate Business', 'Reactivate this business listing?', 'Activate', 'success')
    : confirm('Reactivate this business listing?');
  if (!confirmed) return;
  
  try {
    await changeHierarchy('reviewBusiness', { businessId: id, decision: 'activate' });
    window.showToast('Business activated!', 'success');
    await loadBusinesses();
  } catch (error) {
    console.error('Error activating business:', error);
    window.showToast('Error activating business: ' + error.message, 'error');
  }
};

window.editBusiness = (id) => {
  window.location.href = `/business-admin/edit-listing?id=${id}`;
};

window.deleteBusiness = async (id) => {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Delete Business', 'DELETE this business permanently? This cannot be undone. Kingdom Connects policy is to downgrade, not delete.', 'Delete Forever', 'danger')
    : confirm('⚠️ DELETE this business permanently? This cannot be undone.\n\nNote: Kingdom Connects policy is to downgrade, not delete. Are you sure?');
  if (!confirmed) return;
  
  try {
    // Delete from both collections
    await Promise.all([
      deleteDoc(doc(db, "business_listings_public", id)),
      deleteDoc(doc(db, "business_listings_private", id))
    ]);
    window.showToast('Business deleted!', 'success');
    await loadBusinesses();
  } catch (error) {
    console.error('Error deleting business:', error);
    window.showToast('Error deleting business: ' + error.message, 'error');
  }
};

window.featureBusiness = async (id) => {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Feature Business', 'Feature this business on the homepage?', 'Feature', 'success')
    : confirm('Feature this business on the homepage?');
  if (!confirmed) return;
  
  try {
    await updateDoc(doc(db, "business_listings_public", id), {
      is_featured: true,
      featured_at: serverTimestamp()
    });
    window.showToast('Business featured on homepage!', 'success');
    await loadBusinesses();
  } catch (error) {
    console.error('Error featuring business:', error);
    window.showToast('Error featuring business: ' + error.message, 'error');
  }
};

window.unfeatureBusiness = async (id) => {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Unfeature Business', 'Remove this business from the homepage featured section?', 'Unfeature', 'warning')
    : confirm('Remove this business from homepage featured section?');
  if (!confirmed) return;
  
  try {
    await updateDoc(doc(db, "business_listings_public", id), {
      is_featured: false
    });
    window.showToast('Business removed from featured section!', 'success');
    await loadBusinesses();
  } catch (error) {
    console.error('Error unfeaturing business:', error);
    window.showToast('Error unfeaturing business: ' + error.message, 'error');
  }
};

window.grantPro = async (id) => {
  const business = allBusinesses.find(b => b.id === id);
  if (!business) return;
  
  const duration = await window.showOptionsDialog(
    'Grant Pro Status',
    `Grant promotional Pro status to "${business.business_name}"`,
    [
      { value: '1-year', label: '1 Year', description: 'Pro status expires after 12 months' },
      { value: 'lifetime', label: 'Lifetime', description: 'Pro status never expires' }
    ],
    'Grant Pro',
    'success'
  );
  
  if (!duration) return;
  
  const isLifetime = duration === 'lifetime';
  const now = new Date();
  const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  
  try {
    const updateData = {
      pro_status: "pro",
      pro_start_date: now,
      pro_end_date: isLifetime ? null : oneYearFromNow,
      promotional_grant: true,
      promotional_type: isLifetime ? "lifetime" : "1-year"
    };
    
    await updateDoc(doc(db, "business_listings_public", id), updateData);
    window.showToast(`Pro status granted to ${business.business_name}! (${isLifetime ? 'Lifetime' : '1 Year'})`, 'success');
    await loadBusinesses();
  } catch (error) {
    console.error('Error granting Pro status:', error);
    window.showToast('Error granting Pro status: ' + error.message, 'error');
  }
};

window.revokePro = async (id) => {
  const business = allBusinesses.find(b => b.id === id);
  if (!business) return;
  
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog('Revoke Pro Status', `Remove Pro status from ${business.business_name}? This will downgrade them to Free tier.`, 'Revoke Pro', 'warning')
    : confirm(`Remove Pro status from ${business.business_name}?\n\nThis will downgrade them to Free tier.`);
  if (!confirmed) return;
  
  try {
    await updateDoc(doc(db, "business_listings_public", id), {
      pro_status: "free",
      pro_end_date: new Date()
    });
    window.showToast('Pro status revoked. Business downgraded to Free tier.', 'success');
    await loadBusinesses();
  } catch (error) {
    console.error('Error revoking Pro status:', error);
    window.showToast('Error revoking Pro status: ' + error.message, 'error');
  }
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

onReady(initBusinessesAdmin);

// Helper to show error messages gracefully
function showError(message) {
  if (window.showToast) {
    window.showToast(message, 'error');
  } else {
    alert(message);
  }
}

console.log('✅ Business admin button handlers registered');

// Setup button click handlers after DOM is ready
function setupButtonHandlers() {
  const tbody = document.getElementById('businessTableBody');
  if (!tbody) {
    console.error('❌ businessTableBody not found');
    return;
  }
  
  tbody.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const action = button.dataset.action;
    const id = button.dataset.id;
    
    console.log('🔘 Button clicked:', action, id);
    
    const actionHandlers = {
      'approveBusiness': window.approveBusiness,
      'suspendBusiness': window.suspendBusiness,
      'activateBusiness': window.activateBusiness,
      'deleteBusiness': window.deleteBusiness,
      'featureBusiness': window.featureBusiness,
      'unfeatureBusiness': window.unfeatureBusiness,
      'grantPro': window.grantPro,
      'revokePro': window.revokePro,
      'editBusiness': window.editBusiness
    };
    
    const handler = actionHandlers[action];
    
    if (!handler) {
      showError(`Action "${action}" is not available. Please refresh the page and try again.`);
      console.error(`❌ Action "${action}" not found. Available:`, Object.keys(actionHandlers).filter(k => actionHandlers[k]));
      return;
    }
    
    try {
      await handler(id);
    } catch (error) {
      console.error(`❌ Error executing ${action}:`, error);
      showError(`Error: ${error.message || 'Something went wrong. Please try again.'}`);
    }
  });
  
  console.log('✅ Button handlers attached to table body');
}

// Run setup after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupButtonHandlers);
} else {
  setupButtonHandlers();
}
