import { db } from '../../js/firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { requireAuth } from '../../js/auth/access-control.js';
import { isBusinessPro } from '../../js/role-utils.js';

let currentBusinessId = null;
let currentEditingId = null;
let unsubscribe = null;
let isPro = false;

const modal = document.getElementById('testimonialModal');
const form = document.getElementById('testimonialForm');
const testimonialsList = document.getElementById('testimonialsList');
const proGate = document.getElementById('proGate');
const addBtn = document.getElementById('addTestimonialBtn');

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
      testimonialsList.innerHTML = '';
      proGate.classList.remove('hidden');
      addBtn.classList.add('hidden');
    } else {
      proGate.classList.add('hidden');
      addBtn.classList.remove('hidden');
      loadTestimonials();
    }
  } else {
    testimonialsList.innerHTML = `
      <div class="status-message warning">
        <p><strong>No business found</strong></p>
        <p>You need a business listing to manage testimonials.</p>
      </div>
    `;
    addBtn.classList.add('hidden');
  }
}

function loadTestimonials() {
  const q = query(collection(db, `business_listings_public/${currentBusinessId}/testimonials`));
  
  if (unsubscribe) unsubscribe();
  
  unsubscribe = onSnapshot(q, (snapshot) => {
    const testimonials = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0);
      });
    
    if (testimonials.length === 0) {
      testimonialsList.innerHTML = '<p class="status-message empty">No testimonials yet. Add your first one!</p>';
      return;
    }

    testimonialsList.innerHTML = `<div class="testimonials-grid">${testimonials.map(t => `
      <div class="card ${t.is_active === false ? 'opacity-50' : ''}">
        <div class="flex-between mb-sm">
          <div>
            <h3 class="gold">${escapeHtml(t.customer_name)}</h3>
            ${t.customer_title ? `<p class="text-muted text-sm">${escapeHtml(t.customer_title)}</p>` : ''}
          </div>
          <div>
            ${t.is_featured ? '<span class="badge badge-gold">Featured</span>' : ''}
            <span class="stars">${'★'.repeat(t.rating || 5)}${'☆'.repeat(5 - (t.rating || 5))}</span>
          </div>
        </div>
        <blockquote class="testimonial-quote">"${escapeHtml(t.quote)}"</blockquote>
        <div class="flex-gap mt-sm">
          <button class="btn btn-secondary btn-small" onclick="editTestimonial('${t.id}')">Edit</button>
          <button class="btn btn-danger btn-small" onclick="deleteTestimonial('${t.id}')">Delete</button>
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
  document.getElementById('modalTitle').textContent = 'Add Testimonial';
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
    const testimonialData = {
      customer_name: document.getElementById('customerName').value.trim(),
      customer_title: document.getElementById('customerTitle').value.trim() || null,
      quote: document.getElementById('quote').value.trim(),
      rating: parseInt(document.getElementById('rating').value, 10),
      is_featured: document.getElementById('isFeatured').checked,
      is_active: document.getElementById('isActive').checked,
      updated_at: serverTimestamp()
    };

    if (currentEditingId) {
      await updateDoc(doc(db, `business_listings_public/${currentBusinessId}/testimonials`, currentEditingId), testimonialData);
    } else {
      testimonialData.created_at = serverTimestamp();
      await addDoc(collection(db, `business_listings_public/${currentBusinessId}/testimonials`), testimonialData);
    }

    modal.classList.remove('active');
    form.reset();
    if (typeof window.showToast === 'function') {
      window.showToast(currentEditingId ? 'Testimonial updated!' : 'Testimonial added!', 'success');
    }
  } catch (error) {
    console.error('Error saving testimonial:', error);
    if (typeof window.showToast === 'function') {
      window.showToast('Error saving testimonial. Please try again.', 'error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Testimonial';
  }
});

window.editTestimonial = async (testimonialId) => {
  currentEditingId = testimonialId;
  const docSnap = await getDoc(doc(db, `business_listings_public/${currentBusinessId}/testimonials`, testimonialId));
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    document.getElementById('customerName').value = data.customer_name || '';
    document.getElementById('customerTitle').value = data.customer_title || '';
    document.getElementById('quote').value = data.quote || '';
    document.getElementById('rating').value = data.rating || 5;
    document.getElementById('isFeatured').checked = data.is_featured || false;
    document.getElementById('isActive').checked = data.is_active !== false;
    
    document.getElementById('modalTitle').textContent = 'Edit Testimonial';
    modal.classList.add('active');
  }
};

window.deleteTestimonial = async (testimonialId) => {
  if (confirm('Are you sure you want to delete this testimonial?')) {
    try {
      await deleteDoc(doc(db, `business_listings_public/${currentBusinessId}/testimonials`, testimonialId));
      if (typeof window.showToast === 'function') {
        window.showToast('Testimonial deleted!', 'success');
      }
    } catch (error) {
      console.error('Error deleting testimonial:', error);
      if (typeof window.showToast === 'function') {
        window.showToast('Error deleting testimonial. Please try again.', 'error');
      }
    }
  }
};

window.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.remove('active');
});
