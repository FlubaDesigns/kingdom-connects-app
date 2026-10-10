/* Kingdom Connects - Homepage Enhancements */
import { db } from './firebase-config.js';
import { onReady } from './dom-ready.js';
import { collection, query, where, getDocs, getDoc, doc, limit, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthChange } from './auth/access-control.js';
import { showStatusMessage } from './utils.js';
import { toggleFavorite } from './favorites-service.js';
import { isBusinessPro } from './role-utils.js';

// Import loading skeleton utilities
import './loading-skeletons.js';

// Move action cards to desktop slot on desktop screens
(function() {
  const cards = document.getElementById('actionCardsCluster');
  const desktopSlot = document.getElementById('desktopActionSlot');
  const mobileSlot = document.getElementById('mobileActionSlot');
  if (!cards || !desktopSlot) return;
  
  const mq = window.matchMedia('(min-width: 769px)');
  function moveCards() {
    if (mq.matches && desktopSlot) {
      desktopSlot.appendChild(cards);
      cards.classList.add('action-cards-desktop');
    } else if (mobileSlot) {
      mobileSlot.appendChild(cards);
      cards.classList.remove('action-cards-desktop');
    }
  }
  moveCards();
  mq.addEventListener('change', moveCards);
})();

// Track current user and favorites
let currentUser = null;
let userFavorites = new Set();

onAuthChange(async (user) => {
  currentUser = user;
  if (user) {
    await loadUserFavorites(user.uid);
  } else {
    userFavorites.clear();
  }
  // Re-render featured businesses with correct auth state
  loadFeaturedBusinesses();
});

async function loadUserFavorites(userId) {
  try {
    const q = query(collection(db, "favorite_businesses"), where("user_id", "==", userId));
    const snapshot = await getDocs(q);
    userFavorites.clear();
    snapshot.forEach(doc => {
      userFavorites.add(doc.data().business_id);
    });
  } catch (error) {
    console.error("Error loading favorites:", error);
  }
}

function updateFeaturedStars() {
  document.querySelectorAll('.featured-star').forEach(btn => {
    const bizId = btn.dataset.businessId;
    const starOutline = btn.querySelector('.star-outline');
    const starFilled = btn.querySelector('.star-filled');
    if (starOutline && starFilled) {
      if (userFavorites.has(bizId)) {
        starOutline.classList.add('hidden');
        starFilled.classList.remove('hidden');
        btn.title = 'Remove from favorites';
      } else {
        starOutline.classList.remove('hidden');
        starFilled.classList.add('hidden');
        btn.title = 'Save to favorites';
      }
    }
  });
}

function attachFeaturedStarListeners() {
  document.querySelectorAll('.featured-star').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!currentUser) return;
      
      const bizId = btn.dataset.businessId;
      const result = await toggleFavorite(currentUser.uid, bizId);
      
      if (result.success) {
        const wasAlreadyFavorited = userFavorites.has(bizId);
        
        if (wasAlreadyFavorited) {
          userFavorites.delete(bizId);
        } else {
          userFavorites.add(bizId);
        }
        
        const starOutline = btn.querySelector('.star-outline');
        const starFilled = btn.querySelector('.star-filled');
        if (userFavorites.has(bizId)) {
          starOutline.classList.add('hidden');
          starFilled.classList.remove('hidden');
          btn.title = 'Remove from favorites';
          showFavoriteToast('Added to favorites!');
        } else {
          starOutline.classList.remove('hidden');
          starFilled.classList.add('hidden');
          btn.title = 'Save to favorites';
          showFavoriteToast('Removed from favorites');
        }
      }
    });
  });
}

function showFavoriteToast(message) {
  let toast = document.getElementById('favoriteToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'favoriteToast';
    toast.className = 'favorite-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// ========== LOGOUT SUCCESS MESSAGE ==========
function checkLogoutStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('logout') === 'success') {
    const statusEl = document.getElementById('pageStatus');
    if (statusEl) {
      showStatusMessage(statusEl, '✓ You have been logged out successfully', 'success');
      // Remove parameter from URL without page reload
      const url = new URL(window.location);
      url.searchParams.delete('logout');
      window.history.replaceState({}, '', url);
      // Auto-hide after 5 seconds
      setTimeout(() => {
        statusEl.classList.add('hidden');
      }, 5000);
    }
  }
}

