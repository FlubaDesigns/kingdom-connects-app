import { changeHierarchy } from '../../js/services/hierarchy-service.js';
import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireAuth } from "../../js/auth/access-control.js";
import { sendTemplate } from "../../js/email/email-service.js";
import { isBusinessPro } from "../../js/role-utils.js";

let currentBusinessId = null;
let currentBusinessData = null;

requireAuth({ requireBusiness: true }, (userContext, firebaseUser, businessContext) => {
  loadDashboard(firebaseUser, businessContext);
});

async function loadDashboard(user, businesses) {
  const loadingMessage = document.getElementById('loadingMessage');
  const noBusinessMessage = document.getElementById('noBusinessMessage');
  const dashboardContent = document.getElementById('dashboardContent');

  try {
    // businesses is passed from auth engine (already fetched by UID)

    // Find active or pending businesses
    let activeBusiness = null;
    let pendingBusiness = null;
    
    if (businesses) {
      for (const biz of businesses) {
        if (biz.listing_status === 'active') {
          activeBusiness = biz;
        } else if (biz.listing_status === 'pending') {
          pendingBusiness = biz;
        }
      }
    }

    if (!activeBusiness) {
      console.log('❌ No active business found for', user.email);
      
      if (pendingBusiness) {
        const submission = pendingBusiness;
        console.log('⏳ Found pending business with status:', submission.listing_status);
        
        // Create elements safely without innerHTML
        const heading = document.createElement('h2');
        heading.className = 'gold-metallic mb-md';
        heading.textContent = '⏳ Your Business Submission is Pending';
        
        const p1 = document.createElement('p');
        p1.className = 'mb-md';
        p1.textContent = 'Thank you for submitting ';
        const strong = document.createElement('strong');
        strong.textContent = submission.business_name || 'your business';
        p1.appendChild(strong);
        p1.appendChild(document.createTextNode('!'));
        
        const p2 = document.createElement('p');
        p2.className = 'mb-md';
        p2.textContent = 'Your business is currently under review by our admin team. You\'ll receive an email once it\'s approved, or you can check back here later.';
        
        const p3 = document.createElement('p');
        p3.className = 'text-sm';
        p3.textContent = 'Submissions are typically reviewed within 24 hours.';
        
        const div = document.createElement('div');
        div.className = 'mt-lg';
        const link = document.createElement('a');
        link.href = '/';
        link.className = 'btn btn-gold';
        link.textContent = '← Back to Home';
        div.appendChild(link);
        
        noBusinessMessage.textContent = '';
        noBusinessMessage.appendChild(heading);
        noBusinessMessage.appendChild(p1);
        noBusinessMessage.appendChild(p2);
        noBusinessMessage.appendChild(p3);
        noBusinessMessage.appendChild(div);
      } else {
        // No submission found at all
        const heading = document.createElement('h2');
        heading.className = 'gold-metallic mb-md';
        heading.textContent = 'No Business Connected';
        
        const p1 = document.createElement('p');
        p1.className = 'mb-md';
        p1.textContent = 'Your email is not connected to any business in Kingdom Connects.';
        
        const p2 = document.createElement('p');
        p2.className = 'mb-md';
        p2.textContent = 'To get started, you can submit a business to be added to our directory.';
        
        const div = document.createElement('div');
        div.className = 'mt-lg';
        const link1 = document.createElement('a');
        link1.href = '/add_to_directory';
        link1.className = 'btn btn-gold';
        link1.textContent = 'Add a Business';
        const link2 = document.createElement('a');
        link2.href = '/';
        link2.className = 'action-button';
        link2.textContent = '← Back to Home';
        div.appendChild(link1);
        div.appendChild(document.createTextNode(' '));
        div.appendChild(link2);
        
        noBusinessMessage.textContent = '';
        noBusinessMessage.appendChild(heading);
        noBusinessMessage.appendChild(p1);
        noBusinessMessage.appendChild(p2);
        noBusinessMessage.appendChild(div);
      }
      
      loadingMessage.classList.add('hidden');
      noBusinessMessage.classList.remove('hidden');
      return;
    }

    // Use the active business we found
    const business = activeBusiness;
    const businessId = activeBusiness.id;
    
    // Store for church affiliation actions
    currentBusinessId = businessId;
    currentBusinessData = business;
    
    // Set business ID for QR Gear widget integration
    if (window.setCurrentBusinessForWidget) {
      window.setCurrentBusinessForWidget(businessId);
    }

    const listingPath = (business.slug && business.slug.trim())
      ? `business?slug=${business.slug}` 
      : `business?id=${businessId}`;
    
    document.getElementById('viewPublicListing').href = '../' + listingPath;
    
    const qrUrl = new URL('../' + listingPath, window.location.href).href;
    generateQRCode(qrUrl);

    await loadStats(businessId, business);

    document.getElementById('businessName').textContent = business.business_name || 'N/A';
    document.getElementById('businessCategory').textContent = business.primary_category || 'N/A';
    document.getElementById('businessLocation').textContent = `${business.city || ''}, ${business.state || ''}`.trim() || 'N/A';
    
    if (business.church_id) {
      try {
        const churchDoc = await getDoc(doc(db, "churches", business.church_id));
        if (churchDoc.exists()) {
          const churchData = churchDoc.data();
          document.getElementById('churchAffiliation').textContent = churchData.church_name || 'Unknown Church';
          document.getElementById('leaveChurchBtn').classList.remove('hidden');
          document.getElementById('findChurchBtn').classList.add('hidden');
        } else {
          document.getElementById('churchAffiliation').textContent = 'Church not found';
          document.getElementById('leaveChurchBtn').classList.add('hidden');
          document.getElementById('findChurchBtn').classList.remove('hidden');
        }
      } catch (error) {
        console.error('Error fetching church:', error);
        document.getElementById('churchAffiliation').textContent = 'Error loading church';
        document.getElementById('leaveChurchBtn').classList.add('hidden');
        document.getElementById('findChurchBtn').classList.remove('hidden');
      }
    } else {
      document.getElementById('churchAffiliation').textContent = 'Unchurched';
      document.getElementById('leaveChurchBtn').classList.add('hidden');
      document.getElementById('findChurchBtn').classList.remove('hidden');
    }
    
    const isPro = isBusinessPro(business);
    const badge = isPro ? '<span class="pro-badge">PRO</span>' : '<span class="free-badge">FREE</span>';
    document.getElementById('membershipBadge').innerHTML = badge;

    const statusMap = {
      'active': '✅ Active',
      'pending': '⏳ Pending Approval',
      'suspended': '⛔ Suspended'
    };
    document.getElementById('listingStatus').textContent = statusMap[business.listing_status] || business.listing_status || 'Unknown';

    if (business.created_at) {
      const createdDate = business.created_at.toDate ? business.created_at.toDate() : new Date(business.created_at);
      document.getElementById('memberSince').textContent = createdDate.toLocaleDateString();
    } else {
      document.getElementById('memberSince').textContent = 'Unknown';
    }

    const proStatusEl = document.getElementById('proStatus');
    const cancelSubEl = document.getElementById('cancelSubSection');
    const proFeaturesEl = document.getElementById('proFeaturesSection');
    const upgradePromoEl = document.getElementById('upgradePromo');

    if (isPro) {
      proStatusEl?.classList.remove('hidden');
      cancelSubEl?.classList.remove('hidden');
      proFeaturesEl?.classList.remove('hidden');
      upgradePromoEl?.classList.add('hidden');

      if (business.pro_start_date) {
        const startDate = business.pro_start_date.toDate ? business.pro_start_date.toDate() : new Date(business.pro_start_date);
        const proStartEl = document.getElementById('proStartDate');
        if (proStartEl) proStartEl.textContent = startDate.toLocaleDateString();
      }

      if (business.pro_end_date) {
        const endDate = business.pro_end_date.toDate ? business.pro_end_date.toDate() : new Date(business.pro_end_date);
        const proEndEl = document.getElementById('proEndDate');
        if (proEndEl) proEndEl.textContent = endDate.toLocaleDateString();
      }
    } else {
      proStatusEl?.classList.add('hidden');
      cancelSubEl?.classList.add('hidden');
      proFeaturesEl?.classList.add('hidden');
      upgradePromoEl?.classList.remove('hidden');
    }

    calculateProfileCompletion(business, isPro);
    await checkNewReviews(businessId);

    loadingMessage.classList.add('hidden');
    dashboardContent.classList.remove('hidden');
    
    setupManageSubscription();
    setupChurchAffiliation();

  } catch (error) {
    console.error('Error loading dashboard:', error);
    loadingMessage.textContent = 'Error loading dashboard: ' + error.message;
    loadingMessage.classList.add('status-error');
  }
}

