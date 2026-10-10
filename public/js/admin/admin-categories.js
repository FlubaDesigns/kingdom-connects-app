import { db } from '../firebase-config.js';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import '../components.js';
import { sendTemplate } from '../email/email-service.js';
import { requireAdmin } from '../auth/access-control.js';

let categories = [];
let allSuggestions = [];
let currentSuggFilter = 'pending';
let currentUser = null;
let searchTerm = '';
let pendingApprovalSuggestion = null;

requireAdmin(async (userContext, firebaseUser) => {
  currentUser = firebaseUser;
  await loadCategories();
  await loadSuggestions();
});

async function loadCategories() {
  try {
    const snapshot = await getDocs(collection(db, 'categories'));
    categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    categories.sort((a, b) => a.display_order - b.display_order);
    
    renderCategories();
    updateStats();
  } catch (error) {
    console.error('Error loading categories:', error);
    document.getElementById('categoryGrid').innerHTML = '<p class="error">Error loading categories</p>';
  }
}

function renderCategories() {
  const grid = document.getElementById('categoryGrid');
  const allParents = categories.filter(c => !c.parent_slug);
  const search = searchTerm.toLowerCase().trim();
  
  let filteredResults = [];
  
  if (!search) {
    filteredResults = allParents.map(parent => ({
      parent,
      subs: categories.filter(c => c.parent_slug === parent.slug)
    }));
  } else {
    allParents.forEach(parent => {
      const parentMatches = parent.label.toLowerCase().includes(search);
      const allSubs = categories.filter(c => c.parent_slug === parent.slug);
      const matchingSubs = allSubs.filter(sub => sub.label.toLowerCase().includes(search));
      
      if (parentMatches) {
        filteredResults.push({ parent, subs: allSubs });
      } else if (matchingSubs.length > 0) {
        filteredResults.push({ parent, subs: matchingSubs });
      }
    });
  }
  
  if (filteredResults.length === 0) {
    if (search) {
      grid.innerHTML = `<p class="opacity-70">No categories match "${escapeHtml(search)}". Try a different search.</p>`;
    } else {
      grid.innerHTML = '<p class="opacity-70">No categories yet. Add your first parent category above.</p>';
    }
    return;
  }

  grid.innerHTML = filteredResults.map(({ parent, subs }) => {
    return `
      <div class="parent-category">
        <div class="parent-header">
          <h3 class="parent-title">${escapeHtml(parent.label)}</h3>
          <div class="parent-actions">
            <button class="btn btn-small btn-success" data-action="addSub" data-parent-slug="${parent.slug}" data-parent-name="${escapeHtml(parent.label)}">
              + Add Subcategory
            </button>
            <button class="btn btn-small btn-secondary" data-action="editParent" data-id="${parent.id}">
              Edit
            </button>
            <button class="btn btn-small btn-danger" data-action="deleteParent" data-id="${parent.id}" data-label="${escapeHtml(parent.label)}">
              Delete
            </button>
          </div>
        </div>
        <p class="parent-description">${escapeHtml(parent.description || '')}</p>
        <div class="subcategories">
          ${subs.length > 0 ? subs.map(sub => `
            <div class="subcategory-item">
              <span class="subcategory-name">- ${escapeHtml(sub.label)}</span>
              <div class="subcategory-actions">
                <button class="btn btn-small btn-secondary" data-action="editSub" data-id="${sub.id}">Edit</button>
                <button class="btn btn-small btn-danger" data-action="deleteSub" data-id="${sub.id}" data-label="${escapeHtml(sub.label)}">Delete</button>
              </div>
            </div>
          `).join('') : '<p class="no-subs">No subcategories yet</p>'}
        </div>
      </div>
    `;
  }).join('');
  
  grid.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleButtonClick);
  });
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateStats() {
  const parents = categories.filter(c => !c.parent_slug);
  const subs = categories.filter(c => c.parent_slug);
  
  document.getElementById('parentCount').textContent = parents.length;
  document.getElementById('subCount').textContent = subs.length;
  document.getElementById('totalCount').textContent = categories.length;
}

async function loadSuggestions() {
  try {
    const q = query(collection(db, "category_suggestions"), orderBy("created_at", "desc"));
    const snapshot = await getDocs(q);
    
    allSuggestions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    updateSuggestionStats();
    renderSuggestions();
  } catch (error) {
    console.error('Error loading suggestions:', error);
    document.getElementById('suggestionsContainer').innerHTML = 
      '<p class="error-text text-center">Error loading suggestions. Please refresh the page.</p>';
  }
}