// Check logout status immediately
checkLogoutStatus();

// ========== LIVE STATS ==========
async function loadStats() {
  const businessEl = document.getElementById('statsBusinesses');
  const churchEl = document.getElementById('statsChurches');
  const tithedEl = document.getElementById('statsTithed');
  
  try {
    // Query only visible listings from public collection
    const businessQuery = query(collection(db, 'business_listings_public'), where('is_visible', '==', true));
    const churchQuery = query(collection(db, 'churches'), where('listing_status', '==', 'active'));
    
    const businessesSnap = await getDocs(businessQuery);
    const churchesSnap = await getDocs(churchQuery);
    
    const businessCount = businessesSnap.size;
    const churchCount = churchesSnap.size;
    
    // Tithed amount will be real once Stripe payments are integrated
    const tithedAmount = 0;
    
    if (businessEl) businessEl.textContent = businessCount.toLocaleString();
    if (churchEl) churchEl.textContent = churchCount.toLocaleString();
    if (tithedEl) tithedEl.textContent = '$' + tithedAmount.toLocaleString();
    
  } catch (error) {
    console.error('❌ Error loading stats:', error);
    
    // Show 0 on error
    if (businessEl) businessEl.textContent = '0';
    if (churchEl) churchEl.textContent = '0';
    if (tithedEl) tithedEl.textContent = '$0';
  }
}

// ========== FEATURED PRO BUSINESSES ==========
async function loadFeaturedBusinesses() {
  const container = document.getElementById('featuredBusinesses');
  const section = document.getElementById('featuredSection');
  if (!container || !section) return;
  
  // Show skeleton while loading
  if (window.showSkeletons) {
    window.showSkeletons('featuredBusinesses', 'business', 6);
  }
  
  try {
    // Query for featured businesses from public collection
    const q = query(
      collection(db, 'business_listings_public'),
      where('is_featured', '==', true)
    );
    
    const snapshot = await getDocs(q);
    
    // Hide section if no featured businesses
    if (snapshot.empty) {
      section.classList.add('hidden');
      return;
    }
    
    // Sort and limit client-side
    let businesses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    businesses.sort((a, b) => {
      const aTime = a.created_at?.seconds || 0;
      const bTime = b.created_at?.seconds || 0;
      return bTime - aTime;
    });
    businesses = businesses.slice(0, 6);
    
    const content = businesses.map(biz => {
      const rating = biz.average_rating || 0;
      const stars = '⭐'.repeat(Math.round(rating));
      const isFavorited = userFavorites.has(biz.id);
      
      // Favorite star HTML - only show for logged in users
      const favoriteStarHTML = currentUser ? `
        <button class="featured-star favorite-star-card" data-business-id="${biz.id}" title="${isFavorited ? 'Remove from favorites' : 'Save to favorites'}">
          <svg class="star-icon star-outline ${isFavorited ? 'hidden' : ''}" viewBox="0 0 24 24" width="24" height="24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" stroke="#d4af37" stroke-width="2"/>
          </svg>
          <svg class="star-icon star-filled ${isFavorited ? '' : 'hidden'}" viewBox="0 0 24 24" width="24" height="24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#d4af37" stroke="#d4af37" stroke-width="2"/>
          </svg>
        </button>
      ` : '';
      
      return `
        <div class="business-card" data-business-id="${biz.id}" data-action="viewBusiness">
          <div class="flex-between mb-sm">
            <h3 class="gold">${biz.business_name || 'Business'}</h3>
            <span class="pro-badge">PRO</span>
          </div>
          <p class="text-muted">${biz.primary_category || 'Uncategorized'}</p>
          <p>${(biz.description || '').substring(0, 100)}${biz.description?.length > 100 ? '...' : ''}</p>
          <div class="flex-between mt-md">
            <span>${stars || '☆☆☆☆☆'}</span>
            <div class="text-right">
              ${favoriteStarHTML}
              <div><span class="gold">View Details →</span></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    // Hide skeletons and show content
    if (window.hideSkeletons) {
      window.hideSkeletons('featuredBusinesses', content);
    } else {
      container.innerHTML = content;
    }
    
    section.classList.remove('hidden'); // Show section when businesses exist
    
    // Attach favorite star listeners
    attachFeaturedStarListeners();
    
  } catch (error) {
    console.error('Error loading featured businesses:', error);
    section.classList.add('hidden'); // Hide on error
  }
}

// ========== NEWSLETTER SIGNUP ==========
const newsletterForm = document.getElementById('newsletterForm');
if (newsletterForm) {
  newsletterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    
    // TODO: Integrate with email service (Mailchimp, SendGrid, etc.)
    window.showToast(`Thanks for subscribing! We'll send updates to ${email}`, 'success');
    e.target.reset();
  });
}

// ========== STICKY HEADER ==========
const header = document.querySelector('.site-header');
if (header) {
  header.classList.add('sticky');
}

// ========== FLOATING BACK TO TOP BUTTON ==========
function addFloatingBackToTop() {
  const btn = document.createElement('a');
  btn.href = '#top';
  btn.className = 'back-to-top-float';
  btn.innerHTML = '↑';
  btn.setAttribute('aria-label', 'Back to top');
  document.body.appendChild(btn);
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  });
  
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ========== CATEGORY ICONS MAPPING ==========
const categoryIcons = {
  'auto-repair': '🔧',
  'construction': '🏗️',
  'real-estate': '🏠',
  'lawn-care': '🌱',
  'plumbing': '🚰',
  'electrical': '⚡',
  'hvac': '❄️',
  'cleaning': '✨',
  'roofing': '🏠',
  'painting': '🎨',
  'landscaping': '🌳',
  'pest-control': '🐜',
  'handyman': '🔨',
  'flooring': '📐',
  'moving': '📦',
  'carpentry': '🪚',
  'masonry': '🧱',
  'welding': '🔥',
  'default': '💼'
};

