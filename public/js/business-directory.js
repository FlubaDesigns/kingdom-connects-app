/* Kingdom Connects - Business Directory Logic */
import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthChange } from './auth/access-control.js';
import { loadCategories, populateCategoryDropdown } from './services/category-service.js';
import { checkIfFavorited, toggleFavorite } from './favorites-service.js';
import analytics from './services/analytics-service.js';
import { isBusinessPro } from './role-utils.js';

const businessList = document.getElementById("businessList");
const resultCount = document.getElementById("resultCount");

// Filter elements
const filterCategory = document.getElementById("filterCategory");
const filterChurch = document.getElementById("filterChurch");
const filterRating = document.getElementById("filterRating");
const filterState = document.getElementById("filterState");
const filterCity = document.getElementById("filterCity");
const filterZip = document.getElementById("filterZip");
const filterName = document.getElementById("filterName");
const clearFiltersBtn = document.getElementById("clearFilters");

let allBusinesses = [];
let allChurches = [];
let currentUser = null;
let userFavorites = new Set();
let currentView = 'cards'; // 'cards' or 'list'

// View toggle elements
const viewCardsBtn = document.getElementById("viewCards");
const viewListBtn = document.getElementById("viewList");

onAuthChange(async (user) => {
  currentUser = user;
  if (user) {
    await loadUserFavorites(user.uid);
    updateAllFavoriteStars();
  } else {
    userFavorites.clear();
    updateAllFavoriteStars();
  }
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

function updateAllFavoriteStars() {
  document.querySelectorAll('.favorite-star-card').forEach(btn => {
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

// ------- helpers -------
const H = (strings, ...vals) => strings.map((s,i)=>s+(vals[i]??"")).join("");

function safe(v){ return (v || "").toString().trim(); }

// UPDATED: robust URL normalizer to allow plain domains
function cleanUrl(u){
  const s = safe(u).replace(/\s+/g, "");
  if (!s) return "";
  try {
    const hasScheme = /^https?:\/\//i.test(s);
    const url = new URL(hasScheme ? s : "https://" + s);
    return url.href; // always absolute
  } catch (e) {
    return ""; // if malformed, render nothing
  }
}

function showSkeleton(n=4){
  businessList.innerHTML = Array.from({length:n})
    .map(()=>'<div class="skeleton" aria-hidden="true"></div>').join('');
}

function renderBusinesses(data) {
  if (!data.length) {
    businessList.innerHTML = window.createEmptyState(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>',
      'No businesses found',
      'Try adjusting your filters or search a different keyword.',
      'Clear Filters',
      '#'
    );
    businessList.querySelector('.btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      clearFilters();
    });
    return;
  }
  
  data.forEach(biz => {
    analytics.trackImpression(biz.id);
  });
  
  businessList.innerHTML = data.map(biz => {
    const name = safe(biz.business_name) || "Unnamed Business";
    const desc = safe(biz.description) || "No description provided.";
    const cat  = safe(biz.primary_category);
    const city = safe(biz.city);
    const state = safe(biz.state);
    const phone = safe(biz.phone_number);
    const website = safe(biz.website_url);
    const isPro = isBusinessPro(biz);
    const logo = biz.logo || '';
    const rating = parseFloat(biz.average_rating) || 0;
    const reviewCount = parseInt(biz.review_count) || 0;
    
    // Get church name
    const churchId = biz.church_id;
    const church = allChurches.find(c => c.id === churchId);
    const churchName = church ? (church.church_name || church.name) : null;

    // Star rating display
    const stars = rating > 0 ? '⭐'.repeat(Math.round(rating)) : '';
    const ratingHTML = rating > 0 
      ? H`<span class="gold-lg">${stars}</span> <span class="rating-count">(${rating.toFixed(1)})</span>`
      : '<span class="no-reviews">No reviews yet</span>';

    // Pro badge
    const proBadge = isPro 
      ? H`<span class="pro-badge-gradient">PRO</span>`
      : '';

    // Location
    const locationParts = [];
    if (city) locationParts.push(city);
    if (state) locationParts.push(state);
    const location = locationParts.length > 0 ? locationParts.join(', ') : '';

    // Location line only - category is shown in header
    const metaLine = location;
    
    // Categories for header - primary + subcategories
    const subcats = biz.secondary_categories || [];
    const allCardCats = [cat, ...subcats].filter(Boolean).join(', ');
    
    // Address
    const address = safe(biz.address) || '';
    
    // Church badge for upper right
    const churchCornerBadge = churchName
      ? H`<div class="church-corner-badge"><span class="church-label">Church</span><span class="church-name">⛪ ${churchName}</span></div>`
      : '';

    // Contact buttons - respect privacy controls
    const showPhone = biz.show_phone !== false;
    const showWebsite = biz.show_website !== false;
    
    const phoneBtn = phone && showPhone
      ? H`<a href="tel:${phone}" class="contact-btn link-badge hide-desktop">📞 Call</a><a href="tel:${phone}" class="contact-phone hide-mobile">📞 ${phone}</a>`
      : '';

    const siteHref = website ? cleanUrl(website) : "";
    const websiteBtn = siteHref && showWebsite
      ? H`<a href="${siteHref}" target="_blank" rel="noopener" class="contact-btn link-badge">🌐 Website</a>`
      : '';

    const churchBadge = churchName
      ? H`<span class="inline-flex-sm">⛪ ${churchName}</span>`
      : '';

    // Card styling - Pro gets gold border, all cards get rounded border
    const cardClass = isPro ? 'business-card pro-card-border' : 'business-card';

    // Favorite star - only show for logged in users
    const isFavorited = userFavorites.has(biz.id);
    const favoriteStarHTML = currentUser ? H`
      <button class="favorite-star-card" data-business-id="${biz.id}" title="${isFavorited ? 'Remove from favorites' : 'Save to favorites'}">
        <svg class="star-icon star-outline ${isFavorited ? 'hidden' : ''}" viewBox="0 0 24 24" width="28" height="28">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" stroke="#d4af37" stroke-width="2"/>
        </svg>
        <svg class="star-icon star-filled ${isFavorited ? '' : 'hidden'}" viewBox="0 0 24 24" width="28" height="28">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#d4af37" stroke="#d4af37" stroke-width="2"/>
        </svg>
      </button>
    ` : '';

    const cardLogoHTML = logo 
      ? `<img src="${logo}" alt="" class="business-card-logo">`
      : `<div class="business-card-logo-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg></div>`;

    return H`
      <div class="rounded-border">
        <div class="${cardClass}">
          <div class="business-card-top">
            <div class="business-card-header">
              ${cardLogoHTML}
              <div class="business-card-header-info">
                <h3 class="biz-title m-0">${name}${proBadge}</h3>
                ${allCardCats ? `<div class="business-card-cats">${allCardCats}</div>` : ''}
              </div>
            </div>
            ${churchCornerBadge}
          </div>
          ${(address || location) ? `<div class="business-card-address">${address || location}</div>` : ''}
          <div class="business-card-desc-row">
            <p class="business-card-desc">${desc}</p>
            ${phone && showPhone ? `<a href="tel:${phone}" class="business-card-phone hide-mobile">📞 ${phone}</a>` : ''}
          </div>

          <div class="flex-gap-sm">
            ${phone && showPhone ? `<a href="tel:${phone}" class="contact-btn link-badge hide-desktop">📞 Call</a>` : ''}
            ${websiteBtn}
          </div>

          <div class="flex-between-center mt-sm">
            <a href="business.html?${(biz.slug && biz.slug.trim()) ? `slug=${biz.slug}` : `id=${biz.id}`}" class="btn btn-gold flex-1">View Details</a>
            ${favoriteStarHTML}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  attachFavoriteListeners();
}

function attachFavoriteListeners() {
  document.querySelectorAll('.favorite-star-card').forEach(btn => {
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

function renderListView(data) {
  if (!data.length) {
    businessList.innerHTML = window.createEmptyState(
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>',
      'No businesses found',
      'Try adjusting your filters or search a different keyword.',
      'Clear Filters',
      '#'
    );
    businessList.querySelector('.btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      clearFilters();
    });
    return;
  }

  businessList.innerHTML = `<div class="business-list-view">${data.map(biz => {
    const name = safe(biz.business_name) || "Unnamed Business";
    const desc = safe(biz.description) || "";
    const cat = safe(biz.primary_category);
    const city = safe(biz.city);
    const state = safe(biz.state);
    const isPro = isBusinessPro(biz);
    const rating = parseFloat(biz.average_rating) || 0;
    const logo = biz.logo || '';
    const address = safe(biz.address) || '';

    const location = [city, state].filter(Boolean).join(', ');
    const stars = rating > 0 ? '⭐'.repeat(Math.round(rating)) : '';
    const ratingText = rating > 0 ? `${stars} ${rating.toFixed(1)}` : 'No rating';
    const proBadge = isPro ? '<span class="pro-badge-gradient">PRO</span>' : '';
    const itemClass = isPro ? 'business-list-item pro-list-item' : 'business-list-item';
    const viewUrl = (biz.slug && biz.slug.trim()) ? `business.html?slug=${biz.slug}` : `business.html?id=${biz.id}`;
    
    const logoHTML = logo 
      ? `<img src="${logo}" alt="" class="business-list-logo">`
      : `<div class="business-list-logo-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg></div>`;
    
    // Only subcategories to avoid duplicate with primary in metaLine
    const subcats = biz.secondary_categories || [];
    const allCats = subcats.length > 0 ? subcats.join(', ') : '';

    return H`
      <a href="${viewUrl}" class="${itemClass}">
        ${logoHTML}
        <div class="business-list-info">
          <div class="business-list-name">${name}${proBadge}</div>
          <div class="business-list-cats">${cat}${allCats ? ', ' + allCats : ''}</div>
        </div>
        <div class="business-list-address">${address || location}</div>
        <div class="business-list-desc">${desc}</div>
        <div class="business-list-rating">${ratingText}</div>
      </a>
    `;
  }).join('')}</div>`;
}

function setView(view) {
  currentView = view;
  if (viewCardsBtn && viewListBtn) {
    viewCardsBtn.classList.toggle('active', view === 'cards');
    viewListBtn.classList.toggle('active', view === 'list');
  }
  applyFilters();
}

// View toggle event listeners
if (viewCardsBtn) {
  viewCardsBtn.addEventListener('click', () => setView('cards'));
}
if (viewListBtn) {
  viewListBtn.addEventListener('click', () => setView('list'));
}

// Mobile collapsible filter toggle
const filterToggle = document.getElementById('filterToggle');
const filterContent = document.getElementById('filterContent');

if (filterToggle && filterContent) {
  // Handle both click and touch events for better mobile support
  const toggleFilter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isExpanded = filterToggle.getAttribute('aria-expanded') === 'true';
    filterToggle.setAttribute('aria-expanded', !isExpanded);
    filterContent.classList.toggle('open', !isExpanded);
  };
  
  filterToggle.addEventListener('click', toggleFilter);
  filterToggle.addEventListener('touchend', toggleFilter);
}

async function loadData() {
  try {
    showSkeleton();
    
    // Load businesses, churches, and categories in parallel
    const [bizSnapshot, churchSnapshot, categories] = await Promise.all([
      getDocs(query(collection(db, "business_listings_public"), where("is_visible", "==", true))),
      getDocs(collection(db, "churches")),
      loadCategories()
    ]);
    
    allBusinesses = bizSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allChurches = churchSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(church => church.listing_status === 'active');
    const activeChurchIds = new Set(allChurches.map(church => church.id));
    allBusinesses = allBusinesses.filter(business => activeChurchIds.has(business.church_id));
    
    // Populate church dropdown
    allChurches.forEach(church => {
      const option = document.createElement('option');
      option.value = church.id;
      option.textContent = church.church_name || church.name || 'Unnamed Church';
      filterChurch.appendChild(option);
    });
    
    // Populate category filter dropdown using shared service with hierarchical display
    // Categories already loaded via Promise.all above
    populateCategoryDropdown(filterCategory, {
      includeAllOption: true,
      allOptionText: 'All Categories',
      hierarchical: true
    });
    
    // Check for URL parameters to pre-select filters
    const urlParams = new URLSearchParams(window.location.search);
    const churchIdParam = urlParams.get('church_id');
    const categoryParam = urlParams.get('category');
    const searchQuery = urlParams.get('q'); // Homepage search query
    
    if (churchIdParam) {
      filterChurch.value = churchIdParam;
    }
    
    if (categoryParam) {
      filterCategory.value = categoryParam;
    }
    
    // Homepage search: pre-fill the name/keyword search field
    if (searchQuery) {
      filterName.value = searchQuery;
    }
    
    // Apply filters if any URL parameters were set, otherwise show all
    if (churchIdParam || categoryParam || searchQuery) {
      applyFilters();
    } else {
      displayBusinesses(allBusinesses);
    }
    
    // Add filter event listeners
    filterCategory.addEventListener("change", applyFilters);
    filterChurch.addEventListener("change", applyFilters);
    filterRating.addEventListener("change", applyFilters);
    filterState.addEventListener("change", applyFilters);
    filterCity.addEventListener("input", debounce(applyFilters, 300));
    filterZip.addEventListener("input", debounce(applyFilters, 300));
    filterName.addEventListener("input", debounce(applyFilters, 300));
    clearFiltersBtn.addEventListener("click", clearFilters);
    
  } catch (error) {
    console.error("🔥 Error loading data:", error);
    businessList.innerHTML = '<div class="error-box">⚠️ Error loading businesses. Please try again.</div>';
  }
}

function applyFilters() {
  const filters = {
    category: filterCategory.value.toLowerCase(),
    churchId: filterChurch.value,
    rating: parseFloat(filterRating.value) || 0,
    state: filterState.value.toUpperCase(),
    city: filterCity.value.toLowerCase().trim(),
    zip: filterZip.value.trim(),
    name: filterName.value.toLowerCase().trim()
  };

  const filtered = allBusinesses.filter(biz => {
    // Category filter - check primary_category and subcategories
    if (filters.category) {
      const primaryCat = (biz.primary_category || '').toLowerCase();
      const subcats = (biz.subcategories || []).map(c => c.toLowerCase());
      if (primaryCat !== filters.category && !subcats.includes(filters.category)) {
        return false;
      }
    }

    // Church filter
    if (filters.churchId && biz.church_id !== filters.churchId) {
      return false;
    }

    // Rating filter (average_rating >= minimum)
    if (filters.rating > 0) {
      const bizRating = parseFloat(biz.average_rating) || 0;
      if (bizRating < filters.rating) {
        return false;
      }
    }

    // State filter
    if (filters.state && 
        (!biz.state || biz.state.toUpperCase() !== filters.state)) {
      return false;
    }

    // City filter (partial match)
    if (filters.city && 
        (!biz.city || !biz.city.toLowerCase().includes(filters.city))) {
      return false;
    }

    // ZIP filter (exact match)
    if (filters.zip && biz.zip_code !== filters.zip) {
      return false;
    }

    // Name filter (partial match)
    if (filters.name) {
      const bizName = safe(biz.business_name).toLowerCase();
      if (!bizName.includes(filters.name)) {
        return false;
      }
    }

    return true;
  });

  displayBusinesses(filtered);
}

function displayBusinesses(businesses) {
  if (!businesses.length) {
    businessList.innerHTML = `
      <div class="status-message empty">
        <p class="text-lg">No businesses match your search criteria.</p>
        <p class="text-md">Try adjusting your filters or clearing them.</p>
      </div>
    `;
    resultCount.textContent = "0 businesses found";
    return;
  }

  // CHRONOLOGICAL SORTING: First in = first shown (oldest first)
  // Pro features remain functional, but no placement priority
  const sortedBusinesses = [...businesses].sort((a, b) => {
    const aTime = a.created_at?.seconds || 0;
    const bTime = b.created_at?.seconds || 0;
    return aTime - bTime;
  });

  resultCount.textContent = `${businesses.length} business${businesses.length === 1 ? '' : 'es'} found`;
  
  if (currentView === 'list') {
    renderListView(sortedBusinesses);
  } else {
    renderBusinesses(sortedBusinesses);
  }
}

function clearFilters() {
  filterCategory.value = "";
  filterChurch.value = "";
  filterRating.value = "";
  filterState.value = "";
  filterCity.value = "";
  filterZip.value = "";
  filterName.value = "";
  displayBusinesses(allBusinesses);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

loadData();