async function loadStats(businessId, business) {
  try {
    const reviewsQuery = query(collection(db, "reviews"), where("business_id", "==", businessId));
    const reviewsSnapshot = await getDocs(reviewsQuery);
    
    let totalReviews = reviewsSnapshot.size;
    let totalRating = 0;
    let avgRating = 0;

    reviewsSnapshot.forEach((reviewDoc) => {
      const review = reviewDoc.data();
      const rating = Number(review.rating) || 0;
      totalRating += rating;
    });

    if (totalReviews > 0) {
      avgRating = totalRating / totalReviews;
    }

    const photoCount = (business.photos && Array.isArray(business.photos)) ? business.photos.length : 0;
    const profileViews = business.views || 0;

    const avgRatingEl = document.getElementById('avgRating');
    if (totalReviews > 0) {
      avgRatingEl.textContent = avgRating.toFixed(1) + ' ⭐';
      avgRatingEl.classList.remove('stat-placeholder');
    } else {
      avgRatingEl.textContent = 'No reviews yet';
      avgRatingEl.classList.add('stat-placeholder');
    }
    
    document.getElementById('totalReviews').textContent = totalReviews;
    document.getElementById('profileViews').textContent = profileViews;
    document.getElementById('photoCount').textContent = photoCount;

  } catch (error) {
    console.error('Error loading stats:', error);
    document.getElementById('avgRating').textContent = '-';
    document.getElementById('totalReviews').textContent = '-';
    document.getElementById('profileViews').textContent = '-';
    document.getElementById('photoCount').textContent = '-';
  }
}