function updateSuggestionStats() {
  const pending = allSuggestions.filter(s => s.status === 'pending').length;
  const approved = allSuggestions.filter(s => s.status === 'approved').length;
  const rejected = allSuggestions.filter(s => s.status === 'rejected' || s.status === 'denied').length;
  
  document.getElementById('suggPendingCount').textContent = pending;
  document.getElementById('suggApprovedCount').textContent = approved;
  document.getElementById('suggRejectedCount').textContent = rejected;
  document.getElementById('suggTotalCount').textContent = allSuggestions.length;
  
  const badge = document.getElementById('pendingSuggestionsBadge');
  if (pending > 0) {
    badge.textContent = pending;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderSuggestions() {
  let filtered = allSuggestions;
  
  if (currentSuggFilter !== 'all') {
    if (currentSuggFilter === 'rejected') {
      filtered = allSuggestions.filter(s => s.status === 'rejected' || s.status === 'denied');
    } else {
      filtered = allSuggestions.filter(s => s.status === currentSuggFilter);
    }
  }

  const container = document.getElementById('suggestionsContainer');
  container.innerHTML = '';
  
  if (filtered.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    const p = document.createElement('p');
    p.textContent = `No ${currentSuggFilter === 'all' ? '' : currentSuggFilter} suggestions found.`;
    emptyDiv.appendChild(p);
    container.appendChild(emptyDiv);
    return;
  }

  filtered.forEach(suggestion => {
    const card = document.createElement('div');
    card.className = `suggestion-card ${suggestion.status}`;

    const header = document.createElement('div');
    header.className = 'suggestion-header';
    
    const title = document.createElement('h3');
    title.className = 'suggestion-title';
    title.textContent = suggestion.suggested_label || 'Untitled';
    
    const badge = document.createElement('span');
    badge.className = `status-badge badge-${suggestion.status}`;
    badge.textContent = suggestion.status;
    
    header.appendChild(title);
    header.appendChild(badge);
    card.appendChild(header);

    const description = document.createElement('div');
    description.className = 'suggestion-description';
    description.textContent = suggestion.description || '';
    card.appendChild(description);

    const meta = document.createElement('div');
    meta.className = 'suggestion-meta';
    const createdDate = suggestion.created_at ? 
      new Date(suggestion.created_at.toDate()).toLocaleDateString() : 'Unknown';
    const reviewedDate = suggestion.reviewed_at ? 
      new Date(suggestion.reviewed_at.toDate()).toLocaleDateString() : null;
    
    const span1 = document.createElement('span');
    span1.textContent = `Submitted: ${createdDate}`;
    meta.appendChild(span1);
    
    if (reviewedDate) {
      const span2 = document.createElement('span');
      span2.textContent = `Reviewed: ${reviewedDate}`;
      meta.appendChild(span2);
    }
    
    const span3 = document.createElement('span');
    span3.textContent = `Suggested by: ${suggestion.business_name || suggestion.suggested_by_email || 'Unknown'}`;
    meta.appendChild(span3);
    
    if (suggestion.suggestion_type) {
      const span4 = document.createElement('span');
      const typeLabel = suggestion.suggestion_type === 'subcategory' ? 'Subcategory' : 'Primary Category';
      const parentInfo = suggestion.parent_slug ? ` of "${suggestion.parent_slug}"` : '';
      span4.textContent = `Type: ${typeLabel}${parentInfo}`;
      span4.className = 'gold';
      meta.appendChild(span4);
    }
    
    card.appendChild(meta);

    if (suggestion.admin_feedback) {
      const feedbackBox = document.createElement('div');
      feedbackBox.className = 'admin-feedback-box';
      const strong = document.createElement('strong');
      strong.textContent = 'Admin Feedback:';
      feedbackBox.appendChild(strong);
      feedbackBox.appendChild(document.createElement('br'));
      const feedbackText = document.createTextNode(suggestion.admin_feedback);
      feedbackBox.appendChild(feedbackText);
      card.appendChild(feedbackBox);
    }

    if (suggestion.status === 'pending') {
      const actions = document.createElement('div');
      actions.className = 'suggestion-actions';
      
      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn btn-gold';
      approveBtn.textContent = 'Approve';
      approveBtn.dataset.suggestionId = suggestion.id;
      approveBtn.dataset.suggestedLabel = suggestion.suggested_label;
      approveBtn.addEventListener('click', () => openApproveModal(suggestion.id, suggestion.suggested_label));
      
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn btn-secondary';
      rejectBtn.textContent = 'Reject';
      rejectBtn.dataset.suggestionId = suggestion.id;
      rejectBtn.addEventListener('click', () => toggleFeedbackForm(suggestion.id));
      
      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
      card.appendChild(actions);

      const feedbackForm = document.createElement('div');
      feedbackForm.id = `feedback-form-${suggestion.id}`;
      feedbackForm.className = 'feedback-form';
      
      const label = document.createElement('label');
      label.textContent = 'Reason for rejection (optional):';
      
      const textarea = document.createElement('textarea');
      textarea.id = `feedback-text-${suggestion.id}`;
      textarea.className = 'kc-textarea';
      textarea.rows = 3;
      textarea.placeholder = 'Explain why this category was rejected...';
      
      const btnContainer = document.createElement('div');
      btnContainer.className = 'flex-gap mt-sm';
      
      const submitBtn = document.createElement('button');
      submitBtn.className = 'btn btn-gold';
      submitBtn.textContent = 'Submit Rejection';
      submitBtn.addEventListener('click', () => rejectCategory(suggestion.id));
      
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => toggleFeedbackForm(suggestion.id));
      
      btnContainer.appendChild(submitBtn);
      btnContainer.appendChild(cancelBtn);
      
      feedbackForm.appendChild(label);
      feedbackForm.appendChild(textarea);
      feedbackForm.appendChild(btnContainer);
      card.appendChild(feedbackForm);
    }

    container.appendChild(card);
  });
}

function toggleFeedbackForm(suggestionId) {
  const form = document.getElementById(`feedback-form-${suggestionId}`);
  if (form) {
    form.classList.toggle('active');
  }
}

function openApproveModal(suggestionId, suggestedLabel) {
  const suggestion = allSuggestions.find(s => s.id === suggestionId);
  if (!suggestion) return;
  
  pendingApprovalSuggestion = suggestion;
  
  document.getElementById('approveSuggestionId').value = suggestionId;
  document.getElementById('approveCategoryName').value = suggestedLabel;
  document.getElementById('approveDescription').value = suggestion.description || '';
  
  const isSubcategory = suggestion.suggestion_type === 'subcategory';
  document.getElementById('approveCategoryType').value = isSubcategory ? 'subcategory' : 'parent';
  
  populateParentSelect();
  
  const parentGroup = document.getElementById('parentSelectGroup');
  if (isSubcategory) {
    parentGroup.classList.remove('hidden');
    if (suggestion.parent_slug) {
      document.getElementById('approveParentSlug').value = suggestion.parent_slug;
    }
  } else {
    parentGroup.classList.add('hidden');
  }
  
  document.getElementById('approveModal').classList.add('show');
}

function populateParentSelect() {
  const select = document.getElementById('approveParentSlug');
  const parents = categories.filter(c => !c.parent_slug);
  
  select.innerHTML = '<option value="">-- Select Parent --</option>' +
    parents.map(p => `<option value="${p.slug}">${escapeHtml(p.label)}</option>`).join('');
}

window.closeApproveModal = () => {
  document.getElementById('approveModal').classList.remove('show');
  pendingApprovalSuggestion = null;
};

async function submitApproval(e) {
  e.preventDefault();
  
  const suggestionId = document.getElementById('approveSuggestionId').value;
  const categoryName = document.getElementById('approveCategoryName').value.trim();
  const categoryType = document.getElementById('approveCategoryType').value;
  const parentSlug = document.getElementById('approveParentSlug').value;
  const description = document.getElementById('approveDescription').value.trim();
  
  if (!categoryName) {
    window.showToast('Category name is required', 'error');
    return;
  }
  
  if (categoryType === 'subcategory' && !parentSlug) {
    window.showToast('Please select a parent category', 'error');
    return;
  }
  
  try {
    const slug = categoryName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    const suggestionDoc = await getDoc(doc(db, "category_suggestions", suggestionId));
    const suggestionData = suggestionDoc.data();
    
    const categoryData = {
      label: categoryName,
      slug: slug,
      description: description,
      active: true,
      display_order: 999,
      created_at: serverTimestamp(),
      created_by: 'admin',
      created_from_suggestion: suggestionId
    };
    
    if (categoryType === 'subcategory') {
      categoryData.parent_slug = parentSlug;
    }

    await addDoc(collection(db, "categories"), categoryData);

    const wasModified = categoryName !== suggestionData.suggested_label || 
                        (categoryType === 'subcategory') !== (suggestionData.suggestion_type === 'subcategory') ||
                        (categoryType === 'subcategory' && parentSlug !== suggestionData.parent_slug);

    await updateDoc(doc(db, "category_suggestions", suggestionId), {
      status: 'approved',
      reviewed_at: serverTimestamp(),
      reviewed_by: currentUser.uid,
      linked_category_slug: slug,
      final_category_name: categoryName,
      final_category_type: categoryType,
      final_parent_slug: categoryType === 'subcategory' ? parentSlug : null,
      was_modified: wasModified
    });

    const userEmail = suggestionData.suggested_by_email;
    if (userEmail) {
      try {
        const originalType = suggestionData.suggestion_type === 'subcategory' ? 'subcategory' : 'category';
        const finalType = categoryType === 'subcategory' ? 'subcategory' : 'category';
        
        let parentName = '';
        if (categoryType === 'subcategory') {
          const parentCat = categories.find(c => c.slug === parentSlug);
          parentName = parentCat ? parentCat.label : parentSlug;
        }
        
        let changeDescription = '';
        if (wasModified) {
          if (categoryName !== suggestionData.suggested_label) {
            changeDescription += `The name was adjusted to "${categoryName}". `;
          }
          if (categoryType === 'subcategory' && originalType !== 'subcategory') {
            changeDescription += `It was added as a subcategory under "${parentName}". `;
          } else if (categoryType !== 'subcategory' && originalType === 'subcategory') {
            changeDescription += `It was added as a main category instead of a subcategory. `;
          } else if (categoryType === 'subcategory' && parentSlug !== suggestionData.parent_slug) {
            changeDescription += `It was placed under "${parentName}". `;
          }
        }
        
        await sendTemplate('category_suggestion_approved', userEmail, {
          category_name: categoryName,
          category_type: finalType,
          business_name: suggestionData.business_name || 'Your Business',
          original_suggestion: suggestionData.suggested_label,
          was_modified: wasModified ? 'yes' : 'no',
          change_description: changeDescription || 'Your suggestion was approved as submitted.',
          parent_category: parentName,
          approval_date: new Date().toLocaleDateString()
        });
      } catch (emailError) {
        console.error('Email sending failed (non-fatal):', emailError);
      }
    }

    closeApproveModal();
    window.showToast('Category approved and added!', 'success');
    await loadCategories();
    await loadSuggestions();
  } catch (error) {
    console.error('Error approving category:', error);
    window.showToast('Error approving category. Please try again.', 'error');
  }
}

async function rejectCategory(suggestionId) {
  const feedbackText = document.getElementById(`feedback-text-${suggestionId}`).value.trim();

  try {
    const suggestionDoc = await getDoc(doc(db, "category_suggestions", suggestionId));
    const suggestionData = suggestionDoc.data();

    await updateDoc(doc(db, "category_suggestions", suggestionId), {
      status: 'rejected',
      reviewed_at: serverTimestamp(),
      reviewed_by: currentUser.uid,
      admin_feedback: feedbackText || 'No feedback provided'
    });

    const userEmail = suggestionData.suggested_by_email;
    if (userEmail) {
      try {
        const typeLabel = suggestionData.suggestion_type === 'subcategory' ? 'subcategory' : 'category';
        await sendTemplate('category_suggestion_rejected', userEmail, {
          category_name: suggestionData.suggested_label,
          category_type: typeLabel,
          business_name: suggestionData.business_name || 'Your Business',
          admin_feedback: feedbackText || 'After review, we determined this category does not fit our current structure.'
        });
      } catch (emailError) {
        console.error('Email sending failed (non-fatal):', emailError);
      }
    }

    window.showToast('Category suggestion rejected.', 'success');
    await loadSuggestions();
  } catch (error) {
    console.error('Error rejecting category:', error);
    window.showToast('Error rejecting category. Please try again.', 'error');
  }
}

window.openEditParentModal = (id) => {
  const category = categories.find(c => c.id === id);
  if (!category) return;
  
  document.getElementById('editParentId').value = category.id;
  document.getElementById('editParentLabel').value = category.label;
  document.getElementById('editParentSlug').value = category.slug;
  document.getElementById('editParentDescription').value = category.description || '';
  document.getElementById('editParentOrder').value = category.display_order || 1;
  
  document.getElementById('editParentModal').classList.add('show');
};

window.closeEditParentModal = () => {
  document.getElementById('editParentModal').classList.remove('show');
};

window.openAddParentModal = () => {
  document.getElementById('addParentForm').reset();
  document.getElementById('addParentModal').classList.add('show');
};

window.closeAddParentModal = () => {
  document.getElementById('addParentModal').classList.remove('show');
};

window.openEditSubModal = (id) => {
  const category = categories.find(c => c.id === id);
  if (!category) return;
  
  document.getElementById('editSubId').value = category.id;
  document.getElementById('editSubLabel').value = category.label;
  document.getElementById('editSubSlug').value = category.slug;
  document.getElementById('editSubDescription').value = category.description || '';
  document.getElementById('editSubOrder').value = category.display_order || 1;
  document.getElementById('editSubParentSlug').value = category.parent_slug;
  
  document.getElementById('editSubModal').classList.add('show');
};

window.closeEditSubModal = () => {
  document.getElementById('editSubModal').classList.remove('show');
};

window.openAddSubModal = (parentSlug, parentName) => {
  document.getElementById('addSubForm').reset();
  document.getElementById('addSubParentSlug').value = parentSlug;
  document.getElementById('addSubParentName').value = parentName;
  document.getElementById('addSubModal').classList.add('show');
};

window.closeAddSubModal = () => {
  document.getElementById('addSubModal').classList.remove('show');
};

window.editParent = (id) => openEditParentModal(id);
window.editSub = (id) => openEditSubModal(id);

window.deleteParent = async (id, label) => {
  const category = categories.find(c => c.id === id);
  const subs = categories.filter(c => c.parent_slug === category.slug);
  
  const confirmMsg = subs.length > 0
    ? `Delete "${label}" and all ${subs.length} subcategories? This cannot be undone.`
    : `Delete "${label}"? This cannot be undone.`;
  
  const confirmed = await window.showConfirmDialog('Delete Category', confirmMsg, 'Delete', 'danger');
  if (!confirmed) return;
  
  try {
    for (const sub of subs) {
      await deleteDoc(doc(db, 'categories', sub.id));
    }
    
    await deleteDoc(doc(db, 'categories', id));
    window.showToast('Category deleted!', 'success');
    loadCategories();
  } catch (error) {
    console.error('Error deleting category:', error);
    window.showToast('Error deleting category', 'error');
  }
};

window.deleteSub = async (id, label) => {
  const confirmed = await window.showConfirmDialog('Delete Subcategory', `Delete "${label}"? This cannot be undone.`, 'Delete', 'danger');
  if (!confirmed) return;
  
  try {
    await deleteDoc(doc(db, 'categories', id));
    window.showToast('Subcategory deleted!', 'success');
    loadCategories();
  } catch (error) {
    console.error('Error deleting subcategory:', error);
    window.showToast('Error deleting subcategory', 'error');
  }
};

document.getElementById('editParentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('editParentId').value;
  const data = {
    label: document.getElementById('editParentLabel').value,
    slug: document.getElementById('editParentSlug').value,
    description: document.getElementById('editParentDescription').value,
    display_order: parseInt(document.getElementById('editParentOrder').value),
    updated_at: serverTimestamp()
  };
  
  try {
    await updateDoc(doc(db, 'categories', id), data);
    window.showToast('Category updated!', 'success');
    closeEditParentModal();
    loadCategories();
  } catch (error) {
    console.error('Error updating category:', error);
    window.showToast('Error updating category', 'error');
  }
});

