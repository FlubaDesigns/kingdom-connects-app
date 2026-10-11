import { canShareReview } from '../../js/review-sharing-permissions.js';
import { db } from "../../js/firebase-config.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAdmin } from "./admin-auth-guard.js";

let currentUser = null;
let allContent = [];

requireAdmin((userContext, firebaseUser) => {
  currentUser = firebaseUser;
  loadAll();
});

document.getElementById('saveSettings').addEventListener('click', saveSettings);
document.getElementById('contentTypeFilter').addEventListener('change', renderContentQueue);
document.getElementById('refreshContent').addEventListener('click', loadShareableContent);

async function loadAll() {
  await Promise.all([
    loadSettings(),
    loadShareableContent(),
    loadOptedOutEntities()
  ]);
}

async function loadSettings() {
  try {
    const settingsDoc = await getDoc(doc(db, "platform_settings", "default"));
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      document.getElementById('masterToggle').checked = data.allow_review_sharing !== false;
      document.getElementById('reviewTemplate').value = data.review_share_template || 'Check out this review on Kingdom Connects!';
      document.getElementById('businessTemplate').value = data.business_share_template || 'Discover this Christian business on Kingdom Connects!';
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveSettings() {
  try {
    const settings = {
      allow_review_sharing: document.getElementById('masterToggle').checked,
      review_share_template: document.getElementById('reviewTemplate').value.trim(),
      business_share_template: document.getElementById('businessTemplate').value.trim(),
      updated_at: new Date(),
      updated_by: currentUser.email
    };
    
    await setDoc(doc(db, "platform_settings", "default"), settings, { merge: true });
    window.showToast('Settings saved!', 'success');
    await loadShareableContent();
  } catch (error) {
    console.error('Error saving settings:', error);
    window.showToast('Error saving settings: ' + error.message, 'error');
  }
}

async function loadShareableContent() {
  const loadingEl = document.getElementById('loadingContent');
  const contentEl = document.getElementById('contentQueue');
  const emptyEl = document.getElementById('emptyContent');
  
  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
  emptyEl.classList.add('hidden');
  
  allContent = [];
  
  try {
    const reviewsQuery = query(collection(db, "reviews"), where("status", "==", "approved"));
    const reviewsSnapshot = await getDocs(reviewsQuery);
    
    for (const reviewDoc of reviewsSnapshot.docs) {
      const review = reviewDoc.data();
      if (!(await canShareReview(review.user_id, review.business_id)).allowed) continue;
      let businessName = 'Unknown Business';
      
      if (review.business_id) {
        try {
          const bizDoc = await getDoc(doc(db, "business_listings_public", review.business_id));
          if (bizDoc.exists()) {
            businessName = bizDoc.data().business_name;
          }
        } catch (e) {}
      }
      
      allContent.push({
        id: reviewDoc.id,
        type: 'review',
        title: `Review for ${businessName}`,
        subtitle: `${review.rating ?? review.star_rating ?? 0} stars by ${review.reviewer_name || 'Anonymous'}`,
        text: review.review_text || '',
        businessName,
        rating: review.rating ?? review.star_rating ?? 0,
        date: (review.created_at || review.submitted_at)?.toDate?.() || new Date(0)
      });
    }

    const testimonialsQuery = query(collection(db, "testimonials"), where("status", "==", "approved"));
    const testimonialsSnapshot = await getDocs(testimonialsQuery);
    
    testimonialsSnapshot.forEach(docSnap => {
      const testimonial = docSnap.data();
      allContent.push({
        id: docSnap.id,
        type: 'testimonial',
        title: testimonial.business_name || testimonial.name || 'Testimonial',
        subtitle: testimonial.role || 'Business Owner',
        text: testimonial.testimonial_text || testimonial.quote || '',
        date: testimonial.created_at?.toDate ? testimonial.created_at.toDate() : new Date()
      });
    });

    const businessesQuery = query(collection(db, "business_listings_public"), where("is_featured", "==", true));
    const businessesSnapshot = await getDocs(businessesQuery);
    
    businessesSnapshot.forEach(docSnap => {
      const business = docSnap.data();
      allContent.push({
        id: docSnap.id,
        type: 'business',
        title: business.business_name || 'Featured Business',
        subtitle: `${business.city || ''}, ${business.state || ''}`,
        text: business.description || business.tagline || '',
        date: business.created_at?.toDate ? business.created_at.toDate() : new Date()
      });
    });

    updateStats();
    renderContentQueue();
    
    loadingEl.classList.add('hidden');
    
    if (allContent.length === 0) {
      emptyEl.classList.remove('hidden');
    } else {
      contentEl.classList.remove('hidden');
    }
    
  } catch (error) {
    console.error('Error loading content:', error);
    loadingEl.classList.add('hidden');
    window.showToast('Error loading content: ' + error.message, 'error');
  }
}

function updateStats() {
  const reviews = allContent.filter(c => c.type === 'review').length;
  const testimonials = allContent.filter(c => c.type === 'testimonial').length;
  const businesses = allContent.filter(c => c.type === 'business').length;
  
  document.getElementById('shareableReviews').textContent = reviews;
  document.getElementById('shareableTestimonials').textContent = testimonials;
  document.getElementById('featuredBusinesses').textContent = businesses;
}

function renderContentQueue() {
  const filter = document.getElementById('contentTypeFilter').value;
  const container = document.getElementById('contentQueue');
  
  let filtered = [...allContent];
  
  if (filter === 'reviews') {
    filtered = filtered.filter(c => c.type === 'review');
  } else if (filter === 'testimonials') {
    filtered = filtered.filter(c => c.type === 'testimonial');
  } else if (filter === 'businesses') {
    filtered = filtered.filter(c => c.type === 'business');
  }

  filtered.sort((a, b) => b.date - a.date);
  
  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-muted text-center p-md">No content matches the filter.</p>';
    return;
  }
  
  container.innerHTML = filtered.map(item => {
    const typeLabel = item.type === 'review' ? '📝 Review' : 
                      item.type === 'testimonial' ? '💬 Testimonial' : 
                      '🏢 Business';
    
    const snippet = item.text.length > 100 ? item.text.substring(0, 100) + '...' : item.text;
    const shareText = encodeURIComponent(item.type === 'review' 
      ? `${item.rating ? '⭐'.repeat(item.rating) : ''} "${snippet}" - Review on Kingdom Connects`
      : `"${snippet}" - Kingdom Connects`);
    
    const shareUrl = encodeURIComponent(window.location.origin);
    
    return `
      <div class="share-item">
        <div class="flex-between mb-sm">
          <div>
            <span class="text-muted">${typeLabel}</span>
            <h4>${escapeHtml(item.title)}</h4>
            <small class="text-muted">${escapeHtml(item.subtitle)}</small>
          </div>
          <small class="text-muted">${item.date.toLocaleDateString()}</small>
        </div>
        <p class="mb-md">${escapeHtml(snippet)}</p>
        <div class="share-buttons-row">
          <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${shareText}" 
             target="_blank" rel="noopener" class="btn btn-small share-btn-facebook">
            📘 Facebook
          </a>
          <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" 
             target="_blank" rel="noopener" class="btn btn-small share-btn-twitter">
            🐦 X / Twitter
          </a>
          <button class="btn btn-small" data-action="copyShare" data-text="${escapeHtml(item.text).replace(/"/g, '&quot;')}" data-title="${escapeHtml(item.title).replace(/"/g, '&quot;')}">
            🔗 Copy
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function loadOptedOutEntities() {
  let churchCount = 0;
  let businessCount = 0;
  let memberCount = 0;
  
  try {
    const churchesSnapshot = await getDocs(collection(db, "churches"));
    const optedOutChurches = [];
    churchesSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.allow_review_sharing === false) {
        optedOutChurches.push(data.church_name || docSnap.id);
        churchCount++;
      }
    });
    
    const churchesEl = document.getElementById('churchesOptedOut');
    if (optedOutChurches.length === 0) {
      churchesEl.innerHTML = '<p class="text-success">All churches allow sharing</p>';
    } else {
      churchesEl.innerHTML = optedOutChurches.map(name => 
        `<div class="opt-out-item">${escapeHtml(name)}</div>`
      ).join('');
    }

    const businessesSnapshot = await getDocs(collection(db, "business_listings_public"));
    const optedOutBusinesses = [];
    businessesSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.allow_review_sharing === false) {
        optedOutBusinesses.push(data.business_name || docSnap.id);
        businessCount++;
      }
    });
    
    const businessesEl = document.getElementById('businessesOptedOut');
    if (optedOutBusinesses.length === 0) {
      businessesEl.innerHTML = '<p class="text-success">All businesses allow sharing</p>';
    } else {
      businessesEl.innerHTML = optedOutBusinesses.map(name => 
        `<div class="opt-out-item">${escapeHtml(name)}</div>`
      ).join('');
    }

    const membersSnapshot = await getDocs(collection(db, "users"));
    const optedOutMembers = [];
    membersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.allow_review_sharing === false) {
        optedOutMembers.push(data.name || data.email || docSnap.id);
        memberCount++;
      }
    });
    
    const membersEl = document.getElementById('membersOptedOut');
    if (optedOutMembers.length === 0) {
      membersEl.innerHTML = '<p class="text-success">All members allow sharing</p>';
    } else {
      membersEl.innerHTML = optedOutMembers.map(name => 
        `<div class="opt-out-item">${escapeHtml(name)}</div>`
      ).join('');
    }

    document.getElementById('optedOutCount').textContent = churchCount + businessCount + memberCount;
    
  } catch (error) {
    console.error('Error loading opted out entities:', error);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById('contentQueue').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="copyShare"]');
  if (!btn) return;
  
  const text = btn.dataset.text;
  const title = btn.dataset.title;
  const shareText = `${title}: "${text}" - Kingdom Connects ${window.location.origin}`;
  
  navigator.clipboard.writeText(shareText).then(() => {
    window.showToast('Copied to clipboard!', 'success');
  }).catch(() => {
    window.showToast('Failed to copy', 'error');
  });
});