function setupManageSubscription() {
  const manageBtn = document.getElementById('manageSubBtn');
  if (!manageBtn) return;
  
  manageBtn.addEventListener('click', async () => {
    const confirmed = window.showConfirmDialog 
      ? await window.showConfirmDialog(
          'Cancel Pro Subscription', 
          'You\'ll lose access to Photo & Video Gallery, Social Media Links, 5 Secondary Categories, Featured Placement, and Priority Support. Your listing will remain active as a Free listing.',
          'Cancel Subscription',
          'warning'
        )
      : confirm('⚠️ Are you sure you want to cancel your Pro subscription? Your listing will remain active as a Free listing.');
    
    if (confirmed) {
      window.location.href = 'pro_cancel';
    }
  });
}

function setupChurchAffiliation() {
  const leaveChurchBtn = document.getElementById('leaveChurchBtn');
  const findChurchBtn = document.getElementById('findChurchBtn');
  
  if (leaveChurchBtn) {
    leaveChurchBtn.addEventListener('click', handleLeaveChurch);
  }
  
  if (findChurchBtn) {
    findChurchBtn.addEventListener('click', handleFindChurch);
  }
}

async function handleLeaveChurch() {
  const confirmed = window.showConfirmDialog 
    ? await window.showConfirmDialog(
        'Leave Church Affiliation', 
        'Your church will receive a request to release your business. Once approved, the listing and store remain inactive until a new church approves affiliation.',
        'Leave Church',
        'warning'
      )
    : confirm('⚠️ Are you sure you want to leave your current church?');
  
  if (!confirmed) return;
  
  try {
    const churchId = currentBusinessData.church_id;
    let churchName = 'your church';
    
    if (churchId) {
      try {
        const churchRef = doc(db, 'churches', churchId);
        const churchSnap = await getDoc(churchRef);
        if (churchSnap.exists()) {
          churchName = churchSnap.data().church_name || churchName;
        }
      } catch (err) {
        console.warn('Could not fetch church name:', err);
      }
    }
    
    const businessRef = doc(db, 'business_listings_public', currentBusinessId);
    
    await changeHierarchy('requestAffiliation', { businessId: currentBusinessId, kind: 'leave' });
    
    window.showToast('Release request sent to your church.', 'success');
    setTimeout(() => window.location.reload(), 2000);
    
  } catch (error) {
    console.error('Error leaving church:', error);
    window.showToast('Error leaving church: ' + error.message, 'error');
  }
}

function handleFindChurch() {
  window.location.href = '/business-admin/find-church';
}