document.getElementById('addParentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const data = {
    label: document.getElementById('newParentLabel').value,
    slug: document.getElementById('newParentSlug').value,
    description: document.getElementById('newParentDescription').value,
    display_order: parseInt(document.getElementById('newParentOrder').value),
    parent_slug: null,
    active: true,
    created_at: serverTimestamp(),
    type: 'general'
  };
  
  try {
    await addDoc(collection(db, 'categories'), data);
    window.showToast('Parent category added!', 'success');
    closeAddParentModal();
    loadCategories();
  } catch (error) {
    console.error('Error adding category:', error);
    window.showToast('Error adding category', 'error');
  }
});

document.getElementById('editSubForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = document.getElementById('editSubId').value;
  const data = {
    label: document.getElementById('editSubLabel').value,
    slug: document.getElementById('editSubSlug').value,
    description: document.getElementById('editSubDescription').value,
    display_order: parseInt(document.getElementById('editSubOrder').value),
    parent_slug: document.getElementById('editSubParentSlug').value,
    updated_at: serverTimestamp()
  };
  
  try {
    await updateDoc(doc(db, 'categories', id), data);
    window.showToast('Subcategory updated!', 'success');
    closeEditSubModal();
    loadCategories();
  } catch (error) {
    console.error('Error updating subcategory:', error);
    window.showToast('Error updating subcategory', 'error');
  }
});

