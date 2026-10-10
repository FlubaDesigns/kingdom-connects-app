import { changeHierarchy } from '../../js/services/hierarchy-service.js';
    import { db } from "../../js/firebase-config.js";
    import { onReady } from "../../js/dom-ready.js";
    import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, where, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
    import { sendTemplate } from "../../js/email/email-service.js";

    let allChurches = [];
    let allBusinesses = [];
    let currentSort = { field: 'church_name', asc: true };

    async function initChurchesAdmin() {
      await loadBusinesses();
      await loadChurches();
      setupFilters();
      setupSorting();
      
      const addBtn = document.getElementById('btnAddChurch');
      if (addBtn) {
        addBtn.addEventListener('click', () => {
          window.location.href = '/submit-church';
        });
      }
    }

    async function loadBusinesses() {
      try {
        const q = query(collection(db, "business_listings_public"));
        const querySnapshot = await getDocs(q);
        
        allBusinesses = [];
        querySnapshot.forEach((doc) => {
          allBusinesses.push({ id: doc.id, ...doc.data() });
        });
      } catch (error) {
        console.error("Error loading businesses:", error);
      }
    }

    async function loadChurches() {
      const loadingMessage = document.getElementById("loadingMessage");
      const contentArea = document.getElementById("contentArea");
      const emptyState = document.getElementById("emptyState");
      const errorMessage = document.getElementById("errorMessage");

      try {
        allChurches = [];
        const denominationFilter = document.getElementById('denominationFilter');
        const denominations = new Set();

        const churchesQuery = query(collection(db, "churches"));
        const churchesSnapshot = await getDocs(churchesQuery);
        
        churchesSnapshot.forEach((doc) => {
          const data = doc.data();
          
          allChurches.push({
            id: doc.id,
            ...data,
            submission_date: data.submission_date?.toDate ? data.submission_date.toDate().toISOString() : data.submission_date,
            created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : data.created_at
          });

          if (data.denomination) {
            denominations.add(data.denomination);
          }
        });

        if (allChurches.length === 0) {
          loadingMessage.classList.add('hidden');
          emptyState.classList.remove('hidden');
          return;
        }

        Array.from(denominations).sort().forEach(denom => {
          const option = document.createElement('option');
          option.value = denom;
          option.textContent = denom;
          denominationFilter.appendChild(option);
        });

        updateStats();
        renderChurches(allChurches);
        
        loadingMessage.classList.add('hidden');
        contentArea.classList.remove('hidden');

      } catch (error) {
        console.error("Firebase error:", error);
        loadingMessage.classList.add('hidden');
        errorMessage.classList.remove('hidden');
      }
    }

    function updateStats() {
      const total = allChurches.length;
      const active = allChurches.filter(c => c.listing_status === 'active').length;
      const pending = allChurches.filter(c => c.listing_status === 'pending').length;
      const businessesWithChurch = allBusinesses.filter(b => b.church_id && b.church_id.trim() !== '').length;

      document.getElementById('totalCount').textContent = total;
      document.getElementById('activeCount').textContent = active;
      document.getElementById('pendingCount').textContent = pending;
      document.getElementById('businessCount').textContent = businessesWithChurch;
    }

    function getBusinessCountForChurch(churchId) {
      return allBusinesses.filter(b => b.church_id === churchId).length;
    }

    function checkDuplicateEmail(church) {
      // Support legacy field names for reading (contact_email) but write to canonical (email)
      const email = church.email || church.contact_email;
      if (!email) return null;
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Find other churches with same email (excluding self)
      const duplicates = allChurches.filter(c => {
        const otherEmail = c.email || c.contact_email;
        return c.id !== church.id && 
               otherEmail && 
               otherEmail.toLowerCase().trim() === normalizedEmail;
      });
      
      if (duplicates.length === 0) return null;
      
      // Check if duplicate is already approved
      const approvedDuplicate = duplicates.find(c => c.listing_status === 'active');
      if (approvedDuplicate) {
        return {
          type: 'error',
          message: `⚠️ DUPLICATE: Email already used by "${approvedDuplicate.church_name}"`
        };
      }
      
      // Duplicate is also pending
      return {
        type: 'warning',
        message: `⚠️ Possible duplicate: ${duplicates.length} other submission(s) with same email`
      };
    }

    function renderChurches(churches) {
      const tbody = document.getElementById("churchTableBody");
      tbody.innerHTML = "";

      if (churches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-md">No churches match your filters.</td></tr>`;
        return;
      }

      churches.forEach((church) => {
        const row = document.createElement("tr");
        row.className = "church-row";
        
        const statusClass = `status-${church.listing_status || 'pending'}`;
        const submittedDate = church.submission_date ? new Date(church.submission_date).toLocaleDateString() : 'Unknown';
        const businessCount = getBusinessCountForChurch(church.id);
        
        // Check for duplicate email
        const duplicateCheck = checkDuplicateEmail(church);
        const duplicateWarning = duplicateCheck 
          ? `<div class="alert-compact alert-compact-${duplicateCheck.type}">${duplicateCheck.message}</div>`
          : '';

        row.innerHTML = `
          <td data-label="Church"><strong>${escapeHtml(church.church_name || 'Unnamed')}</strong></td>
          <td data-label="Denomination">${escapeHtml(church.denomination || 'N/A')}</td>
          <td data-label="Location">${escapeHtml(church.city || 'N/A')}, ${escapeHtml(church.state || 'N/A')}</td>
          <td data-label="ZIP">${escapeHtml(church.zip_code || 'N/A')}</td>
          <td data-label="Contact">
            <div class="cell-content-stack">
              <small>${escapeHtml(church.email || church.contact_email || 'N/A')}<br/>
              ${escapeHtml(church.phone || church.contact_phone || 'N/A')}</small>
              ${duplicateWarning}
            </div>
          </td>
          <td data-label="Website"><small>${church.website ? '<a href="' + escapeHtml(church.website) + '" target="_blank">View</a>' : 'N/A'}</small></td>
          <td data-label="Status" class="${statusClass}">${(church.listing_status || 'pending').toUpperCase()}</td>
          <td data-label="Submitted"><small>${submittedDate}</small></td>
          <td data-label="Businesses">${businessCount}</td>
          <td data-label="Actions">
            <div class="action-buttons">
              ${church.listing_status === 'pending' ? 
                `<button class="btn btn-small btn-success" data-action="approveChurch" data-id="${church.id}">Approve</button>` : 
                ''}
              ${church.listing_status === 'active' ? 
                `<button class="btn btn-small btn-warning" data-action="suspendChurch" data-id="${church.id}">Suspend</button>` : 
                ''}
              ${church.listing_status === 'suspended' ? 
                `<button class="btn btn-small btn-success" data-action="activateChurch" data-id="${church.id}">Activate</button>` : 
                ''}
              ${businessCount > 0 ? 
                `<button class="btn btn-small btn-gold" data-action="grantChurchPro" data-id="${church.id}" title="Grant Pro status to all ${businessCount} businesses affiliated with this church">Bulk Pro (${businessCount})</button>` : 
                ''}
              <button class="btn btn-small btn-secondary" data-action="editChurch" data-id="${church.id}">Edit</button>
              <button class="btn btn-small btn-danger" data-action="deleteChurch" data-id="${church.id}">Delete</button>
            </div>
          </td>
        `;
        
        tbody.appendChild(row);
      });
    }

    function setupFilters() {
      const searchInput = document.getElementById('searchInput');
      const statusFilter = document.getElementById('statusFilter');
      const denominationFilter = document.getElementById('denominationFilter');
      const sortFilter = document.getElementById('sortFilter');
      const clearButton = document.getElementById('clearFilters');

      const applyFilters = () => {
        let filtered = [...allChurches];

        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
          filtered = filtered.filter(c => 
            (c.church_name || '').toLowerCase().includes(searchTerm) ||
            (c.city || '').toLowerCase().includes(searchTerm) ||
            (c.denomination || '').toLowerCase().includes(searchTerm)
          );
        }

        const status = statusFilter.value;
        if (status) {
          filtered = filtered.filter(c => c.listing_status === status);
        }

        const denomination = denominationFilter.value;
        if (denomination) {
          filtered = filtered.filter(c => c.denomination === denomination);
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

        renderChurches(filtered);
      };

      searchInput.addEventListener('input', applyFilters);
      statusFilter.addEventListener('change', applyFilters);
      denominationFilter.addEventListener('change', applyFilters);
      sortFilter.addEventListener('change', applyFilters);
      
      clearButton.addEventListener('click', () => {
        searchInput.value = '';
        statusFilter.value = '';
        denominationFilter.value = '';
        sortFilter.value = '';
        renderChurches(allChurches);
      });
    }

    function setupSorting() {
      const headers = document.querySelectorAll('.church-table th[data-sort]');
      const searchInput = document.getElementById('searchInput');
      const statusFilter = document.getElementById('statusFilter');
      const denominationFilter = document.getElementById('denominationFilter');
      
      headers.forEach(header => {
        header.addEventListener('click', () => {
          const field = header.getAttribute('data-sort');
          
          if (currentSort.field === field) {
            currentSort.asc = !currentSort.asc;
          } else {
            currentSort.field = field;
            currentSort.asc = true;
          }

          let filtered = [...allChurches];

          const searchTerm = searchInput.value.toLowerCase();
          if (searchTerm) {
            filtered = filtered.filter(c => 
              (c.church_name || '').toLowerCase().includes(searchTerm) ||
              (c.city || '').toLowerCase().includes(searchTerm) ||
              (c.denomination || '').toLowerCase().includes(searchTerm)
            );
          }

          const status = statusFilter.value;
          if (status) {
            filtered = filtered.filter(c => c.listing_status === status);
          }

          const denomination = denominationFilter.value;
          if (denomination) {
            filtered = filtered.filter(c => c.denomination === denomination);
          }

          const sorted = filtered.sort((a, b) => {
            let aVal = a[field] || '';
            let bVal = b[field] || '';

            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();

            if (aVal < bVal) return currentSort.asc ? -1 : 1;
            if (aVal > bVal) return currentSort.asc ? 1 : -1;
            return 0;
          });

          renderChurches(sorted);
        });
      });
    }

    window.approveChurch = async (id) => {
      const confirmed = window.showConfirmDialog 
        ? await window.showConfirmDialog('Approve Church', 'Approve this church listing?', 'Approve', 'success')
        : confirm('Approve this church listing?');
      if (!confirmed) return;
      
      try {
        const church = allChurches.find(c => c.id === id);
        if (!church) {
          window.showToast('Church not found', 'error');
          return;
        }
        
        const churchDoc = await getDoc(doc(db, "churches", id));
        if (!churchDoc.exists()) {
          window.showToast('Church not found', 'error');
          return;
        }
        
        const churchData = churchDoc.data();
        const contactEmail = churchData.contact_email || churchData.email;
        
        await changeHierarchy('setChurchStatus', { churchId: id, status: 'active' });
        
        if (contactEmail) {
          try {
            const dashboardDomain = window.location.protocol + '//' + window.location.hostname + 
              (window.location.port && !window.location.hostname.includes('firebase') ? ':' + window.location.port : '');
            
            const recipientName = churchData.representative_name || churchData.nominator_name || 'there';
            
            await sendTemplate('church_approved', contactEmail, {
              recipient_name: recipientName,
              church_name: churchData.church_name || 'Your Church',
              dashboard_url: `${dashboardDomain}/church-admin/dashboard.html`,
              approval_date: new Date().toLocaleDateString()
            });
            console.log('Approval email sent to:', contactEmail);
          } catch (emailError) {
            console.error('Error sending approval email:', emailError);
          }
        }
        
        window.showToast('Church approved! Approval email sent.', 'success');
        await loadChurches();
      } catch (error) {
        console.error('Error approving church:', error);
        window.showToast('Error approving church: ' + error.message, 'error');
      }
    };

    window.suspendChurch = async (id) => {
      const confirmed = window.showConfirmDialog 
        ? await window.showConfirmDialog('Suspend Church', 'Suspend this church listing?', 'Suspend', 'warning')
        : confirm('Suspend this church listing?');
      if (!confirmed) return;
      
      try {
        await changeHierarchy('setChurchStatus', { churchId: id, status: 'suspended' });
        window.showToast('Church suspended!', 'success');
        await loadChurches();
      } catch (error) {
        console.error('Error suspending church:', error);
        window.showToast('Error suspending church: ' + error.message, 'error');
      }
    };

    window.activateChurch = async (id) => {
      const confirmed = window.showConfirmDialog 
        ? await window.showConfirmDialog('Activate Church', 'Reactivate this church listing?', 'Activate', 'success')
        : confirm('Reactivate this church listing?');
      if (!confirmed) return;
      
      try {
        await changeHierarchy('setChurchStatus', { churchId: id, status: 'active' });
        window.showToast('Church activated!', 'success');
        await loadChurches();
      } catch (error) {
        console.error('Error activating church:', error);
        window.showToast('Error activating church: ' + error.message, 'error');
      }
    };

    window.editChurch = (id) => {
      window.location.href = `edit_church?id=${id}`;
    };

    window.deleteChurch = async (id) => {
      const businessCount = getBusinessCountForChurch(id);
      
      let confirmed;
      if (businessCount > 0) {
        confirmed = window.showConfirmDialog 
          ? await window.showConfirmDialog('Delete Church', `This church has ${businessCount} associated business(es). If you delete this church, those businesses will lose their church association. Delete permanently?`, 'Delete Forever', 'danger')
          : confirm(`⚠️ WARNING: This church has ${businessCount} associated business(es). If you delete this church, those businesses will lose their church association.\n\nAre you sure you want to DELETE this church permanently?`);
      } else {
        confirmed = window.showConfirmDialog 
          ? await window.showConfirmDialog('Delete Church', 'DELETE this church permanently? This cannot be undone.', 'Delete Forever', 'danger')
          : confirm('⚠️ DELETE this church permanently? This cannot be undone.');
      }
      if (!confirmed) return;
      
      try {
        await deleteDoc(doc(db, "churches", id));
        window.showToast('Church deleted!', 'success');
        await loadChurches();
      } catch (error) {
        console.error('Error deleting church:', error);
        window.showToast('Error deleting church: ' + error.message, 'error');
      }
    };

    window.grantChurchPro = async (id) => {
      const church = allChurches.find(c => c.id === id);
      if (!church) return;
      
      const churchBusinesses = allBusinesses.filter(b => b.church_id === id);
      const businessCount = churchBusinesses.length;
      
      if (businessCount === 0) {
        window.showToast('This church has no associated businesses.', 'error');
        return;
      }
      
      const duration = await window.showOptionsDialog(
        'Grant Church Pro',
        `Grant Pro status to ALL ${businessCount} businesses affiliated with "${church.church_name}"`,
        [
          { value: '1-year', label: '1 Year', description: 'Pro status expires after 12 months' },
          { value: 'lifetime', label: 'Lifetime', description: 'Pro status never expires' }
        ],
        'Grant Pro to All',
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
          promotional_type: isLifetime ? "lifetime" : "1-year",
          church_promotion: true
        };
        
        let successCount = 0;
        let failCount = 0;
        
        for (const business of churchBusinesses) {
          try {
            await updateDoc(doc(db, "business_listings_public", business.id), updateData);
            successCount++;
          } catch (error) {
            console.error(`Error granting Pro to ${business.business_name}:`, error);
            failCount++;
          }
        }
        
        window.showToast(`Church Pro granted! ${successCount} businesses upgraded.`, 'success');
        
        await loadChurches();
      } catch (error) {
        console.error('Error granting church Pro status:', error);
        window.showToast('Error granting church Pro status: ' + error.message, 'error');
      }
    };

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    onReady(initChurchesAdmin);

// Helper to show error messages gracefully
function showError(message) {
  if (window.showToast) {
    window.showToast(message, 'error');
  } else {
    alert(message);
  }
}

console.log('✅ Church admin button handlers registered');

// Setup button click handlers after DOM is ready
function setupChurchButtonHandlers() {
  const tbody = document.getElementById('churchTableBody');
  if (!tbody) {
    console.error('❌ churchTableBody not found');
    return;
  }
  
  tbody.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const action = button.dataset.action;
    const id = button.dataset.id;
    
    console.log('🔘 Church button clicked:', action, id);
    
    const actionHandlers = {
      'approveChurch': window.approveChurch,
      'suspendChurch': window.suspendChurch,
      'activateChurch': window.activateChurch,
      'grantChurchPro': window.grantChurchPro,
      'deleteChurch': window.deleteChurch,
      'editChurch': window.editChurch
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
  
  console.log('✅ Church button handlers attached to table body');
}

// Run setup after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupChurchButtonHandlers);
} else {
  setupChurchButtonHandlers();
}