// ========== BROWSE BY CATEGORY (Dynamic) ==========
async function loadCategories() {
  const container = document.getElementById('categoryGrid');
  const section = document.getElementById('categorySection');
  if (!container || !section) return;
  
  try {
    // Simple query - no index needed
    const categoriesQuery = query(
      collection(db, 'categories'),
      where('status', '==', 'active')
    );
    
    const snapshot = await getDocs(categoriesQuery);
    
    // Only show section if categories exist
    if (snapshot.empty) {
      section.classList.add('hidden');
      return;
    }
    
    // Sort and limit client-side
    let categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    categories.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    categories = categories.slice(0, 7);
    
    const content = categories.map(cat => {
      const slug = cat.slug || cat.id;
      const icon = categoryIcons[slug] || categoryIcons['default'];
      const name = cat.name || cat.id;
      
      return `
        <a href="business_directory.html?category=${slug}" class="category-tile">
          <div class="category-icon">${icon}</div>
          <div class="category-name">${name}</div>
        </a>
      `;
    }).join('');
    
    container.innerHTML = content;
    section.classList.remove('hidden'); // Show section only when categories exist
    
  } catch (error) {
    console.error('❌ Error loading categories:', error);
    section.classList.add('hidden'); // Hide on error
  }
}

// ========== UPDATE CTA BLOCKS FOR LOGGED-IN USERS ==========
async function updateCtaBlocksForUser(user) {
  const findChurchBlock = document.getElementById('findChurchBlock');
  const becomeMemberBlock = document.getElementById('becomeMemberBlock');
  const joinMinistryBlock = document.getElementById('joinMinistryBlock');
  
  if (!user) {
    // Not logged in - show all CTA blocks
    if (findChurchBlock) findChurchBlock.classList.remove('hidden');
    if (becomeMemberBlock) becomeMemberBlock.classList.remove('hidden');
    if (joinMinistryBlock) joinMinistryBlock.classList.remove('hidden');
    return;
  }
  
  // User is logged in - hide "Become a Member" and "Join Our Ministry"
  if (becomeMemberBlock) becomeMemberBlock.classList.add('hidden');
  if (joinMinistryBlock) joinMinistryBlock.classList.add('hidden');
  
  // Check if user has a church set OR is a church admin - if so, hide "Find Your Church"
  try {
    // Check user profile for home_church_id
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.home_church_id) {
        if (findChurchBlock) findChurchBlock.classList.add('hidden');
        return;
      }
    }
    
    // Also check if user is a church admin
    const churchQuery = query(
      collection(db, 'churches'),
      where('admin_uid', '==', user.uid),
      limit(1)
    );
    const churchSnap = await getDocs(churchQuery);
    if (!churchSnap.empty) {
      // User is a church admin - hide "Find Your Church"
      if (findChurchBlock) findChurchBlock.classList.add('hidden');
    }
  } catch (error) {
    console.error('Error checking user church:', error);
  }
}

