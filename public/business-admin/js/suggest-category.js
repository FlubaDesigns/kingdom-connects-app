import { db } from "../../js/firebase-config.js";
import { collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";

let currentUser = null;
let currentBusiness = null;
let parentCategories = [];

function createSlug(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function loadUserBusiness(businesses) {
  if (businesses) {
    for (const biz of businesses) {
      if (biz.listing_status === 'active') {
        currentBusiness = biz;
        break;
      }
    }
  }
}

async function loadCategories() {
  try {
    const q = query(collection(db, "categories"), where("active", "==", true), orderBy("display_order"));
    const snapshot = await getDocs(q);
    
    parentCategories = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.parent_slug) {
        parentCategories.push({
          slug: data.slug,
          label: data.label
        });
      }
    });

    const parentSelect = document.getElementById('parentCategory');
    if (parentSelect) {
      parentCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.slug;
        option.textContent = cat.label;
        parentSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

function setupForm() {
  const typeSelect = document.getElementById('suggestionType');
  const parentGroup = document.getElementById('parentCategoryGroup');
  const parentSelect = document.getElementById('parentCategory');

  if (typeSelect && parentGroup) {
    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === 'subcategory') {
        parentGroup.classList.remove('hidden');
        if (parentSelect) parentSelect.required = true;
      } else {
        parentGroup.classList.add('hidden');
        if (parentSelect) parentSelect.required = false;
      }
    });
  }
}

async function loadSuggestions(userId) {
  try {
    const q = query(
      collection(db, 'category_suggestions'),
      where('suggested_by_user_id', '==', userId)
    );
    const snapshot = await getDocs(q);
    
    const suggestionsContainer = document.getElementById('suggestionsList');
    
    if (snapshot.empty) {
      suggestionsContainer.innerHTML = '<p class="opacity-60">You haven\'t submitted any category suggestions yet.</p>';
      return;
    }

    suggestionsContainer.innerHTML = snapshot.docs.map(doc => {
      const data = doc.data();
      const statusClass = data.status === 'approved' ? 'success-text' : 
                          data.status === 'rejected' ? 'error-text' : 'gold';
      const statusLabel = data.status.charAt(0).toUpperCase() + data.status.slice(1);
      const date = data.created_at?.toDate ? data.created_at.toDate().toLocaleDateString() : 'Unknown date';
      const typeLabel = data.suggestion_type === 'subcategory' ? 'Subcategory' : 'Primary Category';
      const parentInfo = data.parent_slug ? ` (under ${escapeHtml(data.parent_slug)})` : '';
      
      const feedbackHTML = data.admin_feedback ? `
        <div class="mt-sm p-sm card-compact">
          <strong>Admin Response:</strong><br>
          ${escapeHtml(data.admin_feedback)}
        </div>
      ` : '';

      return `
        <div class="card-compact mb-md">
          <div class="flex-between">
            <strong class="gold">${escapeHtml(data.suggested_label)}</strong>
            <span class="${statusClass}">${statusLabel}</span>
          </div>
          <p class="text-sm opacity-70 mt-xs">${typeLabel}${parentInfo}</p>
          <p class="opacity-80 mt-sm">${escapeHtml(data.description)}</p>
          <p class="text-xs opacity-60 mt-sm">Submitted: ${date}</p>
          ${feedbackHTML}
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading suggestions:', error);
    document.getElementById('suggestionsList').innerHTML = '<p class="error-text">Error loading suggestions. Please refresh the page.</p>';
  }
}

document.getElementById('suggestionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!currentUser) {
    showMessage('Please log in to submit suggestions.', 'error');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  const formMessage = document.getElementById('formMessage');
  
  const suggestionType = document.getElementById('suggestionType')?.value || 'subcategory';
  const parentCategory = document.getElementById('parentCategory')?.value || null;
  const suggestedLabel = document.getElementById('suggestedLabel').value.trim();
  const description = document.getElementById('description').value.trim();

  if (suggestedLabel.length < 3) {
    showMessage('Category name must be at least 3 characters.', 'error');
    return;
  }

  if (description.length < 20) {
    showMessage('Please provide a more detailed explanation (minimum 20 characters).', 'error');
    return;
  }

  if (suggestionType === 'subcategory' && !parentCategory) {
    showMessage('Please select a parent category for your subcategory suggestion.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';
  formMessage.innerHTML = '';

  try {
    const suggestedSlug = createSlug(suggestedLabel);

    await addDoc(collection(db, 'category_suggestions'), {
      suggested_by_user_id: currentUser.uid,
      suggested_by_email: currentUser.email,
      business_id: currentBusiness?.id || null,
      business_name: currentBusiness?.business_name || 'Unknown Business',
      suggested_slug: suggestedSlug,
      suggested_label: suggestedLabel,
      suggestion_type: suggestionType,
      parent_slug: suggestionType === 'subcategory' ? parentCategory : null,
      description: description,
      status: 'pending',
      created_at: serverTimestamp()
    });

    showMessage('Your suggestion has been submitted! We\'ll review it and notify you of our decision.', 'success');
    document.getElementById('suggestionForm').reset();
    
    const parentGroup = document.getElementById('parentCategoryGroup');
    if (parentGroup) parentGroup.classList.add('hidden');
    
    await loadSuggestions(currentUser.uid);
  } catch (error) {
    console.error('Error submitting suggestion:', error);
    showMessage('Error submitting suggestion. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Suggestion';
  }
});

function showMessage(message, type) {
  const formMessage = document.getElementById('formMessage');
  const textClass = type === 'success' ? 'success-text' : 'error-text';
  formMessage.innerHTML = `<p class="${textClass}">${message}</p>`;
}

requireAuth({ requireBusiness: true }, async (userContext, firebaseUser, businessContext) => {
  currentUser = firebaseUser;
  loadUserBusiness(businessContext);
  await loadCategories();
  setupForm();
  await loadSuggestions(firebaseUser.uid);
});
