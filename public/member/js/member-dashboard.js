import { db } from "../../js/firebase-config.js";
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { requireMember } from "../../js/auth/access-control.js";
import { isBusinessPro, getUserDashboards } from "../../js/role-utils.js";

let currentUser = null;
let forYouData = { favorites: [], churchBusinesses: [], proBusinesses: [] };

requireMember((userContext, firebaseUser) => {
  currentUser = firebaseUser;
  handleVerificationRedirect(firebaseUser);
  loadDashboard(firebaseUser, userContext.roles || ['member']);
  setupForYouFilter();
});

async function handleVerificationRedirect(user) {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('verified') === 'true') {
    window.history.replaceState({}, document.title, window.location.pathname);
    
    try {
      await user.reload();
    } catch (err) {
      console.error('Error reloading user:', err);
    }
    
    if (user.emailVerified) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          email_verified: true,
          updated_at: new Date()
        });
      } catch (err) {
        console.error('Error updating email_verified:', err);
      }
      
      showVerificationSuccess();
    }
  }
}

function showVerificationSuccess() {
  const banner = document.createElement('div');
  banner.className = 'verification-success-banner';
  banner.innerHTML = `
    <div style="background: linear-gradient(135deg, #c9a227 0%, #8b7355 100%); color: #1a1a2e; padding: 12px 20px; text-align: center; font-weight: bold; border-radius: 8px; margin-bottom: 16px;">
      Email verified successfully! Your profile is now more complete.
    </div>
  `;
  
  const mainContent = document.querySelector('.dashboard-content') || document.querySelector('main') || document.body.firstElementChild;
  if (mainContent) {
    mainContent.insertBefore(banner, mainContent.firstChild);
    
    setTimeout(() => {
      banner.style.transition = 'opacity 0.5s';
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 500);
    }, 5000);
  }
}

let userData = null;

const dashboardIcons = {
  shield: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>',
  briefcase: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
  church: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"></path><path d="m9 16 3-8 3 8"></path><path d="M12 10v2"></path></svg>',
  dollar: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
  megaphone: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-5v12L3 13v-2z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path></svg>',
  user: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
};

function renderDashboardLinks(roles) {
  const dashboards = getUserDashboards(roles);
  const container = document.getElementById('dashboardLinks');
  const card = document.getElementById('yourDashboardsCard');
  
  if (!container) return;
  
  const otherDashboards = dashboards.filter(d => d.url !== '/member/index.html');
  
  if (otherDashboards.length === 0) {
    card.classList.add('hidden');
    return;
  }
  
  container.innerHTML = otherDashboards.map(d => `
    <a href="${d.url}" class="action-card">
      <div class="action-card-icon">${dashboardIcons[d.icon] || dashboardIcons.user}</div>
      <span class="action-card-title">${d.label}</span>
    </a>
  `).join('');
}

async function loadDashboard(user, roles) {
  const loadingMessage = document.getElementById('loadingMessage');
  const dashboardContent = document.getElementById('dashboardContent');
  const errorMessage = document.getElementById('errorMessage');

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    userData = userDoc.exists() ? userDoc.data() : {};

    document.getElementById('userName').textContent = userData.display_name || user.email.split('@')[0];
    
    renderDashboardLinks(roles);

    if (userData.created_at) {
      const createdDate = userData.created_at.toDate ? userData.created_at.toDate() : new Date(userData.created_at);
      document.getElementById('memberSince').textContent = createdDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    } else {
      document.getElementById('memberSince').textContent = 'N/A';
    }

    await loadStats(user.uid);
    await loadRecentFavorites(user.uid);
    await loadRecentReviews(user.uid);
    calculateMemberProfileCompletion(userData);
    await loadChurchBusinesses(userData.home_church_id);
    await loadForYouSection(user.uid, userData.home_church_id);

    loadingMessage.classList.add('hidden');
    dashboardContent.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading dashboard:', error);
    loadingMessage.classList.add('hidden');
    errorMessage.classList.remove('hidden');
  }
}