// ========== UNIFIED ROLE DASHBOARDS ==========
async function loadRoleDashboards(user) {
  console.log('📊 loadRoleDashboards called, user:', user?.email || 'null');
  const dashboardSection = document.getElementById('roleDashboardsSection');
  const dashboardList = document.getElementById('roleDashboardsList');
  const loginPromptSection = document.getElementById('loginPromptSection');
  console.log('📊 Dashboard elements - section:', !!dashboardSection, 'list:', !!dashboardList);

  if (!user) {
    // Not logged in - hide dashboards, show login prompt
    if (dashboardSection) dashboardSection.classList.add('hidden');
    if (loginPromptSection) loginPromptSection.classList.remove('hidden');
    console.log('📊 No user, hiding dashboard section');
    return;
  }

  // User is logged in - hide login prompt
  if (loginPromptSection) loginPromptSection.classList.add('hidden');

  try {
    // Query user profile, businesses, and churches in parallel
    const [userDoc, businessSnap, churchSnap] = await Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      getDocs(query(collection(db, 'business_listings_private'), where('owner_uid', '==', user.uid))),
      getDocs(query(collection(db, 'churches'), where('admin_uid', '==', user.uid)))
    ]);
    
    console.log('📊 Business query result:', businessSnap.size, 'businesses found for UID:', user.uid);

    // Check user roles
    let isAdmin = false;
    let isSales = false;
    let isMarketing = false;
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const roles = userData.roles || [];
      isAdmin = roles.includes('admin') || roles.includes('platform_admin');
      isSales = roles.includes('sales_agent') || roles.includes('sales_director') || isAdmin;
      isMarketing = roles.includes('marketing_manager') || isAdmin;
    }

    // Build role cards array - 2x2 action-card format
    const cards = [];

    // Helper to create action-card HTML
    const makeCard = (href, icon, title) => `
      <a href="${href}" class="action-card">
        <div class="action-card-icon">
          ${icon}
        </div>
        <div class="action-card-title">${title}</div>
      </a>
    `;

    // SVG icons for each dashboard type
    const icons = {
      member: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      business: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
      church: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
      sales: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      marketing: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
      admin: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
    };

    // 1. Member dashboard (everyone logged in gets this)
    cards.push(makeCard('/member/', icons.member, 'Member'));

    // 2. Business dashboards (one per business owned)
    businessSnap.docs.forEach(docSnap => {
      const biz = docSnap.data();
      const name = biz.business_name || 'Business';
      const isPro = isBusinessPro(biz);
      cards.push(makeCard(`/business-admin/?id=${docSnap.id}`, icons.business, name + (isPro ? ' Pro' : '')));
    });

    // 2b. For admins without their own business, don't show broken link
    // They can manage all businesses from the Admin dashboard

    // 3. Church dashboard (if user admins any church)
    if (!churchSnap.empty) {
      const firstChurch = churchSnap.docs[0];
      cards.push(makeCard(`/church-admin/?id=${firstChurch.id}`, icons.church, 'Church'));
    } else if (isAdmin) {
      cards.push(makeCard('/church-admin/', icons.church, 'Church'));
    }

    // 4. Sales dashboard (for sales agents/directors and admins)
    if (isSales) {
      cards.push(makeCard('/sales/', icons.sales, 'Sales'));
    }

    // 5. Marketing dashboard (for marketing managers and admins)
    if (isMarketing) {
      cards.push(makeCard('/marketing-manager/', icons.marketing, 'Marketing'));
    }

    // 6. Admin dashboard (only for platform admins)
    if (isAdmin) {
      cards.push(makeCard('/admin/', icons.admin, 'Admin'));
    }

    // Render all cards directly (parent already has grid styling)
    if (dashboardList) {
      dashboardList.innerHTML = cards.join('');
    }

    // Show dashboard section
    if (dashboardSection) {
      dashboardSection.classList.remove('hidden');
      console.log('📊 Dashboard section shown with', cards.length, 'cards');
    }

  } catch (error) {
    console.error('❌ Error loading role dashboards:', error);
    // On error, still show member dashboard as action-card
    if (dashboardList) {
      dashboardList.innerHTML = `
        <a href="member/index.html" class="action-card">
          <div class="action-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div class="action-card-title">Member</div>
        </a>
      `;
    }
    if (dashboardSection) dashboardSection.classList.remove('hidden');
  }
}