document.getElementById('addSubForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const data = {
    label: document.getElementById('newSubLabel').value,
    slug: document.getElementById('newSubSlug').value,
    description: document.getElementById('newSubDescription').value,
    display_order: parseInt(document.getElementById('newSubOrder').value),
    parent_slug: document.getElementById('addSubParentSlug').value,
    active: true,
    created_at: serverTimestamp(),
    type: 'general'
  };
  
  try {
    await addDoc(collection(db, 'categories'), data);
    window.showToast('Subcategory added!', 'success');
    closeAddSubModal();
    loadCategories();
  } catch (error) {
    console.error('Error adding subcategory:', error);
    window.showToast('Error adding subcategory', 'error');
  }
});

function handleButtonClick(e) {
  const action = e.currentTarget.dataset.action;
  const id = e.currentTarget.dataset.id;
  const label = e.currentTarget.dataset.label;
  const parentSlug = e.currentTarget.dataset.parentSlug;
  const parentName = e.currentTarget.dataset.parentName;
  
  switch(action) {
    case 'editParent':
      openEditParentModal(id);
      break;
    case 'editSub':
      openEditSubModal(id);
      break;
    case 'deleteParent':
      deleteParent(id, label);
      break;
    case 'deleteSub':
      deleteSub(id, label);
      break;
    case 'addSub':
      openAddSubModal(parentSlug, parentName);
      break;
    case 'closeEditParentModal':
      closeEditParentModal();
      break;
    case 'closeAddParentModal':
      closeAddParentModal();
      break;
    case 'closeEditSubModal':
      closeEditSubModal();
      break;
    case 'closeAddSubModal':
      closeAddSubModal();
      break;
    case 'closeApproveModal':
      closeApproveModal();
      break;
  }
}

