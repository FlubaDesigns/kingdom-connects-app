import { db } from '../../js/firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';
import { isBusinessPro } from '../../js/role-utils.js';

let currentBusinessId = null;
let currentEditingId = null;
let unsubscribe = null;
let isPro = false;

const modal = document.getElementById('itemModal');
const form = document.getElementById('itemForm');
const itemsList = document.getElementById('itemsList');
const proGate = document.getElementById('proGate');
const addBtn = document.getElementById('addItemBtn');

requireAuth({ requireBusiness: true }, (userContext, firebaseUser, businessContext) => {
  initPage(businessContext);
});

function initPage(businesses) {
  let activeBusiness = null;
  if (businesses) {
    for (const biz of businesses) {
      if (biz.listing_status === 'active') {
        activeBusiness = biz;
        break;
      }
    }
  }
  
  if (activeBusiness) {
    currentBusinessId = activeBusiness.id;
    isPro = isBusinessPro(activeBusiness);
    
    if (!isPro) {
      itemsList.innerHTML = '';
      proGate.classList.remove('hidden');
      addBtn.classList.add('hidden');
    } else {
      proGate.classList.add('hidden');
      addBtn.classList.remove('hidden');
      loadItems();
    }
  } else {
    itemsList.innerHTML = `
      <div class="status-message warning">
        <p><strong>No business found</strong></p>
        <p>You need a business listing to manage products & services.</p>
      </div>
    `;
    addBtn.classList.add('hidden');
  }
}

function loadItems() {
  const q = query(collection(db, `business_listings_public/${currentBusinessId}/products_services`));
  
  if (unsubscribe) unsubscribe();
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    const items = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
    
    if (items.length === 0) {
      itemsList.innerHTML = '<p class="status-message empty">No products or services yet. Add your first one!</p>';
      return;
    }

    itemsList.innerHTML = `<div class="items-grid">${items.map(item => `
      <div class="card ${item.is_active === false ? 'opacity-50' : ''}">
        <div class="flex-between mb-sm">
          <div>
            <h3 class="gold">${escapeHtml(item.name)}</h3>
            <span class="badge ${item.item_type === 'product' ? 'badge-info' : 'badge-warning'}">${item.item_type === 'product' ? 'Product' : 'Service'}</span>
            ${item.is_featured ? '<span class="badge badge-gold ml-sm">Featured</span>' : ''}
          </div>
          ${item.price ? `<span class="text-lg gold">${escapeHtml(item.price)}</span>` : ''}
        </div>
        <p class="mb-sm">${escapeHtml(item.description)}</p>
        ${item.duration ? `<p class="text-muted text-sm">${escapeHtml(item.duration)}</p>` : ''}
        <div class="flex-gap mt-sm">
          <button class="btn btn-secondary btn-small" onclick="editItem('${item.id}')">Edit</button>
          <button class="btn btn-danger btn-small" onclick="deleteItem('${item.id}')">Delete</button>
        </div>
      </div>
    `).join('')}</div>`;
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

addBtn.addEventListener('click', () => {
  currentEditingId = null;
  form.reset();
  document.getElementById('isActive').checked = true;
  document.getElementById('modalTitle').textContent = 'Add Product/Service';
  modal.classList.add('active');
});

document.getElementById('closeModal').addEventListener('click', () => modal.classList.remove('active'));
document.getElementById('cancelBtn').addEventListener('click', () => modal.classList.remove('active'));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const itemData = {
      name: document.getElementById('name').value.trim(),
      item_type: document.getElementById('itemType').value,
      description: document.getElementById('description').value.trim(),
      price: document.getElementById('price').value.trim() || null,
      duration: document.getElementById('duration').value.trim() || null,
      is_featured: document.getElementById('isFeatured').checked,
      is_active: document.getElementById('isActive').checked,
      updated_at: serverTimestamp()
    };

    if (currentEditingId) {
      await updateDoc(doc(db, `business_listings_public/${currentBusinessId}/products_services`, currentEditingId), itemData);
    } else {
      itemData.created_at = serverTimestamp();
      await addDoc(collection(db, `business_listings_public/${currentBusinessId}/products_services`), itemData);
    }

    modal.classList.remove('active');
    form.reset();
    if (typeof window.showToast === 'function') {
      window.showToast(currentEditingId ? 'Item updated!' : 'Item added!', 'success');
    }
  } catch (error) {
    console.error('Error saving item:', error);
    if (typeof window.showToast === 'function') {
      window.showToast('Error saving item. Please try again.', 'error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Item';
  }
});

window.editItem = async (itemId) => {
  currentEditingId = itemId;
  const docSnap = await getDoc(doc(db, `business_listings_public/${currentBusinessId}/products_services`, itemId));
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    document.getElementById('name').value = data.name || '';
    document.getElementById('itemType').value = data.item_type || 'service';
    document.getElementById('description').value = data.description || '';
    document.getElementById('price').value = data.price || '';
    document.getElementById('duration').value = data.duration || '';
    document.getElementById('isFeatured').checked = data.is_featured || false;
    document.getElementById('isActive').checked = data.is_active !== false;
    
    document.getElementById('modalTitle').textContent = 'Edit Product/Service';
    modal.classList.add('active');
  }
};

window.deleteItem = async (itemId) => {
  if (confirm('Are you sure you want to delete this item?')) {
    try {
      await deleteDoc(doc(db, `business_listings_public/${currentBusinessId}/products_services`, itemId));
      if (typeof window.showToast === 'function') {
        window.showToast('Item deleted!', 'success');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      if (typeof window.showToast === 'function') {
        window.showToast('Error deleting item. Please try again.', 'error');
      }
    }
  }
};

window.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.remove('active');
});