async function loadStats(userId) {
  try {
    const favoritesQuery = query(collection(db, "favorite_businesses"), where("user_id", "==", userId));
    const favoritesSnapshot = await getDocs(favoritesQuery);
    document.getElementById('totalFavorites').textContent = favoritesSnapshot.size;

    const reviewsQuery = query(collection(db, "reviews"), where("user_id", "==", userId));
    const reviewsSnapshot = await getDocs(reviewsQuery);
    document.getElementById('totalReviews').textContent = reviewsSnapshot.size;

    // Check user's Pro status from their user document
    const userDoc = await getDoc(doc(db, "users", userId));
    const userData = userDoc.exists() ? userDoc.data() : {};
    const isPro = userData.subscription_status === 'active' || userData.is_pro === true;
    document.getElementById('accountStatus').textContent = isPro ? 'Pro' : 'Free';

  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

async function loadRecentFavorites(userId) {
  const container = document.getElementById('recentFavorites');
  
  try {
    // Query without orderBy to avoid needing composite index
    const favoritesQuery = query(
      collection(db, "favorite_businesses"), 
      where("user_id", "==", userId)
    );
    const favoritesSnapshot = await getDocs(favoritesQuery);
    
    // Sort client-side by saved_at descending and take first 3
    const sortedDocs = favoritesSnapshot.docs.sort((a, b) => {
      const aTime = a.data().saved_at?.seconds || 0;
      const bTime = b.data().saved_at?.seconds || 0;
      return bTime - aTime;
    }).slice(0, 3);

    if (sortedDocs.length === 0) {
      container.innerHTML = '<p class="text-muted">No favorite businesses saved yet. Start browsing the directory to bookmark your favorites!</p>';
      return;
    }

    let html = '<div class="card-list">';
    
    for (const favoriteDoc of sortedDocs) {
      const favorite = favoriteDoc.data();
      const businessId = favorite.business_id;

      let itemName = 'Unknown Business';
      let itemLocation = '';
      let itemLink = '#';

      const businessDoc = await getDoc(doc(db, "business_listings_public", businessId));
      if (businessDoc.exists()) {
        const itemData = businessDoc.data();
        itemName = itemData.business_name || 'Unknown Business';
        itemLocation = `${itemData.city || ''}, ${itemData.state || ''}`.trim();
        itemLink = `/business.html?id=${businessId}`;
      }

      html += `
        <article class="card card-clickable" onclick="window.location.href='${itemLink}'" style="cursor:pointer;">
          <h4>💼 ${itemName}</h4>
          <p class="text-muted">${itemLocation}</p>
        </article>
      `;
    }
    
    html += '</div>';
    html += '<div class="text-center mt-md"><a href="/member/favorites.html" class="btn btn-gold">View All Favorites</a></div>';
    
    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading favorites:', error);
    container.innerHTML = '<p class="text-muted">No favorites saved yet. Browse businesses to add some!</p>';
  }
}

async function loadRecentReviews(userId) {
  const container = document.getElementById('recentReviews');
  
  try {
    // Query without orderBy to avoid needing composite index
    const reviewsQuery = query(
      collection(db, "reviews"), 
      where("user_id", "==", userId)
    );
    const reviewsSnapshot = await getDocs(reviewsQuery);
    
    // Sort client-side by created_at descending and take first 3
    const sortedReviews = reviewsSnapshot.docs.sort((a, b) => {
      const aTime = a.data().created_at?.seconds || 0;
      const bTime = b.data().created_at?.seconds || 0;
      return bTime - aTime;
    }).slice(0, 3);

    if (sortedReviews.length === 0) {
      container.innerHTML = '<p class="text-muted">No reviews written yet. Visit a business page to leave your first review!</p>';
      return;
    }

    let html = '<div class="card-list">';
    
    for (const reviewDoc of sortedReviews) {
      const review = reviewDoc.data();
      const businessId = review.business_id;

      let businessName = 'Unknown Business';
      let businessLink = '#';

      const businessDoc = await getDoc(doc(db, "business_listings_public", businessId));
      if (businessDoc.exists()) {
        const businessData = businessDoc.data();
        businessName = businessData.business_name || 'Unknown Business';
        businessLink = `/business.html?id=${businessId}`;
      }

      const reviewDate = review.created_at?.toDate ? review.created_at.toDate().toLocaleDateString() : 'N/A';
      const stars = '⭐'.repeat(review.rating || 0);

      html += `
        <article class="card">
          <h4><a href="${businessLink}">${businessName}</a></h4>
          <div class="mb-sm">${stars}</div>
          <p class="text-sm text-muted">${reviewDate}</p>
          <a href="/member/reviews.html" class="btn btn-gold btn-small">View All Reviews</a>
        </article>
      `;
    }
    
    html += '</div>';
    
    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading reviews:', error);
    container.innerHTML = '<p class="text-muted">You haven\'t written any reviews yet.</p>';
  }
}

function calculateMemberProfileCompletion(user) {
  const completionSection = document.getElementById('memberProfileCompletion');
  const completionFill = document.getElementById('memberCompletionFill');
  const completionPercent = document.getElementById('memberCompletionPercent');
  const completionTip = document.getElementById('memberCompletionTip');
  const taskList = document.getElementById('memberCompletionTasks');
  
  if (!completionSection || !completionFill || !completionPercent) {
    return;
  }

  const tasks = [
    { key: 'display_name', label: 'Set display name', link: '/member/settings.html#myProfile', check: u => !!u.display_name },
    { key: 'profile_photo', label: 'Add profile photo', link: '/member/settings.html#myProfile', check: u => !!u.profile_photo_url },
    { key: 'email_verified', label: 'Verify your email', link: '/member/settings.html#emailVerification', check: u => !!u.email_verified },
    { key: 'home_church', label: 'Select home church', link: '/member/settings.html#churchAffiliation', check: u => !!u.home_church_id }
  ];

  let completed = 0;
  const incompleteTasks = [];

  tasks.forEach(task => {
    if (task.check(user)) {
      completed++;
    } else {
      incompleteTasks.push({ label: task.label, link: task.link });
    }
  });

  const percent = Math.round((completed / tasks.length) * 100);
  
  completionFill.style.width = percent + '%';
  completionPercent.textContent = percent + '%';

  const completionStar = document.getElementById('memberCompletionStar');
  
  if (taskList && completionTip) {
    if (incompleteTasks.length > 0) {
      taskList.innerHTML = incompleteTasks.map(t => `<li><a href="${t.link}" class="completion-link">${t.label}</a></li>`).join('');
      completionTip.textContent = 'Optional boosts available:';
      if (completionStar) completionStar.classList.add('hidden');
    } else {
      taskList.innerHTML = '';
      completionTip.textContent = 'All boosts complete! You\'re all set.';
      if (completionStar) {
        completionStar.classList.remove('hidden');
        completionStar.classList.add('has-orange-outline');
      }
    }
  }

  completionSection.classList.remove('hidden');
}

async function loadChurchBusinesses(churchId) {
  const card = document.getElementById('churchBusinessesCard');
  const countEl = document.getElementById('churchBizCount');
  const container = document.getElementById('recommendedBusinesses');
  
  if (!card || !countEl || !container || !churchId) {
    return;
  }

  try {
    const q = query(collection(db, "business_listings_public"), where("church_id", "==", churchId));
    const snapshot = await getDocs(q);

    countEl.textContent = snapshot.size;
    card.classList.remove('hidden');

    if (snapshot.empty) {
      container.innerHTML = '<p class="text-muted">No businesses from your church have joined yet. Be the first to invite them!</p>';
      return;
    }
    
    const businesses = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.business_name) {
        businesses.push({ id: docSnap.id, ...data });
      }
    });

    if (businesses.length === 0) {
      container.innerHTML = '<p class="text-muted">No businesses from your church have joined yet.</p>';
      return;
    }

    const recommended = businesses.slice(0, 3);

    let html = '';
    for (const biz of recommended) {
      const location = `${biz.city || ''}, ${biz.state || ''}`.trim().replace(/^,|,$/g, '');
      html += `
        <article class="card card-clickable" onclick="window.location.href='/business?id=${biz.id}'" style="cursor:pointer;">
          <h4>${biz.business_name}</h4>
          <p class="text-sm text-muted">${biz.primary_category || ''} ${location ? '• ' + location : ''}</p>
        </article>
      `;
    }

    if (businesses.length > 3) {
      html += `<div class="text-center mt-sm"><a href="/business_directory" class="btn btn-gold btn-small">View All ${businesses.length} Businesses</a></div>`;
    }

    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading church businesses:', error);
    container.innerHTML = '<p class="text-muted">Unable to load businesses at this time.</p>';
  }
}