document.getElementById('addParentBtn').addEventListener('click', openAddParentModal);
document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', handleButtonClick);
});

document.querySelectorAll('.filter-tab[data-tab]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab[data-tab]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    const tabName = tab.dataset.tab;
    document.getElementById('categoriesTab').classList.toggle('hidden', tabName !== 'categories');
    document.getElementById('suggestionsTab').classList.toggle('hidden', tabName !== 'suggestions');
  });
});

document.querySelectorAll('.sugg-filter').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sugg-filter').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentSuggFilter = tab.dataset.filter;
    renderSuggestions();
  });
});

// Search functionality
const searchInput = document.getElementById('categorySearch');
const clearSearchBtn = document.getElementById('clearSearchBtn');

searchInput.addEventListener('input', (e) => {
  searchTerm = e.target.value;
  if (searchTerm) {
    clearSearchBtn.classList.remove('hidden');
  } else {
    clearSearchBtn.classList.add('hidden');
  }
  renderCategories();
});

clearSearchBtn.addEventListener('click', () => {
  searchTerm = '';
  searchInput.value = '';
  clearSearchBtn.classList.add('hidden');
  renderCategories();
});

// Category type dropdown - show/hide parent select
document.getElementById('approveCategoryType').addEventListener('change', (e) => {
  const parentGroup = document.getElementById('parentSelectGroup');
  if (e.target.value === 'subcategory') {
    parentGroup.classList.remove('hidden');
  } else {
    parentGroup.classList.add('hidden');
  }
});

// Approve form submission
document.getElementById('approveForm').addEventListener('submit', submitApproval);
