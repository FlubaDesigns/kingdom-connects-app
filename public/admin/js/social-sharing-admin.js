import { buildBusinessShareContent } from '../../js/business-share-content.js';
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

async function businessPost(businessId, detail, suppliedBusiness) {
  if (!businessId) return null;
  let business = suppliedBusiness;
  if (!business) {
    const record = await getDoc(doc(db, 'business_listings_public', businessId));
    if (!record.exists()) return null;
    business = record.data();
  }
  if (!business.church_id || business.allow_social_sharing === false) return null;
  const church = await getDoc(doc(db, 'churches', business.church_id));
  if (!church.exists()) return null;
  return buildBusinessShareContent({ businessId, business, church: church.data(),
    origin: window.location.origin, detail });
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
      const rating = Math.max(0, Math.min(5, Number(review.rating ?? review.star_rating) || 0));
      const post = await businessPost(review.business_id,
        `${'⭐'.repeat(rating)} "${review.review_text || ''}" — Review on Kingdom Connects`);
      if (!post) continue;
      const businessName = post.businessName;

      allContent.push({
        id: reviewDoc.id,
        type: 'review',
        post,
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
    
    for (const docSnap of testimonialsSnapshot.docs) {
      const testimonial = docSnap.data();
      const post = testimonial.business_id ? await businessPost(testimonial.business_id,
        testimonial.testimonial_text || testimonial.quote || '') : null;
      if (testimonial.business_id && !post) continue;
      allContent.push({
        id: docSnap.id,
        type: 'testimonial',
        post,
        title: testimonial.business_name || testimonial.name || 'Testimonial',
        subtitle: testimonial.role || 'Business Owner',
        text: testimonial.testimonial_text || testimonial.quote || '',
        date: testimonial.created_at?.toDate ? testimonial.created_at.toDate() : new Date()
      });
    }

    const businessesQuery = query(collection(db, "business_listings_public"), where("is_featured", "==", true));
    const businessesSnapshot = await getDocs(businessesQuery);
    
    for (const docSnap of businessesSnapshot.docs) {
      const business = docSnap.data();
      const post = await businessPost(docSnap.id, business.description || business.tagline || '', business);
      if (!post) continue;
      allContent.push({
        id: docSnap.id,
        type: 'business',
        post,
        title: business.business_name || 'Featured Business',
        subtitle: `${business.city || ''}, ${business.state || ''}`,
        text: business.description || business.tagline || '',
        date: business.created_at?.toDate ? business.created_at.toDate() : new Date()
      });
    }

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
    const postText = item.post?.text || `"${snippet}" - Kingdom Connects ${window.location.origin}`;
    const shareText = encodeURIComponent(postText);
    const shareUrl = encodeURIComponent(item.post?.businessUrl || window.location.origin);
    const association = item.post
      ? `<p><a href="${escapeHtml(item.post.businessUrl)}">${escapeHtml(item.post.businessName)}</a>, associated with <a href="${escapeHtml(item.post.churchUrl)}">${escapeHtml(item.post.churchName)}</a>.</p>`
      : '';

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
        ${association}
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
          <button class="btn btn-small" data-action="copyShare" data-text="${escapeHtml(postText).replace(/"/g, '&quot;')}">
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
  const shareText = text;
  
  navigator.clipboard.writeText(shareText).then(() => {
    window.showToast('Copied to clipboard!', 'success');
  }).catch(() => {
    window.showToast('Failed to copy', 'error');
  });
});