async function loadForYouSection(userId, churchId) {
  const loadingEl = document.getElementById('forYouLoading');
  const listEl = document.getElementById('forYouList');
  const emptyEl = document.getElementById('forYouEmpty');

  try {
    const favoriteIds = new Set();
    const favoritesQuery = query(collection(db, "favorite_businesses"), where("user_id", "==", userId));
    const favoritesSnapshot = await getDocs(favoritesQuery);
    favoritesSnapshot.forEach(docSnap => {
      favoriteIds.add(docSnap.data().business_id);
    });

    const churchBusinessIds = new Set();
    if (churchId) {
      const churchBizQuery = query(collection(db, "business_listings_public"), where("church_id", "==", churchId));
      const churchBizSnapshot = await getDocs(churchBizQuery);
      churchBizSnapshot.forEach(docSnap => {
        churchBusinessIds.add(docSnap.id);
      });
    }

    const allBusinessIds = new Set([...favoriteIds, ...churchBusinessIds]);
    
    const proQueryString = query(collection(db, "business_listings_public"), where("pro_status", "==", "pro"));
    const proQueryBool = query(collection(db, "business_listings_public"), where("pro_status", "==", true));
    const [proSnapshotString, proSnapshotBool] = await Promise.all([
      getDocs(proQueryString),
      getDocs(proQueryBool)
    ]);
    proSnapshotString.forEach(docSnap => {
      allBusinessIds.add(docSnap.id);
    });
    proSnapshotBool.forEach(docSnap => {
      allBusinessIds.add(docSnap.id);
    });

    if (allBusinessIds.size === 0) {
      loadingEl.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    const businessMap = new Map();
    for (const bizId of allBusinessIds) {
      const bizDoc = await getDoc(doc(db, "business_listings_public", bizId));
      if (bizDoc.exists()) {
        const data = bizDoc.data();
        if (data.business_name) {
          businessMap.set(bizId, {
            id: bizId,
            ...data,
            isFavorite: favoriteIds.has(bizId),
            isChurchBusiness: churchBusinessIds.has(bizId),
            isPro: isBusinessPro(data)
          });
        }
      }
    }

    forYouData.all = Array.from(businessMap.values());
    forYouData.favoriteIds = favoriteIds;
    forYouData.churchBusinessIds = churchBusinessIds;

    renderForYouList('all');

    loadingEl.classList.add('hidden');
    listEl.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading For You section:', error);
    loadingEl.classList.add('hidden');
    emptyEl.textContent = 'Unable to load recommendations at this time.';
    emptyEl.classList.remove('hidden');
  }
}

function setupForYouFilter() {
  const filterSelect = document.getElementById('forYouFilter');
  if (!filterSelect) return;

  filterSelect.addEventListener('change', () => {
    renderForYouList(filterSelect.value);
  });
}

function renderForYouList(filter) {
  const listEl = document.getElementById('forYouList');
  const emptyEl = document.getElementById('forYouEmpty');

  if (!forYouData.all || forYouData.all.length === 0) {
    listEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }

  let sorted = [...forYouData.all];

  switch (filter) {
    case 'favorites':
      sorted.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return 0;
      });
      break;
    case 'church':
      sorted.sort((a, b) => {
        if (a.isChurchBusiness && !b.isChurchBusiness) return -1;
        if (!a.isChurchBusiness && b.isChurchBusiness) return 1;
        return 0;
      });
      break;
    case 'pro':
      sorted.sort((a, b) => {
        if (a.isPro && !b.isPro) return -1;
        if (!a.isPro && b.isPro) return 1;
        return 0;
      });
      break;
    default:
      sorted.sort((a, b) => {
        const scoreA = (a.isFavorite ? 3 : 0) + (a.isChurchBusiness ? 2 : 0) + (a.isPro ? 1 : 0);
        const scoreB = (b.isFavorite ? 3 : 0) + (b.isChurchBusiness ? 2 : 0) + (b.isPro ? 1 : 0);
        return scoreB - scoreA;
      });
  }

  const displayList = sorted.slice(0, 6);

  let html = '';
  for (const biz of displayList) {
    const badges = [];
    if (biz.isFavorite) badges.push('<span title="Saved Favorite">⭐</span>');
    if (biz.isChurchBusiness) badges.push('<span title="Your Church">🏠</span>');
    if (biz.isPro) badges.push('<span class="badge badge-gold" style="font-size:0.7em;" title="Pro Business">PRO</span>');

    const location = `${biz.city || ''}, ${biz.state || ''}`.trim().replace(/^,|,$/g, '');

    html += `
      <article class="card card-clickable" onclick="window.location.href='/business?id=${biz.id}'" style="cursor:pointer;">
        <div class="flex-between" style="align-items:flex-start;">
          <div>
            <h4 style="margin-bottom:4px;">${biz.business_name}</h4>
            <p class="text-sm text-muted" style="margin-bottom:8px;">${biz.primary_category || ''} ${location ? '• ' + location : ''}</p>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">${badges.join('')}</div>
        </div>
      </article>
    `;
  }

  if (sorted.length > 6) {
    html += `<div class="text-center mt-sm"><a href="/business_directory" class="btn btn-gold btn-small">View More</a></div>`;
  }

  listEl.innerHTML = html;
  listEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');
}