// ========== MOBILE CATEGORY CHIPS (Dynamic) ==========
async function loadCategoryChips() {
  const container = document.getElementById('categoryChips');
  const section = document.getElementById('categoryChipsSection');
  if (!container || !section) return;

  try {
    // Get visible businesses with a category from public collection
    const businessQuery = query(
      collection(db, 'business_listings_public'),
      where('is_visible', '==', true)
    );
    const snapshot = await getDocs(businessQuery);
    
    if (snapshot.empty) return;

    // Get unique categories (if not null)
    const categories = new Set();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const category = data.primary_category || data.category;
      if (category) categories.add(category);
    });

    if (categories.size === 0) return;

    // Build chips - alphabetical, limit to 6
    const chips = [...categories]
      .sort()
      .slice(0, 6)
      .map(cat => `<a href="business_directory.html?category=${encodeURIComponent(cat)}" class="category-chip">${cat}</a>`);

    chips.push('<a href="business_directory.html" class="category-chip category-chip-more">More...</a>');

    container.innerHTML = chips.join('');
    section.classList.remove('hidden');

  } catch (error) {
    console.error('Error loading category chips:', error);
  }
}

// ========== INITIALIZE ==========
onReady(() => {
  loadStats();
  loadFeaturedBusinesses();
  loadCategories();
  loadCategoryChips();
  addFloatingBackToTop();
  setupAccordions();
  setupBottomNav();
  
  // Set default logged-out state immediately
  loadRoleDashboards(null);
  
  // Load role dashboards and update CTAs when auth state changes
  onAuthChange((user) => {
    loadRoleDashboards(user);
    updateCtaBlocksForUser(user);
    updateBottomNavForUser(user);
  });
});

// ========== ACCORDION TOGGLE ==========
function setupAccordions() {
  const accordionHeaders = document.querySelectorAll('.accordion-header');
  accordionHeaders.forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('open');
    });
  });
}


// ========== BOTTOM NAV ==========
function setupBottomNav() {
  const currentPath = window.location.pathname;
  const navItems = document.querySelectorAll('.bottom-nav-item');
  
  navItems.forEach(item => {
    item.classList.remove('active');
    const href = item.getAttribute('href');
    if (href === currentPath || (href === '/' && (currentPath === '/' || currentPath === '/index.html'))) {
      item.classList.add('active');
    }
  });
}

function updateBottomNavForUser(user) {
  const accountLink = document.getElementById('bottomNavAccount');
  if (!accountLink) return;
  
  if (user) {
    accountLink.href = '/member/';
    accountLink.querySelector('span').textContent = 'Account';
  } else {
    accountLink.href = '/login';
    accountLink.querySelector('span').textContent = 'Login';
  }
}

// Event delegation for dynamically created business cards
document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-action="viewBusiness"]');
  if (card) {
    const businessId = card.getAttribute('data-business-id');
    window.location.href = `/business?id=${businessId}`;
  }
});