function generateQRCode(url) {
  const container = document.getElementById('qrCanvas');
  if (!container || !url || typeof QRCode === 'undefined') {
    console.warn('QR code generation skipped - missing container or library');
    return;
  }
  
  try {
    container.innerHTML = '';
    new QRCode(container, {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#1a1a1a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    document.getElementById('downloadQRBtn')?.classList.remove('hidden');
  } catch (error) {
    console.error('Error generating QR code:', error);
  }
}

document.getElementById('downloadQRBtn')?.addEventListener('click', () => {
  const canvas = document.querySelector('#qrCanvas canvas');
  if (!canvas) {
    window.showToast('QR code not ready', 'info');
    return;
  }
  
  const link = document.createElement('a');
  link.download = 'business-qr-code.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

function calculateProfileCompletion(business, isPro) {
  const completionSection = document.getElementById('profileCompletion');
  const completionFill = document.getElementById('completionFill');
  const completionPercent = document.getElementById('completionPercent');
  const completionTip = document.getElementById('completionTip');
  const taskList = document.getElementById('completionTasks');
  
  if (!completionSection || !completionFill || !completionPercent) {
    return;
  }

  const tasks = [
    { key: 'business_name', label: 'Add business name', link: 'edit-listing#businessName', check: b => !!b.business_name },
    { key: 'description', label: 'Add description (50+ chars)', link: 'edit-listing#description', check: b => b.description && b.description.length >= 50 },
    { key: 'phone', label: 'Add phone number', link: 'edit-listing#phone', check: b => !!b.phone },
    { key: 'address', label: 'Add address', link: 'edit-listing#addressLine1', check: b => !!b.address_line1 },
    { key: 'hours', label: 'Set business hours', link: 'hours', check: b => b.hours_of_operation && Object.keys(b.hours_of_operation).length > 0 },
    { key: 'primary_category', label: 'Select primary category', link: 'categories', check: b => !!b.primary_category },
    { key: 'website', label: 'Add website URL', link: 'edit-listing#website', check: b => !!b.website },
    { key: 'church', label: 'Connect with a church', link: 'church-affiliation', check: b => !!b.church_id }
  ];

  if (isPro) {
    tasks.push({ key: 'photos', label: 'Upload photos', link: 'photos', check: b => b.photos && b.photos.length > 0 });
  }

  let completed = 0;
  const incompleteTasks = [];

  tasks.forEach(task => {
    if (task.check(business)) {
      completed++;
    } else {
      incompleteTasks.push({ label: task.label, link: task.link });
    }
  });

  const percent = Math.round((completed / tasks.length) * 100);
  
  completionFill.style.width = percent + '%';
  completionPercent.textContent = percent + '%';

  const completionStar = document.getElementById('completionStar');
  
  if (taskList && completionTip) {
    if (incompleteTasks.length > 0 && incompleteTasks.length <= 3) {
      taskList.innerHTML = incompleteTasks.map(t => `<li><a href="${t.link}" class="completion-link">${t.label}</a></li>`).join('');
      completionTip.textContent = 'Optional boosts available:';
      if (completionStar) completionStar.classList.add('hidden');
    } else if (incompleteTasks.length > 3) {
      taskList.innerHTML = incompleteTasks.slice(0, 3).map(t => `<li><a href="${t.link}" class="completion-link">${t.label}</a></li>`).join('');
      completionTip.textContent = `${incompleteTasks.length} boosts available:`;
      if (completionStar) completionStar.classList.add('hidden');
    } else {
      taskList.innerHTML = '';
      completionTip.textContent = 'All boosts complete! Your profile is fully optimized.';
      if (completionStar) {
        completionStar.classList.remove('hidden');
        completionStar.classList.add('has-orange-outline');
      }
    }
  }

  completionSection.classList.remove('hidden');
}

async function checkNewReviews(businessId) {
  const badge = document.getElementById('newReviewBadge');
  const reviewsTile = document.getElementById('reviewsTile');
  
  if (!badge || !reviewsTile) {
    return;
  }

  try {
    const lastSeenKey = `kc-reviews-seen-${businessId}`;
    let lastSeenDate = new Date(0);
    
    try {
      const lastSeen = localStorage.getItem(lastSeenKey);
      if (lastSeen) {
        lastSeenDate = new Date(lastSeen);
      }
    } catch (e) {
      console.warn('localStorage not available');
    }

    const reviewsQuery = query(
      collection(db, "reviews"),
      where("business_id", "==", businessId)
    );
    const snapshot = await getDocs(reviewsQuery);

    let hasNew = false;
    snapshot.forEach((docSnap) => {
      const review = docSnap.data();
      if (review.created_at) {
        try {
          const reviewDate = review.created_at.toDate ? review.created_at.toDate() : new Date(review.created_at);
          if (reviewDate > lastSeenDate) {
            hasNew = true;
          }
        } catch (e) {
          // Invalid date, skip
        }
      }
    });

    if (hasNew) {
      badge.classList.remove('hidden');
    }

    reviewsTile.addEventListener('click', () => {
      try {
        localStorage.setItem(lastSeenKey, new Date().toISOString());
      } catch (e) {
        // localStorage not available
      }
    });
  } catch (error) {
    console.error('Error checking new reviews:', error);
  }
}
