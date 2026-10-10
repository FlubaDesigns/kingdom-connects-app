import { db } from '../../js/firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, onSnapshot, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';
import { isBusinessPro } from '../../js/role-utils.js';

let currentBusinessId = null;
let currentEditingId = null;
let unsubscribe = null;
let isPro = false;

const modal = document.getElementById('promotionModal');
const form = document.getElementById('promotionForm');
const promotionsList = document.getElementById('promotionsList');
const proGate = document.getElementById('proGate');
const addBtn = document.getElementById('addPromotionBtn');
const promoTypeSelect = document.getElementById('promoType');
const couponCodeGroup = document.getElementById('couponCodeGroup');

promoTypeSelect.addEventListener('change', () => {
  couponCodeGroup.classList.toggle('hidden', promoTypeSelect.value !== 'coupon');
});

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
      promotionsList.innerHTML = '';
      proGate.classList.remove('hidden');
      addBtn.classList.add('hidden');
    } else {
      proGate.classList.add('hidden');
      addBtn.classList.remove('hidden');
      loadPromotions();
    }
  } else {
    promotionsList.innerHTML = `
      <div class="status-message warning">
        <p><strong>No business found</strong></p>
        <p>You need a business listing to manage promotions.</p>
      </div>
    `;
    addBtn.classList.add('hidden');
  }
}

function loadPromotions() {
  const q = query(collection(db, `business_listings_public/${currentBusinessId}/promotions`));
  
  if (unsubscribe) unsubscribe();
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    const promotions = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const dateA = a.end_date?.toDate?.() || new Date(0);
        const dateB = b.end_date?.toDate?.() || new Date(0);
        return dateB - dateA;
      });
    
    if (promotions.length === 0) {
      promotionsList.innerHTML = '<p class="status-message empty">No promotions yet. Create your first one!</p>';
      return;
    }

    const now = new Date();
    promotionsList.innerHTML = `<div class="promotions-grid">${promotions.map(promo => {
      const startDate = promo.start_date?.toDate?.() || new Date(0);
      const endDate = promo.end_date?.toDate?.() || new Date(0);
      const isActive = startDate <= now && endDate >= now;
      const isExpired = endDate < now;
      const statusClass = isExpired ? 'badge-danger' : (isActive ? 'badge-success' : 'badge-warning');
      const statusText = isExpired ? 'Expired' : (isActive ? 'Active' : 'Scheduled');
      
      return `
        <div class="card ${isExpired ? 'opacity-50' : ''}">
          <div class="flex-between mb-sm">
            <h3 class="gold">${escapeHtml(promo.title)}</h3>
            <span class="${statusClass}">${statusText}</span>
          </div>
          <p class="mb-sm">${escapeHtml(promo.description)}</p>
          <p class="text-muted text-sm">
            ${formatDate(startDate)} - ${formatDate(endDate)}
            ${promo.coupon_code ? `<br>Code: <strong>${escapeHtml(promo.coupon_code)}</strong>` : ''}
          </p>
          <div class="flex-gap mt-sm">
            <button class="btn btn-secondary btn-small" onclick="editPromotion('${promo.id}')">Edit</button>
            <button class="btn btn-danger btn-small" onclick="deletePromotion('${promo.id}')">Delete</button>
          </div>
        </div>
      `;
    }).join('')}</div>`;
  });
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  document.getElementById('modalTitle').textContent = 'Add Promotion';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('startDate').value = today;
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
    const promoData = {
      title: document.getElementById('title').value.trim(),
      description: document.getElementById('description').value.trim(),
      promo_type: document.getElementById('promoType').value,
      coupon_code: document.getElementById('couponCode').value.trim() || null,
      start_date: Timestamp.fromDate(new Date(document.getElementById('startDate').value)),
      end_date: Timestamp.fromDate(new Date(document.getElementById('endDate').value)),
      terms: document.getElementById('terms').value.trim() || null,
      updated_at: serverTimestamp()
    };

    if (currentEditingId) {
      await updateDoc(doc(db, `business_listings_public/${currentBusinessId}/promotions`, currentEditingId), promoData);
    } else {
      promoData.created_at = serverTimestamp();
      await addDoc(collection(db, `business_listings_public/${currentBusinessId}/promotions`), promoData);
    }

    modal.classList.remove('active');
    form.reset();
    if (typeof window.showToast === 'function') {
      window.showToast(currentEditingId ? 'Promotion updated!' : 'Promotion added!', 'success');
    }
  } catch (error) {
    console.error('Error saving promotion:', error);
    if (typeof window.showToast === 'function') {
      window.showToast('Error saving promotion. Please try again.', 'error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Promotion';
  }
});

window.editPromotion = async (promoId) => {
  currentEditingId = promoId;
  const docSnap = await getDoc(doc(db, `business_listings_public/${currentBusinessId}/promotions`, promoId));
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    document.getElementById('title').value = data.title || '';
    document.getElementById('description').value = data.description || '';
    document.getElementById('promoType').value = data.promo_type || 'discount';
    document.getElementById('couponCode').value = data.coupon_code || '';
    document.getElementById('terms').value = data.terms || '';
    
    if (data.start_date) {
      const startDate = data.start_date.toDate ? data.start_date.toDate() : new Date(data.start_date);
      document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
    }
    if (data.end_date) {
      const endDate = data.end_date.toDate ? data.end_date.toDate() : new Date(data.end_date);
      document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
    }
    
    couponCodeGroup.classList.toggle('hidden', data.promo_type !== 'coupon');
    document.getElementById('modalTitle').textContent = 'Edit Promotion';
    modal.classList.add('active');
  }
};

window.deletePromotion = async (promoId) => {
  if (confirm('Are you sure you want to delete this promotion?')) {
    try {
      await deleteDoc(doc(db, `business_listings_public/${currentBusinessId}/promotions`, promoId));
      if (typeof window.showToast === 'function') {
        window.showToast('Promotion deleted!', 'success');
      }
    } catch (error) {
      console.error('Error deleting promotion:', error);
      if (typeof window.showToast === 'function') {
        window.showToast('Error deleting promotion. Please try again.', 'error');
      }
    }
  }
};

window.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.remove('active');
});
